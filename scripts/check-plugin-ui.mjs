#!/usr/bin/env node
// Guard for plugin UI. Run from anywhere:
//   node scripts/check-plugin-ui.mjs
//   npm --prefix frontend run check:plugin-ui
//
// A plugin's theme.css is a COPY of frontend/src/styles/tokens.css + app.css —
// it cannot be imported, because plugin files sit outside the frontend root.
// This script is what stops that copy from drifting, and it turns the iron
// rules that used to be prose only (AGENTS.md, README.md) into build errors.
//
// Checks, per plugins/<name>/frontend/*:
//   1. no import from frontend/src          — plugin must be self-contained
//   2. no @tanstack import                  — react-only, out-of-root
//   3. no hex colour literal in a source    — use a design token
//   4. no inline style carrying a real colour (var(--token) is fine)
//   5. `export const routes` present         — plugin_registry.ts reads it
//   6. core class names used => ship ./theme.css, and every --token in it must
//      equal core's, variable for variable, in :root and :root[data-theme='dark']
//
// Exit 1 on any violation. Node builtins only, no deps.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CORE_TOKENS = join(ROOT, 'frontend', 'src', 'styles', 'tokens.css')
const PLUGINS = join(ROOT, 'plugins')
const SOURCE = /\.(tsx|ts|jsx|js)$/

// Class names owned by the shared design system. Using one without shipping a
// theme.css means the plugin silently depends on whichever core CSS happens to
// be loaded — which is exactly the drift this script exists to prevent.
const SHARED_CLASS = /\b(panel|panel__\w+|table|tablewrap|btn|btn--\w+|badge|badge--\w+|alert|alert--\w+|empty|empty__\w+|pager|chip|chips|field|fieldgrid|input|select|search|search__icon|toolbar|row|spacer|hint|mono|pagehead)\b/

const failures = []
const fail = (where, msg) => failures.push(`${where}: ${msg}`)

/** `--name: value` pairs of the first rule matching `selector`. */
function declarations(css, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Strip comments first: `/* ---------- SLATE ---------- */` would otherwise
  // parse as a declaration and bury the real drift in noise.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const body = clean.match(new RegExp(`(?:^|[\\s,}])${esc}\\s*{([^}]*)}`, 'm'))?.[1]
  if (body === undefined) return null
  const out = new Map()
  for (const part of body.split(';')) {
    const i = part.indexOf(':')
    if (i === -1) continue
    out.set(
      part.slice(0, i).trim().replace(/^--/, ''),
      part.slice(i + 1).replace(/\s+/g, ' ').trim(),
    )
  }
  return out
}

function compareTokens(where, css) {
  const core = readFileSync(CORE_TOKENS, 'utf8')
  for (const selector of [':root', ":root[data-theme='dark']"]) {
    const want = declarations(core, selector)
    if (!want) continue // core no longer defines this block: nothing to mirror
    const got = declarations(css, selector)
    if (!got) {
      fail(where, `missing token block \`${selector}\``)
      continue
    }
    for (const [name, value] of want) {
      const mine = got.get(name)
      if (mine === undefined) fail(where, `${selector} is missing --${name}`)
      else if (mine !== value) fail(where, `${selector} --${name} is "${mine}", core has "${value}"`)
    }
    for (const name of got.keys()) {
      if (!want.has(name)) fail(where, `${selector} defines --${name}, which core does not`)
    }
  }
}

function checkStyle(code, at) {
  for (const m of code.matchAll(/style={{([^}]*)}}/g)) {
    const body = m[1]
    if (!/(color|background|border)/i.test(body)) continue
    // var(--token) is the sanctioned escape hatch (core's own PageHead uses it).
    const literal = body.replace(/var\(\s*--[\w-]+\s*\)/g, '')
    if (/#[0-9a-f]{3,8}|rgba?\(|hsla?\(|\b(red|blue|green|white|black|gray|grey|orange|yellow|purple|pink|cyan|magenta|transparent)\b/i.test(literal)) {
      fail(at, 'inline style carries a real colour — use a class from theme.css')
    }
  }
}

function checkFile(file, code) {
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/')
  code.split('\n').forEach((line, i) => {
    const at = `${rel}:${i + 1}`
    if (/from\s+['"][^'"]*frontend\/src/.test(line) || /from\s+['"]\.\.\/\.\.\/\.\.\/frontend/.test(line)) {
      fail(at, 'imports from frontend/src — plugin UI must be self-contained')
    }
    if (/from\s+['"]@tanstack\//.test(line)) fail(at, 'imports @tanstack — plugin UI must be react-only')
    if (/#[0-9a-f]{3,8}\b/i.test(line)) fail(at, 'hex colour literal — use a design token')
  })
  checkStyle(code, rel)

  if (!/export\s+const\s+routes\b/.test(code)) {
    fail(rel, 'no `export const routes` — plugin_registry.ts reads exactly that name')
  }

  const theme = join(dirname(file), 'theme.css')
  if (/import\s+['"]\.\/theme\.css['"]/.test(code) && !existsSync(theme)) {
    fail(rel, "imports './theme.css' but no such file next to it")
  }
  // Diffed whenever the copy exists, not only when it is imported: an unused
  // theme.css is still a promise to keep in sync, and drift is silent otherwise.
  if (existsSync(theme)) {
    compareTokens(`${dirname(rel).replace(/\\/g, '/')}/theme.css`, readFileSync(theme, 'utf8'))
  } else if (SHARED_CLASS.test(code)) {
    fail(rel, 'uses core class names but ships no ./theme.css — the copy is mandatory')
  }
}

// Every folder that ships plugin UI and therefore owns a token copy. The
// generator's template counts too: it is copied verbatim into new plugins,
// so if it drifts, every plugin made from it ships a wrong theme.
const SCAN_DIRS = [
  ...(existsSync(PLUGINS)
    ? readdirSync(PLUGINS)
        .map((name) => join(PLUGINS, name, 'frontend'))
    : []),
  join(ROOT, 'templates', 'plugin', 'frontend'),
]

let scanned = 0
for (const dir of SCAN_DIRS) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry)
    if (!statSync(file).isFile() || !SOURCE.test(entry)) continue
    scanned += 1
    checkFile(file, readFileSync(file, 'utf8'))
  }
}

if (failures.length) {
  console.error(`plugin UI check failed (${failures.length} problem(s)):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`plugin UI check ok — ${scanned} file(s) scanned, tokens in sync with core`)
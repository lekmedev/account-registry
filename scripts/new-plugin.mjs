#!/usr/bin/env node
// Scaffold a plugin from templates/plugin/.
//
//   node scripts/new-plugin.mjs <name> ["Label"] [--perm-prefix x] [--path /x]
//
//   node scripts/new-plugin.mjs demo_shop "Demo Shop"
//   node scripts/new-plugin.mjs demo_shop "Demo Shop" --perm-prefix demo --path /demo
//
// Copy only: nothing in core or templates/ is modified. The generated plugin
// is inert until you edit it — a freshly generated folder loads as a real
// plugin, so its placeholders must all be replaced (this script checks that
// it did) and its table/model must line up.
//
// Contract for the generated code: docs/PLUGIN-AUTHORING.md.

import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(ROOT, 'templates', 'plugin')
const PLUGINS = join(ROOT, 'plugins')

const argv = process.argv.slice(2)
const positional = argv.filter((a) => !a.startsWith('--'))
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}

const fail = (msg) => {
  console.error(`new-plugin: ${msg}`)
  process.exit(1)
}

const [rawName, rawLabel] = positional
if (!rawName) {
  console.error(`usage: node scripts/new-plugin.mjs <name> ["Label"] [--perm-prefix p] [--path /p]`)
  process.exit(1)
}

// --- names -----------------------------------------------------------------
const name = rawName
if (!/^[a-z][a-z0-9_]*$/.test(name)) {
  fail(`name must be snake_case and start with a letter, got "${rawName}"`)
}
if (name === 'hello') fail('hello is the loader regression fixture — pick another name')

const pascal = name.split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join('')
const label = rawLabel || pascal.split(/(?=[A-Z])/).join(' ')
const permPrefix = flag('perm-prefix', name)
const routePath = flag('path', '/' + name.replace(/_/g, '-'))

if (!/^[a-z][a-z0-9_.]*$/.test(permPrefix)) fail(`permission prefix looks wrong: "${permPrefix}"`)
if (!routePath.startsWith('/')) fail(`--path must start with /, got "${routePath}"`)

const target = join(PLUGINS, name)
if (existsSync(target)) fail(`${target} already exists`)
if (!existsSync(TEMPLATE)) fail(`template missing at ${TEMPLATE} — repo is incomplete`)

const subs = {
  '{{name}}': name,
  '{{Name}}': pascal,
  '{{LABEL}}': label,
  '{{PERM_PREFIX}}': permPrefix,
  '{{ROUTE_PATH}}': routePath,
  '{{TABLE}}': `${name}_records`,
}

// --- copy ------------------------------------------------------------------
cpSync(TEMPLATE, target, { recursive: true })

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

// `{{ color: ... }}` in JSX is not a placeholder — only a `{{token}}`-shaped
// word inside braces counts as a leak.
const PLACEHOLDER = /\{\{\s*[A-Za-z_][\w]*\s*\}\}/

let leaked = []
for (const file of walk(target)) {
  const before = readFileSync(file, 'utf8')
  let after = before
  for (const [token, value] of Object.entries(subs)) after = after.split(token).join(value)
  if (after !== before) writeFileSync(file, after)
  if (PLACEHOLDER.test(after)) leaked.push(file.slice(ROOT.length + 1).replace(/\\/g, '/'))
}

// --- report ----------------------------------------------------------------
if (leaked.length) {
  console.warn(`new-plugin: WARNING unreplaced placeholders left in:\n  ${leaked.join('\n  ')}`)
}

const rel = target.slice(ROOT.length + 1).replace(/\\/g, '/')
console.log(`created ${rel}

next:
  1. edit ${rel}/plugin.json  (description, menu label)
  2. rename the entity if "${pascal}Record" is the wrong noun
  3. docker compose up -d --build      # migrations run at startup
  4. curl localhost:8100/api/v1/core/plugins | grep ${name}
  5. assign ${permPrefix}.record.view to a role (PUT /api/v1/core/roles/{id})
  6. cd backend && python -m pytest -q  # your tests run with everyone else's

rules that will be checked, not assumed:
  - no edits under backend/app/core or frontend/src
  - cd frontend && npm run check:plugin-ui && npx tsc --noEmit && npm run build

docs: docs/PLUGIN-AUTHORING.md (contract) · docs/PLUGIN-UI.md (UI)`)
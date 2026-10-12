# AGENTS.md — account-registry

Modular Enterprise Account Registry. FastAPI + Postgres backend, React+Vite+TS
frontend, plugin architecture. Core knows nothing about account types.

## Start here (new session)

1. Read `docs/BRIEF.md` (frozen spec, never edit) + `docs/PROGRESS.md` (handoff).
2. Writing a **plugin UI**? Read `docs/PLUGIN-UI.md` BEFORE touching code — it lists the
   exact files to read, the token contract, the reusable class names, a template and a
   checklist. Do not read `frontend/src` for that task.
3. Writing a **whole plugin** (new account type)? Read `docs/PLUGIN-AUTHORING.md` and
   scaffold with `node scripts/new-plugin.mjs <name> "<Label>"` instead of writing from
   scratch. Both docs assume the other; neither replaces the other.
4. All 7 build phases are DONE. Also DONE: APScheduler wiring, core UI redesign on the
   design system, mobile drawer, plugin UI on the design system (`opera_cloud` ships
   `theme.css` + react-only `useRes`), and the plugin authoring kit (template +
   generator + `scripts/check-plugin-ui.mjs`). Remaining optional work is in
   PROGRESS.md "Next phase": httpx2 TestClient fix, seed password for real deploys, CI.
5. Never scan the whole codebase — open only what the task needs.

## Run / test

```bash
cd ~/apps/account-registry && docker compose up -d --build
curl localhost:8100/health                       # backend
open localhost:8101/login                        # admin / Admin123! (dev seed)
cd backend && python -m pytest -q                # core + every plugin's tests
cd frontend && npm run check:plugin-ui && npx tsc --noEmit && npm run build
```

## Repo map

- `backend/app/main.py` — mounts `/api/v1/core`, calls `load_plugins(app, scheduler=...)`
  at startup; owns the one core scheduler.
- `backend/app/core/` — auth, users, roles, departments, positions, audit, plugin_loader.
  **No plugin names here. Never add any.**
- `plugins/<name>/` — `plugin.json`, `models.py`, `routes.py`, `permissions.py`,
  `services.py`, `tasks.py` (optional), `migrations/`, `frontend/index.tsx`
  (+ `theme.css` = copy of core tokens/classes when the page uses them),
  `tests/` (plugin's own pytest, collected with the rest).
- `frontend/src/` — core UI + `plugin_registry.ts` (auto-imports plugin UI, 4 globs).
- `templates/plugin/` — scaffold source for new plugins. **Never inside `plugins/`**:
  the loader mounts any folder that has a `plugin.json`.
- `scripts/new-plugin.mjs` — generate `plugins/<name>/` from the template.
- `scripts/check-plugin-ui.mjs` — guard: plugin token copy vs core, no `frontend/src`
  or `@tanstack` imports in plugins, no hex / inline colours, `routes` exported.
- `backend/tests/conftest.py` — `app_factory` / `login`, shared with every plugin's tests.
- `docs/` — `PLUGIN-AUTHORING.md` (plugin contract), `PLUGIN-UI.md` (UI contract),
  `api.md` (endpoint ref), `schema.md` (DB), `BRIEF.md`, `PROGRESS.md`.

## Iron rules (from BRIEF §8)

- Adding a folder under `plugins/` must be enough — zero core edits (frontend rebuild only).
- No business logic in routes; use `services.py`. Validate all input with Pydantic.
- Plugin UI is react-only + self-contained (own fetch + own `can()` via
  `GET /api/v1/core/auth/me`). No imports from `frontend/src`, no `@tanstack`
  inside plugins — out-of-root files can't resolve them in Docker builds, and
  `vite.config.ts` deliberately doesn't alias `@tanstack` so it fails the build.
- Never log secrets or password hashes.

## Permissions

Core 10 (`core.user.view/manage`, `core.role.view/manage`, `core.department.view/manage`,
`core.position.view/manage`, `core.audit.view`, `core.plugin.view`). Role `admin` = `["*"]`.
Plugins upsert their own codes (never deleted). Menu filtered per-user via `GET /core/menu`.

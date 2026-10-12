# AGENTS.md — account-registry

Modular Enterprise Account Registry. FastAPI + Postgres backend, React+Vite+TS
frontend, plugin architecture. Core knows nothing about account types.

## Start here (new session)

1. Read `docs/BRIEF.md` (frozen spec, never edit) + `docs/PROGRESS.md` (handoff).
2. All 7 build phases are DONE. APScheduler wiring is DONE too (core builds a
   `BackgroundScheduler` and passes it to `load_plugins`). Remaining optional work is in
   PROGRESS.md "Next phase": httpx2 TestClient fix, seed password for real deploys.
3. Never scan the whole codebase — open only what the task needs.

## Run / test

```bash
cd ~/apps/account-registry && docker compose up -d --build
curl localhost:8100/health                       # backend
open localhost:8101/login                        # admin / Admin123! (dev seed)
docker exec account-registry-backend-1 python -m pytest tests/ -q   # 23 passed
cd frontend && npx tsc --noEmit && npm run build
```

## Repo map

- `backend/app/main.py` — mounts `/api/v1/core`, calls `load_plugins(app, scheduler=...)`
  at startup; owns the one core scheduler.
- `backend/app/core/` — auth, users, roles, departments, positions, audit, plugin_loader.
  **No plugin names here. Never add any.**
- `plugins/<name>/` — `plugin.json`, `models.py`, `routes.py`, `permissions.py`,
  `services.py`, `tasks.py` (optional), `migrations/`, `frontend/index.tsx`.
- `frontend/src/` — core UI + `plugin_registry.ts` (auto-imports plugin UI, 4 globs).
- `docs/` — `api.md` (endpoint ref), `schema.md` (DB), `BRIEF.md`, `PROGRESS.md`.

## Iron rules (from BRIEF §8)

- Adding a folder under `plugins/` must be enough — zero core edits (frontend rebuild only).
- No business logic in routes; use `services.py`. Validate all input with Pydantic.
- Plugin UI is react-only + self-contained (own fetch + own `can()` via
  `GET /api/v1/core/auth/me`). No imports from `frontend/src`, no `@tanstack`
  inside plugins — out-of-root files can't resolve them in Docker builds.
- Never log secrets or password hashes.

## Permissions

Core 10 (`core.user.view/manage`, `core.role.view/manage`, `core.department.view/manage`,
`core.position.view/manage`, `core.audit.view`, `core.plugin.view`). Role `admin` = `["*"]`.
Plugins upsert their own codes (never deleted). Menu filtered per-user via `GET /core/menu`.

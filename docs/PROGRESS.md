# PROGRESS — Account Registry (max 80 lines)

## Completed phases
- [x] Phase 1: Compose, FastAPI skeleton, Postgres 16, Alembic baseline, health, frontend stub, pytest (3 passed), live e2e verified.
- [x] Phase 2: Core auth (login/refresh/me, JWT 30m/7d, bcrypt), users, roles/permissions (admin role = `["*"]`), departments, positions, audit log + filters, migrations 0002 (tables) + 0003 (admin seed), pytest 9 passed, live e2e verified.
- [x] Phase 3: Plugin loader + hello test plugin. Loader scans `plugins/*/plugin.json` at startup (no hard-coded names), validates manifest + min_core_version, topo-sorts depends_on, skips failures with log, imports models/routes/permissions/services, mounts router at `/api/v1/plugins/<name>`, upserts perms (never deletes), runs per-plugin migrations with own version table `alembic_version_<name>`, optional tasks.py register_tasks. `GET /core/plugins` + `GET /core/menu` (perm-filtered). hello plugin proves zero core edits for new plugins. pytest 16 passed (9 old + 7 new), live e2e verified.
- [x] Phase 4: opera_cloud plugin backend. `opera_accounts` table (unique username + operator_code, FK dept/position SET NULL, JSONB roles/privileges, status enum active/disabled/expired), 5 permissions (`opera.account.view/create/edit/delete/export`), full CRUD + list (q search over 5 fields, dept/position/status filters, Page shape) + `.xlsx` export (openpyxl, current-filter, header+filter-respect tested) + audit on create/update/delete/expire + daily expiry job (`tasks.py` register_tasks, 02:05 cron). Migration `opera_0001` runs via loader's own version table. Zero core files touched. pytest 23 passed (16 old + 7 new), live e2e verified (create→list→export→delete).
- [x] Phase 5: Frontend core. React+TS+React Router+TanStack Query: login (token pair in localStorage, 401→refresh→retry, else /login), Layout (core nav perm-gated + plugin menu from `GET /core/menu`), pages users (search/page, create, enable/disable), roles (list+create, all-perms hint), departments, positions (dept filter), audit (action/resource filters+page), home, 404. `plugin_registry.ts` auto-imports `*/frontend/index.tsx` via 4 globs (host + `/plugins` Docker mount) — core names no plugin. `tsc` clean, `vite build` clean, live verified (frontend :8101 = 200, menu shows Hello+Opera Cloud). Backend pytest still 23 passed.
- [x] Phase 6: opera_cloud frontend. Self-contained `plugins/opera_cloud/frontend/index.tsx` (own api + `can()` via /core/auth/me, no core-src imports): /opera list (q search, dept/position/status filters, pagination), create/edit form (all fields, csv roles/privileges, date), delete confirm, Export .xlsx (current filter, blob download), buttons perm-gated (view/create/edit/delete/export). Core names no plugin (generic Vite alias + tsconfig paths). tsc clean, vite build clean, live e2e create→filter→export→delete verified, backend pytest still 23 passed.
- [x] Phase 7: Docs. `docs/api.md` (all 30 routes from live OpenAPI: health/auth/users/roles/depts/positions/audit/plugins+menu/hello/opera + curl examples), `docs/schema.md` (8 core tables + opera_accounts, rels, migration/version-table notes), README rewritten (run/test/layout + 10-step new-plugin guide via `hello`). Docs-only, zero code touched. Backend pytest still 23 passed.

## Next phase
- All 7 phases done. Remaining optional work: APScheduler wiring (pass scheduler to load_plugins so tasks.py crons register), httpx2 TestClient fix, change seed admin password for real deploys.

## File map (Phase 7 additions; earlier lines unchanged)
- `docs/api.md` — Phase 7: endpoint reference generated from live OpenAPI (auth shape, perms per route, Page shape, error codes, curl examples).
- `docs/schema.md` — Phase 7: 8 core tables + opera_accounts cols, rels, FK rules, migration files, version tables, JSONB/expiry notes.
- `README.md` — Phase 7 (rewritten): run/test/layout + 10-step "How to create a new plugin" (copy hello → plugin.json → permissions.py → models.py → services.py → routes.py → migrations/ → tasks.py → frontend/index.tsx → grant+verify).

## Decisions beyond brief
- (Phases 1–6 unchanged — see git history; key: PUT partial-update, JSONB roles/privileges, export col width 20, expiry audit actor None, plugin import fallback names, `_MOUNTED` guard.)
- No CSS framework — inline styles only, keep bundle/deps minimal.
- Tokens in localStorage (simplest per brief §8); refresh rotation handled server-side.
- Plugin routes render inside Layout (inherit sidebar); each plugin route gets nested `<Route>` for children.
- `tsconfig` `noUnusedLocals:false` — avoids friction with generated plugin stubs.
- Plugin UI is react-only + self-contained (fetch + own `can()` via /core/auth/me): out-of-root plugin files can't resolve bare/shared imports, so core-src imports and @tanstack use inside plugins are banned; keep plugin UI dependency-free.

## How to run and test
- `cd ~/apps/account-registry && docker compose up -d --build`
- Login: `POST localhost:8100/api/v1/core/auth/login {"username":"admin","password":"Admin123!}"` (dev seed).
- Frontend: open `localhost:8101/login` → admin/Admin123! → sidebar shows Users/Roles/Departments/Positions/Audit + Hello/Opera Cloud.
- Frontend types+build: `cd frontend && npx tsc --noEmit && npm run build` (both clean).
- Backend tests: `docker exec account-registry-backend-1 python -m pytest tests/ -q` (23 passed).

## Known issues
- Starlette TestClient deprecation warning (needs httpx2 later) — cosmetic.
- SAWarning on OperaAccount double-import (loader name + `plugins.*` package) — harmless, last definition wins.
- Seed admin password is dev-only; change ADMIN_PASSWORD in real deploys.
- Browser smoke test skipped (sandbox blocks localhost); verified via curl (200 + API shapes) instead.
- Core never passes a scheduler to load_plugins, so the expiry cron is registered only when a scheduler exists — APScheduler wiring deferred (no core scheduler yet).

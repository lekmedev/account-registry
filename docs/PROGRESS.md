# PROGRESS — Account Registry (max 80 lines)

## Completed phases
- [x] Phase 1: Compose, FastAPI skeleton, Postgres 16, Alembic baseline, health, frontend stub, pytest (3 passed), live e2e verified.
- [x] Phase 2: Core auth (login/refresh/me, JWT 30m/7d, bcrypt), users, roles/permissions (admin role = `["*"]`), departments, positions, audit log + filters, migrations 0002 (tables) + 0003 (admin seed), pytest 9 passed, live e2e verified.
- [x] Phase 3: Plugin loader + hello test plugin. Loader scans `plugins/*/plugin.json` at startup (no hard-coded names), validates manifest + min_core_version, topo-sorts depends_on, skips failures with log, imports models/routes/permissions/services, mounts router at `/api/v1/plugins/<name>`, upserts perms (never deletes), runs per-plugin migrations with own version table `alembic_version_<name>`, optional tasks.py register_tasks. `GET /core/plugins` + `GET /core/menu` (perm-filtered). hello plugin proves zero core edits for new plugins. pytest 16 passed (9 old + 7 new), live e2e verified.
- [x] Phase 4: opera_cloud plugin backend. `opera_accounts` table (unique username + operator_code, FK dept/position SET NULL, JSONB roles/privileges, status enum active/disabled/expired), 5 permissions (`opera.account.view/create/edit/delete/export`), full CRUD + list (q search over 5 fields, dept/position/status filters, Page shape) + `.xlsx` export (openpyxl, current-filter, header+filter-respect tested) + audit on create/update/delete/expire + daily expiry job (`tasks.py` register_tasks, 02:05 cron). Migration `opera_0001` runs via loader's own version table. Zero core files touched. pytest 23 passed (16 old + 7 new), live e2e verified (create→list→export→delete).
- [x] Phase 5: Frontend core. React+TS+React Router+TanStack Query: login (token pair in localStorage, 401→refresh→retry, else /login), Layout (core nav perm-gated + plugin menu from `GET /core/menu`), pages users (search/page, create, enable/disable), roles (list+create, all-perms hint), departments, positions (dept filter), audit (action/resource filters+page), home, 404. `plugin_registry.ts` auto-imports `*/frontend/index.tsx` via 4 globs (host + `/plugins` Docker mount) — core names no plugin. `tsc` clean, `vite build` clean, live verified (frontend :8101 = 200, menu shows Hello+Opera Cloud). Backend pytest still 23 passed.
- [x] Phase 6: opera_cloud frontend. Self-contained `plugins/opera_cloud/frontend/index.tsx` (own api + `can()` via /core/auth/me, no core-src imports): /opera list (q search, dept/position/status filters, pagination), create/edit form (all fields, csv roles/privileges, date), delete confirm, Export .xlsx (current filter, blob download), buttons perm-gated (view/create/edit/delete/export). Core names no plugin (generic Vite alias + tsconfig paths). tsc clean, vite build clean, live e2e create→filter→export→delete verified, backend pytest still 23 passed.
- [x] Phase 7: Docs. `docs/api.md` (all 30 routes from live OpenAPI: health/auth/users/roles/depts/positions/audit/plugins+menu/hello/opera + curl examples), `docs/schema.md` (8 core tables + opera_accounts, rels, migration/version-table notes), README rewritten (run/test/layout + 10-step new-plugin guide via `hello`). Docs-only, zero code touched. Backend pytest still 23 passed.
- [x] Post-phase: APScheduler wiring. Core builds one `BackgroundScheduler` (`app/main.py::_build_scheduler`), passes it to `load_plugins(app, scheduler=...)`, and starts it *after* plugins registered their jobs (`shutdown(wait=False)` on lifespan exit). The opera_cloud daily 02:05 expiry cron now actually fires. Loader signature and architecture unchanged; no plugin names in core. Verified live: app startup logs `scheduler started with 1 job(s)`; pytest 23 passed; `GET /core/plugins` lists hello + opera_cloud.

## Next phase
- All 7 phases + scheduler wiring done. Remaining optional work: httpx2 TestClient fix, change seed admin password for real deploys.

- [x] Post-phase: Core UI redesign on an autobrr-derived design system. New `frontend/src/styles/tokens.css` (slate/blue ramps + dark ramp inversion) and `app.css`; all core pages moved from inline styles to classNames. Sidebar kept (not a top navbar) on purpose — the plugin count grows over time and a vertical list has room. Dark mode is the product default; `data-theme` is set before first paint in `index.html`. Added a theme toggle, Overview nav item, empty states, status badges and a real `<label>` on every field. Plugin UI untouched — still self-contained react-only. `tsc --noEmit` clean, `vite build` clean, verified live in the browser (login → all 5 core pages → create department round-trips to the DB → theme toggle).

## File map (core UI redesign)
- `frontend/src/styles/tokens.css` — design tokens + base reset (new).
- `frontend/src/styles/app.css` — sidebar shell, panel, table, form, badge, login (new).
- `frontend/index.html` — font links + pre-paint theme script (dark default).
- `frontend/src/Layout.tsx` — sidebar, theme toggle, shared `PageHead` / `Empty` / `ErrorNote`.
- `frontend/src/main.tsx`, `pages/*.tsx` — classNames instead of inline styles.

## Decisions beyond brief
- (Phases 1–7 unchanged — key: PUT partial-update, JSONB roles/privileges, export col width 20, expiry audit actor None, plugin import fallback names, `_MOUNTED` guard.)
- No CSS framework — **overridden for core UI only**: core pages now use two hand-written
  CSS files driven by design tokens (no Tailwind/unocss/build step added). Plugin UI stays
  inline-styled and self-contained, per the iron rule.
- Sidebar layout, not a top navbar: more plugins are expected, and a vertical list has room.
- Dark mode is the default (`localStorage: ui-theme`; anything other than `light` = dark).
- App-shell breakpoint is 900px, not the design system's 996px: a fixed 248px sidebar plus
  wide tables needs to collapse earlier than the landing-page grids do.
- Tokens in localStorage (simplest per brief §8); refresh rotation handled server-side.
- Plugin routes render inside Layout (inherit sidebar); each plugin route gets nested `<Route>` for children.
- `tsconfig` `noUnusedLocals:false` — avoids friction with generated plugin stubs.
- Plugin UI is react-only + self-contained (fetch + own `can()` via /core/auth/me); keep plugin UI dependency-free.
- Scheduler gets **no explicit timezone** → APScheduler uses the process local timezone (container = UTC). Simplest option per brief §8, so no new config setting was added.
- Scheduler construction is best-effort: if APScheduler import/init fails, `_build_scheduler()` returns `None`, jobs stay unregistered and the app still starts (BRIEF §5.3).

## How to run and test
- `cd ~/apps/account-registry && docker compose up -d --build`
- **No-Docker local run** (verified on Windows): native PostgreSQL 16 on `localhost:5433`, user `registry`, db `account_registry`; then `cd backend && alembic upgrade head && uvicorn app.main:app --port 8100`. Run `alembic` via its console script from `backend/` — `python -m alembic` fails because the local `backend/alembic/` folder shadows the installed package.
- Login: `POST localhost:8100/api/v1/core/auth/login {"username":"admin","password":"Admin123!"}` (dev seed).
- Frontend: open `localhost:8101/login` → admin/Admin123! → sidebar shows Users/Roles/Departments/Positions/Audit + Hello/Opera Cloud.
- Frontend types+build: `cd frontend && npx tsc --noEmit && npm run build` (both clean).
- Backend tests: `docker exec account-registry-backend-1 python -m pytest tests/ -q` (23 passed). Locally: `cd backend && python -m pytest tests/ -q` with `DATABASE_URL` exported.
- Scheduler proof: startup log shows `app: scheduler started with 1 job(s)` (the opera_cloud 02:05 cron).

## Known issues
- The scheduler assumes a single backend process. `uvicorn --workers N` (N>1) starts N schedulers, so a plugin cron fires N times.
- Starlette TestClient deprecation warning (needs httpx2 later) — cosmetic.
- SAWarning on OperaAccount double-import (loader name + `plugins.*` package) — harmless, last definition wins.
- Seed admin password is dev-only; change ADMIN_PASSWORD in real deploys.
- `docs/api.md` lists the hello ping as `/api/v1/plugins/hello/hello/ping`; the live route is `/api/v1/plugins/hello/ping`.
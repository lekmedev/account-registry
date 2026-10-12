# PROJECT BRIEF: Modular Enterprise Account Registry (plugin architecture)

You are a senior full-stack engineer. Build this project in PHASES. Do ONE phase per session, then STOP. Each phase runs in a NEW session, so follow section 9 (Handoff) strictly. Keep files small and focused. Do not re-print code from earlier phases.

## 1. Goal
A web app that keeps a LOCAL registry of enterprise accounts. It does NOT call any external system. Plugins add account types; the core knows nothing about them.

## 2. Fixed tech decisions (do not change, do not ask)
- Backend: Python 3.12, FastAPI, SQLAlchemy 2.0 (sync), Alembic, Pydantic v2, PostgreSQL 16
- Auth: JWT access token (30 min) + refresh token (7 days), bcrypt password hashing
- Frontend: React + Vite + TypeScript, React Router, TanStack Query
- Excel export: openpyxl
- Background tasks: APScheduler
- Tests: pytest (backend). Config via `.env`. Docker Compose with `db`, `backend`, `frontend`.
- API prefix: `/api/v1`. Core routes under `/api/v1/core/...`, plugin routes under `/api/v1/plugins/<plugin_name>/...`

## 3. Repo layout
```
backend/app/core/        auth, users, roles, departments, positions, audit, plugin_loader, config, db
backend/app/main.py
backend/alembic/         core migrations only
plugins/<name>/          plugin.json, models.py, routes.py, permissions.py, services.py,
                         tasks.py (optional), migrations/, frontend/ (index.tsx + pages)
frontend/src/            core UI, plugin_registry (auto-imports plugins)
docker-compose.yml, .env.example, README.md
```

## 4. Core scope
Auth (login, refresh, me), user CRUD, role + permission system (role has many permissions; user has many roles; role "admin" implicitly has all), department CRUD, position CRUD, audit log (who, action, resource, resource_id, details JSON, timestamp; list with filters), plugin loader, API routing.
Core provides these helpers for plugins: `get_db`, `Base`, `require_permission("x.y.z")` dependency, `audit.log(...)`.

## 5. Plugin contract
**plugin.json**
```json
{
  "name": "opera_cloud",
  "version": "1.0.0",
  "description": "Opera Cloud account registry",
  "min_core_version": "1.0.0",
  "depends_on": [],
  "menu": [{"label": "Opera Cloud", "path": "/opera", "permission": "opera.account.view"}]
}
```
**Python modules** (each exposes a fixed name):
- `models.py`: SQLAlchemy models using core `Base`
- `routes.py`: `router = APIRouter()`
- `permissions.py`: `PERMISSIONS = [{"code": "...", "description": "..."}]`
- `services.py`: business logic (routes stay thin)
- `tasks.py` (optional): `def register_tasks(scheduler): ...`

**Loader rules**
1. At startup scan `plugins/*/plugin.json`. Never hard-code plugin names in core.
2. Validate manifest and `min_core_version`. Resolve `depends_on` order.
3. A plugin that fails to load is skipped and logged. The app must still start.
4. Import models, mount router, upsert permissions into the core table (never delete), register tasks.
5. Run each plugin's own Alembic migrations from `plugins/<name>/migrations/` using a separate version table `alembic_version_<name>`.
6. `GET /api/v1/core/plugins` lists loaded plugins; `GET /api/v1/core/menu` returns menu items filtered by the current user's permissions.
7. Frontend discovers plugin UI with `import.meta.glob('../../plugins/*/frontend/index.tsx')`. Each plugin exports `routes` (React Router objects). Core never imports a plugin by name.

## 6. First plugin: opera_cloud (LOCAL registry only)
No Oracle/OHIP API calls, no credentials, no sync. It only stores records.

Table `opera_accounts`:
| column | type / rule |
|---|---|
| id | PK |
| username | str, unique, required |
| email | str, required, valid email |
| employee_name | str, required |
| employee_id | str, required |
| department_id | FK core departments |
| position_id | FK core positions |
| operator_code | str, unique, required |
| roles | JSONB list of strings |
| privileges | JSONB list of strings |
| account_status | enum: active, disabled, expired |
| expiration_date | date, nullable |
| created_at, updated_at, created_by | audit fields |

Permissions: `opera.account.view`, `opera.account.create`, `opera.account.edit`, `opera.account.delete`, `opera.account.export`.

Endpoints (under `/api/v1/plugins/opera_cloud/accounts`):
- `GET /` list with pagination, `q` search (username, email, employee_name, employee_id, operator_code), filters `department_id`, `position_id`, `account_status`
- `POST /`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}`
- `GET /export` returns .xlsx of the current filter

Every create/update/delete writes an audit log entry. Optional task: a daily job that sets `account_status=expired` when `expiration_date` has passed.
Frontend: list page with search + filters + pagination, create/edit form, delete confirm, Export button. Hide buttons the user lacks permission for.

## 7. Phases (one per session, stop after each)
1. Docker Compose, FastAPI skeleton, DB, Alembic, config, health check
2. Core auth, users, roles/permissions, departments, positions, audit log + pytest
3. Plugin loader (backend) + a tiny `hello` test plugin proving no core edits are needed + tests
4. opera_cloud plugin backend (models, migration, routes, services, export) + tests
5. Frontend core (login, layout, menu from API, user/role/department/position pages, plugin_registry)
6. opera_cloud frontend
7. API docs (`docs/api.md` from OpenAPI), database schema doc, README ("How to create a new plugin" step by step using `hello` as the template)

## 8. Rules
- DO NOT put any plugin-specific name or logic in `backend/app/core` or `frontend/src` core code.
- DO NOT modify core files to add a plugin. Adding a folder under `plugins/` must be enough (frontend needs a rebuild only).
- No business logic in routes; use services.
- Validate all input with Pydantic; return consistent error JSON.
- Never log secrets or password hashes.
- If something is ambiguous, pick the simplest option, note it in one line, and continue. Do not ask questions unless blocked.

## 9. Handoff (mandatory)
- This brief is saved as `docs/BRIEF.md` and never edited.
- At the end of EVERY phase, create or update `docs/PROGRESS.md` (max 80 lines) containing: completed phases, next phase, file map (one line per file), decisions made beyond this brief (names, conventions), how to run and test, known issues. Then stop.
- At the start of EVERY session, read ONLY `docs/BRIEF.md` and `docs/PROGRESS.md`, then do the next phase. Open other files only when the current phase requires them. Never scan the whole codebase.
- In Phase 1, create `docs/BRIEF.md` (copy of this brief) and the first `docs/PROGRESS.md`.

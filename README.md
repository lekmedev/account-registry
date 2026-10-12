# Account Registry (modular, plugin architecture)

Local registry of enterprise accounts. Core knows nothing about account types —
plugins add them. No external systems are called; everything is stored locally.

Docs: `docs/BRIEF.md` (frozen spec) · `docs/PROGRESS.md` (phase handoff) ·
`docs/api.md` (endpoint reference) · `docs/schema.md` (database).

## Run

```bash
cp .env.example .env   # edit secrets/ports
docker compose up -d --build
curl localhost:8100/health
```

- Backend: `localhost:8100` (OpenAPI at `/docs`). Frontend: `localhost:8101/login`.
- Dev seed login: `admin` / `Admin123!` (change `ADMIN_PASSWORD` in real deploys).

## Test

```bash
docker exec account-registry-backend-1 python -m pytest tests/ -q   # 23 passed
cd frontend && npx tsc --noEmit && npm run build                    # both clean
```

## Layout

- `backend/app/core/` — auth, users, roles, departments, positions, audit, plugin_loader. No plugin names.
- `backend/app/main.py` — mounts `/api/v1/core`, calls `load_plugins(app)` at startup.
- `plugins/<name>/` — `plugin.json`, `models.py`, `routes.py`, `permissions.py`, `services.py`, `tasks.py` (optional), `migrations/`, `frontend/index.tsx`.
- `frontend/src/` — core UI + `plugin_registry.ts` (auto-imports plugin UI via `import.meta.glob`, four globs covering host checkout and Docker `/plugins` mount).

## How to create a new plugin (using `hello` as the template)

`plugins/hello/` is the minimal working plugin — copy it and rename. Core needs
zero edits: adding a folder is enough (frontend needs a rebuild only). Steps:

1. **Copy the template.**
   ```bash
   cp -r plugins/hello plugins/my_plugin
   ```
2. **Write `plugin.json`** (name must match the folder):
   ```json
   {
     "name": "my_plugin",
     "version": "1.0.0",
     "description": "What this plugin stores",
     "min_core_version": "1.0.0",
     "depends_on": [],
     "menu": [{"label": "My Plugin", "path": "/my-plugin", "permission": "myplugin.view"}]
   }
   ```
   Rules: valid JSON with all six keys; `min_core_version` ≤ core version or the
   plugin is skipped; `depends_on` lists other plugin names (loader topo-sorts,
   cycles/unknowns skip the plugin with a log). A failing plugin never stops the app.
3. **`permissions.py`** — expose `PERMISSIONS`:
   ```python
   PERMISSIONS = [{"code": "myplugin.view", "description": "View my plugin"}]
   ```
   Codes are upserted into the core table (never deleted). Prefix codes with your
   plugin name. Use them in routes via `Depends(auth.require_permission("myplugin.view"))`.
4. **`models.py`** — SQLAlchemy models on the core `Base` (`from app.core.db import Base`).
   Add `__table_args__ = {"extend_existing": True}` (loader may import the module twice).
5. **`services.py`** — all business logic here (routes stay thin). Raise
   `ConflictError`/`NotFoundError` (import from `app.core.services`) for 409/404.
   Validate input with Pydantic schemas; write audit entries via `app.core.audit.log(...)`.
   Import models defensively like `hello`/`opera_cloud` do:
   ```python
   try:
       from plugins.my_plugin.models import MyModel
   except ImportError:  # loader-generated module name
       from account_registry_plugin_my_plugin_models import MyModel  # type: ignore
   ```
6. **`routes.py`** — expose module-level `router = APIRouter()`. The loader mounts it
   at `/api/v1/plugins/<name>`, so `@router.get("/ping")` → `GET /api/v1/plugins/my_plugin/ping`.
   Keep handlers thin (call services, map errors to 404/409).
7. **`migrations/`** — own Alembic chain on version table `alembic_version_<name>`
   (no `env.py` needed). Minimal no-op example (`hello`):
   ```python
   revision = "myplugin_0001"; down_revision = None
   import sqlalchemy as sa
   from alembic import op
   def upgrade() -> None:
       op.create_table("myplugin_log", sa.Column("id", sa.Integer, primary_key=True))
   def downgrade() -> None:
       op.drop_table("myplugin_log")
   ```
8. **`tasks.py`** (optional) — expose `def register_tasks(scheduler): ...` to add
   APScheduler jobs. Core builds one `BackgroundScheduler` at startup and passes it to
   `load_plugins(app, scheduler=...)`, so your jobs register and run automatically.
   A plugin without `tasks.py` is unaffected.
9. **`frontend/index.tsx`** — export `routes` (React Router objects); the menu `path`
   in `plugin.json` must match one of them. Keep it **self-contained**: react-only,
   own fetch + own `can()` via `GET /api/v1/core/auth/me` (see
   `plugins/opera_cloud/frontend/index.tsx`). Do NOT import from `frontend/src`
   or `@tanstack` — out-of-root plugin files can't resolve them in Docker builds.
   Minimal example (`hello`):
   ```tsx
   export const routes = [{ path: '/my-plugin', element: (<div><h2>My plugin</h2></div>) }];
   ```
10. **Grant permissions, restart, verify.**
    ```bash
    docker compose up -d --build
    curl localhost:8100/api/v1/core/plugins   # your plugin listed
    ```
    Assign the new permission codes to a role (`POST /roles` / `PUT /roles/{id}`
    with `permission_codes`), then the menu item appears in `GET /core/menu` and the sidebar.

## Known issues

- Starlette TestClient deprecation warning (needs httpx2 later) — cosmetic.
- SAWarning on double-import of plugin models (loader name + `plugins.*`) — harmless, last definition wins.
- Seed admin password is dev-only; change `ADMIN_PASSWORD` in real deploys.
- The scheduler assumes a single backend process. Running `uvicorn --workers N` (N > 1)
  starts one scheduler per worker, so a plugin cron would fire N times.

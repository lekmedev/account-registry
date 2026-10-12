# API Reference — Account Registry (core v1.0.0)

Base URL: `http://localhost:8100`. API prefix: `/api/v1`.
Core routes: `/api/v1/core/...`. Plugin routes: `/api/v1/plugins/<name>/...`.
Generated from the live OpenAPI spec (`GET /openapi.json`); interactive docs at `/docs`.

Auth: `Authorization: Bearer <access_token>`. Access token 30 min, refresh token 7 days.
Errors: consistent JSON `{"detail": "<code>"}`. Codes: `invalid_credentials`,
`user_disabled`, `invalid_refresh_token`, `role_not_found`, `department_not_found`,
`position_not_found`, `*_not_found` (404), `*_exists` (409). Unhandled → 500 `internal_error`.
Pagination shape: `{"items": [...], "total": N, "page": P, "page_size": S}`.

## Health

- `GET /health` → `{"status","core_version","db"}`. Same shape at `GET /api/v1/health` and `GET /api/v1/core/health`.

## Auth (`/api/v1/core/auth`)

- `POST /auth/login` — body `{username, password}` → `{access_token, refresh_token, token_type}` (401 `invalid_credentials`, 403 `user_disabled`).
- `POST /auth/refresh` — body `{refresh_token}` → new token pair (rotation; 401 `invalid_refresh_token`).
- `GET /auth/me` (auth) → `UserOut`: `{id, username, email, is_active, roles:[{id,name}], permissions:[...]}`.

## Users — perm `core.user.view` (list), `core.user.manage` (write)

- `GET /users?q&...&page=1&page_size=20` → `Page[UserOut]` (`q` matches username/email).
- `POST /users` (201) — `{username [a-zA-Z0-9_.-], email, password ≥8, role_ids:[], is_active}` → `UserOut`.
- `PUT /users/{id}` (partial) — `{email?, password?, role_ids?, is_active?}` → `UserOut`. No delete endpoint (deactivate via `is_active:false`).

## Roles & permissions — `core.role.view` / `core.role.manage`

- `GET /permissions` → `[{id, code, description}]` (core 10 + every loaded plugin's, upserted, never deleted).
- `GET /roles` → `[{id, name, description, permissions:[...]}]`.
- `POST /roles` (201) — `{name [a-z0-9_.-], description, permission_codes:[]}` → `RoleOut`.
- `PUT /roles/{id}` (partial) — `{description?, permission_codes?}` → `RoleOut`.
- Convention: role named `admin` implicitly has all permissions (`effective_permissions` returns `["*"]`).

## Departments — `core.department.view` / `core.department.manage`

- `GET /departments?page=1&page_size=100` → `Page[{id,name,description}]`.
- `POST /departments` (201) — `{name, description}` → dept. `PUT /departments/{id}` (partial).

## Positions — `core.position.view` / `core.position.manage`

- `GET /positions?department_id&page=1&page_size=100` → `Page[{id,name,description,department_id,department_name}]`.
- `POST /positions` (201) — `{name, description, department_id?}` → position. `PUT /positions/{id}` (partial).

## Audit — `core.audit.view`

- `GET /audit?action&resource&actor_id&since&until&page=1&page_size=20` → `Page[{id,actor_id,actor_username,action,resource,resource_id,details,created_at}]`.
- Every create/update/delete (core + plugins) writes an entry: `{actor_id, action, resource, resource_id, details}`.

## Plugins & menu — `core.plugin.view` (plugins); menu needs only auth

- `GET /plugins` → `[{name, version, description, menu:[{label,path,permission}], permissions:[...]}]`.
- `GET /menu` → menu items from all loaded plugins, filtered by the caller's permissions (`*` bypasses).

## hello plugin (`/api/v1/plugins/hello`) — perms: `hello.view`

- `GET /api/v1/plugins/hello/ping` (public) → `{"plugin":"hello","message":"pong"}`.
- `GET /api/v1/plugins/hello/whoami` (needs `hello.view`) → `{"plugin":"hello","username":"..."}`.

## opera_cloud plugin (`/api/v1/plugins/opera_cloud/accounts`)

- `GET /accounts?q&department_id&position_id&account_status&page=1&page_size=20` (needs `opera.account.view`) → `Page[OperaAccount]`. `q` matches username/email/employee_name/employee_id/operator_code.
- `POST /accounts` (201, `opera.account.create`) — `{username, email, employee_name, employee_id, department_id?, position_id?, operator_code, roles:[], privileges:[], account_status=active, expiration_date?}` → account. Bad FK → 404 `department_not_found`/`position_not_found`; dup username/operator_code → 409.
- `GET /accounts/{id}` (view) → account + `department_name`/`position_name`.
- `PUT /accounts/{id}` (partial, `opera.account.edit`) → updated account.
- `DELETE /accounts/{id}` (204, `opera.account.delete`).
- `GET /accounts/export?q&department_id&position_id&account_status` (`opera.account.export`) → `.xlsx` download (`opera_accounts.xlsx`, 15 columns, width 20, respects current filter).

### OperaAccount shape

`{id, username, email, employee_name, employee_id, department_id, department_name, position_id, position_name, operator_code, roles[], privileges[], account_status (active|disabled|expired), expiration_date, created_at, updated_at, created_by}`.

### curl examples

```bash
BASE=localhost:8100/api/v1
T=$(curl -s $BASE/core/auth/login -H'Content-Type: application/json' \
  -d'{"username":"admin","password":"Admin123!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
H="Authorization: Bearer $T"
curl -s $BASE/core/auth/me -H"$H"
curl -s "$BASE/core/users?q=adm" -H"$H"
curl -s "$BASE/plugins/opera_cloud/accounts?q=op&page=1&page_size=20" -H"$H"
curl -s "$BASE/plugins/opera_cloud/accounts/export?account_status=active" -H"$H" -o opera.xlsx
curl -s $BASE/core/menu -H"$H"
```

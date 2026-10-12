# Database Schema — Account Registry

Postgres 16. Core migrations: `backend/alembic/versions/` (`0001_baseline`, `0002_core_tables`, `0003_seed_admin`) on the default `alembic_version` table. Each plugin migrates itself from `plugins/<name>/migrations/versions/` on its own `alembic_version_<name>` table. FK deletes: associative rows CASCADE; references to users/departments/positions are SET NULL (history survives).

## Core tables

- `permissions` — `{id PK, code UNIQUE(128), description(255)}`. Seeded with 10 `core.*` codes at startup (upsert, never delete); plugin codes upserted by the loader.
- `roles` — `{id PK, name UNIQUE(64), description(255), created_at}`.
- `role_permissions` — `{role_id FK roles CASCADE, permission_id FK permissions CASCADE}` composite PK.
- `users` — `{id PK, username UNIQUE(64), email UNIQUE(255), password_hash(255, bcrypt), is_active, created_at, updated_at}`.
- `user_roles` — `{user_id FK users CASCADE, role_id FK roles CASCADE}` composite PK.
- `departments` — `{id PK, name UNIQUE(128), description(255), created_at, updated_at}`.
- `positions` — `{id PK, name UNIQUE(128), description(255), department_id FK departments SET NULL NULL, created_at, updated_at}`.
- `audit_logs` — `{id PK, actor_id FK users SET NULL NULL, action(64), resource(64), resource_id(64) NULL, details JSON NULL, created_at indexed}`.

## Relationships

- user ↔ roles, role ↔ permissions: many-to-many via `user_roles` / `role_permissions`.
- position → department: many-to-one (`department_id`, nullable).
- audit_log → user: many-to-one (`actor_id`, nullable; login + all CRUD writes).
- `admin` role: no extra tables — `effective_permissions()` returns `["*"]` by role name.

## Plugin tables

- `opera_accounts` (`plugins/opera_cloud/migrations/versions/0001_opera_accounts.py`, version table `alembic_version_opera_cloud`):
  `{id PK, username UNIQUE(64), email(255), employee_name(128), employee_id(64), department_id FK departments SET NULL NULL, position_id FK positions SET NULL NULL, operator_code UNIQUE(64), roles JSONB NOT NULL default [], privileges JSONB NOT NULL default [], account_status(16) default 'active' (active|disabled|expired), expiration_date DATE NULL, created_at, updated_at, created_by FK users SET NULL NULL}`.
- hello plugin: no tables of its own (`0001_hello_ping_log.py` is a no-op marker proving per-plugin migrations run).

## Notes

- Timestamps are timezone-aware UTC (`_utcnow`); audit `created_at` is the only indexed timestamp.
- `roles`/`privileges` on opera accounts are JSONB string lists (simplest per brief; no join tables).
- `expiration_date` + `account_status=expired` are maintained by the plugin's daily 02:05 job (`expire_old_accounts`), each expiry writing an audit entry with actor None.

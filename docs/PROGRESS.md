# PROGRESS — Account Registry (max 80 lines)

## Session start (đọc theo thứ tự, KHÔNG quét cả repo)
1. `docs/BRIEF.md` — spec đóng băng, không sửa.  2. `docs/PROGRESS.md` — file này.
3. Viết **plugin** (trọn vẹn hoặc phần UI)? → `docs/PLUGIN-AUTHORING.md` +
   `docs/PLUGIN-UI.md`, đọc **trước khi động vào code**; sinh code bằng
   `node scripts/new-plugin.mjs <tên> "<Label>"`.

## Completed phases
- [x] P1 Compose + FastAPI + Postgres 16 + Alembic + health + pytest. P2 Core auth (JWT 30m/7d,
      bcrypt), users, roles/permissions (admin = `["*"]`), departments, positions, audit.
- [x] P3 Plugin loader: scan `plugins/*/plugin.json` (không hard-code tên), validate manifest +
      min_core_version, topo-sort `depends_on`, skip lỗi nhưng app vẫn start, mount router
      `/api/v1/plugins/<name>`, upsert perms, per-plugin migrations riêng, `/core/{plugins,menu}`.
- [x] P4 opera_cloud backend: CRUD + q/filter/page + `.xlsx` export + audit + daily expiry.
- [x] P5 Frontend core: login, Layout, 5 page CRUD, `plugin_registry.ts` (4 globs). P6 opera_cloud
      frontend (react-only). P7 Docs. Sau đó: APScheduler wiring, core UI redesign, mobile drawer.

## Post-phase work
- **Plugin UI trên design system.** `plugins/opera_cloud/frontend/` có `index.tsx` + `theme.css`
  (copy token + class của core, bỏ shell), 0 inline style / 0 hex; form label + `htmlFor`, select cho
  FK, `can()` ẩn nút thiếu quyền, panel "No access". `@tanstack` bị gỡ khỏi plugin, thay bằng
  `useRes()` + `usePerms()`; `vite.config.ts` **không alias** `@tanstack` nữa → vi phạm rule là build
  error. Lỗi 422 format theo field thay vì in raw JSON.
- **Kit cho người khác viết plugin.** `docs/PLUGIN-AUTHORING.md` (contract duy nhất: core cho sẵn
  gì · hợp đồng file · 10 quy tắc backend + 7 UI · test · definition of done · 9 anti-pattern) +
  `templates/plugin/` (skeleton 15 file) + `scripts/new-plugin.mjs`. Verify: sinh `demo_shop` → 7 test
  của nó xanh + checker/tsc/build sạch, rồi xoá.
- **Test của plugin nằm trong `plugins/<tên>/tests/`** — hết vi phạm zero-core-edit.
  `backend/tests/conftest.py` gom fixture dùng chung (`app_factory` tạo schema tạm + load mọi plugin +
  seed admin; `login`); `backend/pytest.ini` thêm `testpaths = tests ../plugins` +
  `--import-mode=importlib`; `backend/tests/test_opera.py` → `plugins/opera_cloud/tests/test_opera.py`.
- **Guard:** `scripts/check-plugin-ui.mjs` diff token từng `plugins/*/frontend/theme.css` **và**
  `templates/plugin/` với core; chặn import `frontend/src`/`@tanstack`, hex, inline style màu thật,
  thiếu `export const routes`, dùng class core mà không ship `theme.css`.

## Next phase
- Wire `npm run check:plugin-ui` vào CI (repo chưa có CI). Tồn đọng: httpx2 TestClient fix, đổi seed
  admin password cho deploy thật.

## Decisions beyond brief
- (P1–P7: PUT partial-update, JSONB roles/privileges, export col width 20, expiry audit actor None,
  plugin import fallback names, `_MOUNTED` guard — xem git history.)
- Template ở `templates/plugin/`, **không** ở `plugins/`: loader mount mọi folder có `plugin.json`
  nên template sai chỗ sẽ chạy thành plugin thật. Plugin có `tests/` thì **bắt buộc**
  `plugins/__init__.py` + `plugins/<tên>/__init__.py`: không có thì `tests/conftest.py` trùng
  module name với của core → pytest fail.
- Không CSS framework. Core dùng 2 file CSS tự viết + design token; plugin tự mang `theme.css` và
  được checker giữ đồng bộ. Plugin tự viết `.pagehead` (copy markup `PageHead` của core) vì core
  chỉ render shell. Inline style chỉ còn cho layout; `color: var(--text-accent)` được phép.
- Sidebar (không phải navbar trên) vì nhiều plugin sẽ tới; breakpoint 900px; transition
  `visibility` dùng `0s duration + delay`. Dark mode mặc định; dark là **đảo ramp** chứ không phải
  đảo class → không cần `dark:` variant, không cần JS trong plugin (verify: badge `#e6f6eb`→`#132d21`).

## File map
- `docs/PLUGIN-AUTHORING.md` — **contract cho người viết plugin** (đọc file này trước);
  `docs/PLUGIN-UI.md` — token contract, class catalog, template react-only, checklist UI.
- `templates/plugin/` + `scripts/new-plugin.mjs` — skeleton 15 file, sinh plugin mới;
  `scripts/check-plugin-ui.mjs` — guard token drift + iron rules của plugin UI.
- `backend/tests/conftest.py` — `app_factory` / `login` dùng chung; `backend/app/main.py` —
  `_build_scheduler()`, lifespan scheduler, app logger handler.
- `frontend/src/styles/tokens.css` — **nguồn token duy nhất**; `app.css` — shell, panel, table,
  form, badge, drawer, login; `api.ts` — `api()`/`errMsg()`; `Layout.tsx` — sidebar + drawer.
- `plugins/opera_cloud/` — ví dụ thật giàu tính năng (export + cron).

## How to run and test
- Docker: `docker compose up -d --build` → backend :8100, frontend :8101.
- **Không Docker**: Postgres 16 native ở `localhost:5433` (xem `.env`), rồi `cd backend && alembic
  upgrade head && uvicorn app.main:app --port 8100`. `alembic` chạy bằng console script từ `backend/`
  (`python -m alembic` fail vì folder `backend/alembic/` che package); uvicorn chạy từ repo root, nếu
  không loader không import được `plugins.*` và sẽ bỏ qua plugin.
- Frontend dev: `cd frontend && VITE_PROXY_TARGET=http://localhost:8100 npm run dev` (:5173).
- Test: `cd backend && python -m pytest -q` (export `DATABASE_URL` trước) — gom test core **và** test
  của mọi plugin. `cd frontend && npm run check:plugin-ui && npx tsc --noEmit && npm run build`.

## Known issues
- Scheduler giả định 1 process backend: `uvicorn --workers N` (N>1) → N scheduler → cron chạy N lần.
- Test browser headless có `document.hidden = true` nên CSS transition bị đóng băng (`currentTime = 0`);
  xác minh animation phải ép frame bằng `browser.screenshot`. Cosmetic: TestClient deprecation (cần
  httpx2), SAWarning double-import, seed admin chỉ dùng dev.
# PROGRESS — Account Registry (max 80 lines)

## Session start (đọc theo thứ tự, KHÔNG quét cả repo)
1. `docs/BRIEF.md` — spec đóng băng, không sửa.   2. `docs/PROGRESS.md` — file này.
3. Viết **UI plugin**? → đọc `docs/PLUGIN-UI.md` **trước khi động vào code**: nó chỉ rõ đọc
   file nào, token lấy ở đâu, class nào dùng được, template + checklist.

## Completed phases
- [x] P1 Compose + FastAPI + Postgres 16 + Alembic + health + pytest.
- [x] P2 Core auth (JWT 30m/7d, bcrypt), users, roles/permissions (admin = `["*"]`), departments,
      positions, audit + filters. pytest 9.
- [x] P3 Plugin loader: scan `plugins/*/plugin.json` (không hard-code tên), validate manifest +
      min_core_version, topo-sort `depends_on`, skip lỗi nhưng app vẫn start, mount router
      `/api/v1/plugins/<name>`, upsert perms, per-plugin migrations + version table riêng,
      `/core/plugins` + `/core/menu`. pytest 16.
- [x] P4 opera_cloud backend: CRUD + q/filter/page + `.xlsx` export + audit + daily expiry. pytest 23.
- [x] P5 Frontend core: login, Layout, 5 page CRUD, `plugin_registry.ts` (4 globs). tsc + build sạch.
- [x] P6 opera_cloud frontend (self-contained react-only). P7 Docs: `api.md`, `schema.md`,
      README (hướng dẫn tạo plugin qua `hello`).

## Post-phase work
- **APScheduler wiring.** Core tạo 1 `BackgroundScheduler` (`main.py::_build_scheduler`), truyền
  vào `load_plugins(app, scheduler=...)`, start **sau** khi plugin đăng ký job, shutdown trong
  lifespan. Cron 02:05 của opera chạy thật. Loader signature không đổi, core không biết tên plugin.
  Thêm handler cho logger `app` (uvicorn chỉ config logger riêng nên `INFO` bị nuốt).
  Verify: `app: scheduler started with 1 job(s)`, 23 passed.
- **Core UI redesign** theo design system lấy từ autobrr. Thêm `tokens.css` + `app.css`, core pages
  chuyển từ inline style sang className. Sidebar (không phải navbar trên) vì số plugin sẽ tăng. Dark
  mode mặc định, set trước lúc paint. Verify: login → 5 page → tạo Department round-trip DB →
  toggle theme; tsc + build sạch.
- **Mobile drawer.** <900px sidebar thành off-canvas, mở bằng burger ở topbar sticky; đóng khi bấm
  link / scrim / Escape (focus về burger). Dùng `visibility` (không chỉ `transform`) để link ẩn
  không tab tới được. `grid-template-rows: auto 1fr` để topbar không bị giãn.

## Next phase
- **UI cho plugin mới** → đọc `docs/PLUGIN-UI.md`. Token lấy từ `frontend/src/styles/tokens.css`,
  copy sang `plugins/<tên>/frontend/theme.css`, import bằng `./theme.css` (đường dẫn tương đối
  nên chạy được cả host lẫn Docker mount `/plugins`).
- Áp design system cho `plugins/opera_cloud/frontend/index.tsx` — hiện **100% inline style**
  (0 `className`, 9 `style={{}}`). Cân nhắc `scripts/check-plugin-ui.mjs` chặn token lệch trong CI.
- Tồn đọng: httpx2 TestClient fix, đổi seed admin password cho deploy thật.

## Decisions beyond brief
- (P1–P7: PUT partial-update, JSONB roles/privileges, export col width 20, expiry audit actor
  None, plugin import fallback names, `_MOUNTED` guard — chi tiết trong git history.)
- Không CSS framework. Core dùng 2 file CSS tự viết + design token; plugin tự mang `theme.css`.
- Sidebar, không phải navbar trên: nhiều plugin sẽ tới, danh sách dọc có chỗ.
- Dark mode mặc định (`localStorage: ui-theme`). Dark là **đảo ramp** chứ không phải đảo class →
  không cần `dark:` variant, không cần JS trong plugin.
- Breakpoint app shell = 900px (không phải 996px): sidebar 248px + bảng rộng gấp sớm hơn.
- Transition `visibility` dùng `0s duration + delay`; duration thật làm computed value kẹt ở
  trạng thái đầu, drawer không trượt vào.

## File map
- `docs/PLUGIN-UI.md` — thứ tự đọc, token contract, class catalog, template, checklist.
- `backend/app/main.py` — `_build_scheduler()`, lifespan scheduler, app logger handler.
- `frontend/src/styles/tokens.css` — **nguồn token duy nhất** (copy sang plugin).
- `frontend/src/styles/app.css` — shell, panel, table, form, badge, drawer, login.
- `frontend/src/Layout.tsx` — sidebar + drawer + burger + theme toggle; `PageHead`/`Empty`/`ErrorNote`.
- `frontend/index.html` — font + `data-theme` trước lúc paint. `main.tsx`, `pages/*.tsx` — core UI.
- `plugins/opera_cloud/frontend/index.tsx` — ví dụ tham chiếu; **chưa** áp design system.

## How to run and test
- Docker: `docker compose up -d --build` → backend :8100, frontend :8101.
- **Không Docker**: PostgreSQL 16 native ở `localhost:5433` (user `registry`, db
  `account_registry` — xem `.env`), rồi `cd backend && alembic upgrade head &&
  uvicorn app.main:app --port 8100`. Chạy `alembic` bằng console script từ `backend/`
  (`python -m alembic` fail vì folder `backend/alembic/` che package).
- Frontend dev: `cd frontend && VITE_PROXY_TARGET=http://localhost:8100 npm run dev` (:5173).
- Test: `cd backend && python -m pytest tests/ -q` (23 passed), export `DATABASE_URL` trước.
  `cd frontend && npx tsc --noEmit && npm run build` (cả hai sạch). Login dev `admin`/`Admin123!`.
  Log startup của backend có `app: scheduler started with 1 job(s)`.

## Known issues
- Scheduler giả định 1 process backend. `uvicorn --workers N` (N>1) → N scheduler → cron chạy N lần.
- `opera_cloud/frontend/index.tsx` import `@tanstack/react-query` dù README cấm — vite alias nên
  vẫn chạy, nhưng doc và code lệch nhau. Sửa khi áp design system cho plugin.
- Test browser headless có `document.hidden = true` nên CSS transition bị đóng băng
  (`currentTime = 0`); xác minh animation phải ép frame bằng `browser.screenshot`. Cosmetic:
  TestClient deprecation (cần httpx2), SAWarning double-import, seed admin chỉ dùng dev.
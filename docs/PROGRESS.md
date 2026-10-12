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
      `/api/v1/plugins/<name>`, upsert perms, per-plugin migrations riêng, `/core/{plugins,menu}`.
- [x] P4 opera_cloud backend: CRUD + q/filter/page + `.xlsx` export + audit + daily expiry.
- [x] P5 Frontend core: login, Layout, 5 page CRUD, `plugin_registry.ts` (4 globs). P6 opera_cloud
      frontend (react-only). P7 Docs: `api.md`, `schema.md`, README.
- [x] APScheduler wiring + core UI redesign + mobile drawer (chi tiết trong git history).

## Post-phase work
- **Plugin UI trên design system.** `plugins/opera_cloud/frontend/` giờ có `index.tsx` +
  `theme.css` (copy token `tokens.css` + class `app.css`, bỏ shell), import `./theme.css` nên
  chạy được cả host lẫn Docker mount. 0 inline style / 0 hex; form có label + `htmlFor`, select
  cho FK, filter có `aria-label`, `can()` ẩn nút thiếu quyền, panel "No access" khi mất quyền view.
- **`@tanstack` gỡ khỏi plugin**, thay bằng `useRes(fetcher, deps, enabled)` + `usePerms()`
  (~40 dòng). `vite.config.ts` **không alias** `@tanstack/react-query` nữa → vi phạm rule giờ
  là build error, không phải ghi chú.
- **`scripts/check-plugin-ui.mjs`** (`npm --prefix frontend run check:plugin-ui`): diff token từng
  `plugins/*/frontend/theme.css` với core (từng biến, cả `:root` + dark), chặn import
  `frontend/src`/`@tanstack`, hex, inline style màu thật, thiếu `export const routes`, dùng class
  core mà không ship `theme.css`. Node builtins, không dependency.
- **Lỗi 422 đọc được.** FastAPI trả `detail` là list `{loc,msg}`; trước đây UI in raw JSON.
  `fmtDetail()` (`frontend/src/api.ts`) + `msg()` (plugin) → `email: value is not a valid email
  address`. **`.btn--sm`** thêm vào `app.css` (catalog đã nhắc nhưng chưa định nghĩa) + copy.

## Next phase
- Wire `npm run check:plugin-ui` vào CI (repo chưa có CI). Tồn đọng: httpx2 TestClient fix, đổi
  seed admin password cho deploy thật.

## Decisions beyond brief
- (P1–P7: PUT partial-update, JSONB roles/privileges, export col width 20, expiry audit actor
  None, plugin import fallback names, `_MOUNTED` guard — xem git history.)
- Không CSS framework. Core dùng 2 file CSS tự viết + design token; plugin tự mang `theme.css`
  **và** được `scripts/check-plugin-ui.mjs` giữ đồng bộ (thay ghi chú "sửa mọi plugin").
- Plugin tự viết `.pagehead` (copy markup `PageHead` của core): core chỉ render shell, bỏ header thì
  plugin lệch với trang Users/Roles. Inline style chỉ còn cho layout; `color: var(--text-accent)`
  được phép (giống `PageHead` core), checker chỉ fail khi còn màu thật trong `style={{}}`.
- Sidebar (không phải navbar trên) vì nhiều plugin sẽ tới; breakpoint app shell 900px; transition
  `visibility` dùng `0s duration + delay`. Dark mode mặc định; dark là **đảo ramp** chứ không phải
  đảo class → không cần `dark:` variant, không cần JS trong plugin (verify: badge `#e6f6eb`→`#132d21`).

## File map
- `docs/PLUGIN-UI.md` — thứ tự đọc, token contract, class catalog, template react-only, checklist.
- `scripts/check-plugin-ui.mjs` — guard token drift + iron rules của plugin UI.
- `backend/app/main.py` — `_build_scheduler()`, lifespan scheduler, app logger handler.
- `frontend/src/styles/tokens.css` — **nguồn token duy nhất**; `app.css` — shell, panel, table,
  form, badge, drawer, login; `api.ts` — `api()`, `errMsg()` + `fmtDetail()` cho lỗi 422.
- `frontend/src/Layout.tsx` — sidebar + drawer + burger + theme toggle; `PageHead`/`Empty`.
- `frontend/vite.config.ts` — alias react cho plugin (không alias `@tanstack`).
- `plugins/opera_cloud/frontend/{index.tsx,theme.css}` — mẫu plugin UI hoàn chỉnh.

## How to run and test
- Docker: `docker compose up -d --build` → backend :8100, frontend :8101.
- **Không Docker**: Postgres 16 native ở `localhost:5433` (xem `.env`), rồi `cd backend && alembic
  upgrade head && uvicorn app.main:app --port 8100`. `alembic` phải chạy bằng console script từ
  `backend/` (`python -m alembic` fail vì folder `backend/alembic/` che package); uvicorn chạy từ
  repo root, nếu không loader không import được `plugins.*` và sẽ bỏ qua plugin.
- Frontend dev: `cd frontend && VITE_PROXY_TARGET=http://localhost:8100 npm run dev` (:5173).
- Test: `cd backend && python -m pytest tests/ -q` (23 passed), export `DATABASE_URL` trước.
  `cd frontend && npm run check:plugin-ui && npx tsc --noEmit && npm run build` (cả ba sạch).

## Known issues
- Scheduler giả định 1 process backend: `uvicorn --workers N` (N>1) → N scheduler → cron chạy N lần.
- Test browser headless có `document.hidden = true` nên CSS transition bị đóng băng
  (`currentTime = 0`); xác minh animation phải ép frame bằng `browser.screenshot`. Cosmetic:
  TestClient deprecation (cần httpx2), SAWarning double-import, seed admin chỉ dùng dev.
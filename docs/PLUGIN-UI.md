# Plugin UI — làm giao diện plugin khớp với core

Mục đích: khi viết `plugins/<tên>/frontend/index.tsx`, giao diện phải **trông như
được viết cùng lúc với core UI**, mà không cần đọc toàn bộ `frontend/src`.

Áp dụng design system của autobrr (xem `design.md` ở repo cha nếu cần nguồn gốc token).

---

## 1. Iron rule (không được phá)

Từ `AGENTS.md` + `README.md`:

- Plugin UI **react-only + self-contained**: tự `fetch`, tự `can()` qua
  `GET /api/v1/core/auth/me`.
- **Không import từ `frontend/src`** — file plugin nằm ngoài root của frontend, không
  resolve được trong Docker build.
- Core **không bao giờ** biết tên plugin. Thêm folder `plugins/<tên>/` là đủ.

Hệ quả quan trọng: **plugin phải mang theo token của riêng nó.** Đây là điểm mới so
với "inline styles only" thời Phase 5. Hệ quả thứ hai: **không có `@tanstack`** trong
plugin — `useRes`/`usePerms` trong template là bản thay thế, và `vite.config.ts` cố ý
không alias `@tanstack` để rule này thành build error chứ không phải ghi chú.

---

## 2. Đọc gì, theo thứ tự

Đây là câu trả lời cho "cần đọc gì". Đọc **đúng 3 file**, theo thứ tự này:

| # | File | Vì sao | Quy mô |
|---|---|---|---|
| 1 | `frontend/src/styles/tokens.css` | **Nguồn token duy nhất.** Copy nguyên khối `:root` + `:root[data-theme='dark']`. | ~190 dòng |
| 2 | `docs/PLUGIN-UI.md` (file này) | Class catalog + template. | — |
| 3 | `frontend/src/pages/Departments.tsx` | Ví dụ tham chiếu gần nhất, đúng cấu trúc CRUD + panel + form. | 80 dòng |

**Không cần đọc**: `Layout.tsx`, `main.tsx`, `api.ts`, `auth.tsx`, hay các page khác.
`api.ts` và `auth.tsx` là của core — plugin tự có bản riêng.

Mẫu thật hoàn chỉnh: `plugins/opera_cloud/frontend/` — `index.tsx` + `theme.css`,
react-only, có empty state / alert / phân trang / gate theo permission. Copy cặp file
này thay vì viết lại từ template bên dưới.

---

## 3. Token contract

Plugin tạo **`plugins/<tên>/frontend/theme.css`**, import bằng đường dẫn tương đối:

```tsx
import './theme.css'   // hoạt động cả khi host checkout lẫn Docker mount /plugins
```

Đường dẫn tương đối trong chính folder của plugin nên **không phụ thuộc vị trí mount** —
đây là lý do dùng `./theme.css` chứ không phải `@import "../../frontend/src/..."`.

Nội dung `theme.css` — **copy nguyên văn**, chỉ bỏ phần `*, ::before` reset (core đã có):

```css
:root {
  /* --- slate: 12 bậc, dark mode ĐẢO thứ tự --- */
  --slate-1: #fcfcfd; --slate-2: #f9f9fb; --slate-3: #f0f0f3; --slate-4: #e8e8ec;
  --slate-5: #e0e1e6; --slate-6: #d9d9e0; --slate-7: #cdced6; --slate-8: #b9bbc6;
  --slate-9: #8b8d98; --slate-10: #80838d; --slate-11: #60646c; --slate-12: #1c2024;

  /* --- accent + semantic --- */
  --blue-3: #e6f4fe; --blue-6: #acd8fc; --blue-9: #0090ff;
  --blue-10: #0588f0; --blue-11: #0569c0;
  --green-3: #e6f6eb; --green-6: #adddc0; --green-9: #30a46c; --green-11: #218358;
  --red-3: #feebec; --red-6: #f4a9aa; --red-9: #e5484d; --red-11: #ce2c31;
  --gold-3: #f2f0e7; --gold-5: #e1dccf; --gold-8: #b9a88d; --gold-11: #71624b;

  --bg-page: var(--slate-2);      /* nền trang */
  --bg-surface: var(--slate-3);   /* navbar, sidebar */
  --bg-card: var(--slate-1);      /* panel */
  --text-strong: var(--slate-12);
  --text-body: var(--slate-11);
  --text-muted: var(--slate-10);
  --text-faint: var(--slate-9);
  --text-accent: var(--blue-11);
  --border-subtle: var(--slate-4);
  --border-base: var(--slate-5);
  --border-strong: var(--slate-6);
  --border-hover: var(--slate-7);
  --accent-fill: var(--blue-9);        /* nút primary */
  --accent-fill-hv: var(--blue-10);
  --accent-subtle: var(--blue-3);     /* nền active */
  --danger-solid: var(--red-9);

  --font-sans: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-display: "Schibsted Grotesk", "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --tracking-display: -0.02em;
  --tracking-label: 0.08em;

  --radius-pill: 999px; --radius-lg: 14px; --radius-md: 12px;
  --radius-btn: 10px; --radius-icon: 9px; --radius-sm: 8px; --radius-base: 0.4rem;
  --shadow-tl: 0 12px 28px 0 rgba(0,0,0,.2), 0 2px 4px 0 rgba(0,0,0,.1);
  --t-ui: .12s;
}

/* Dark mode là MẶC ĐỊNH của sản phẩm. Core đặt data-theme trước lúc paint;
   plugin chỉ cần dùng đúng tên biến là tự đúng theo. */
:root[data-theme='dark'] {
  --slate-1: #111113; --slate-2: #18191b; --slate-3: #212225; --slate-4: #272a2d;
  --slate-5: #2e3135; --slate-6: #363a3f; --slate-7: #43484e; --slate-8: #5a6169;
  --slate-9: #696e77; --slate-10: #777b84; --slate-11: #afb3ba; --slate-12: #edeef0;
  --blue-3: #0d2847; --blue-6: #104d87; --blue-10: #59a9f8; --blue-11: #70b8ff;
  --green-3: #132d21; --green-6: #1b543a; --green-11: #3dd68c;
  --red-3: #3b1219; --red-6: #72232d; --red-11: #ff9592;
  --gold-3: #24231f; --gold-5: #38352e; --gold-11: #cbb99f;
  --text-accent: var(--blue-10);
}
```

> **Dark mode không cần `dark:` variant, không cần JS.** Vì dark mode là **đảo ramp**
> chứ không phải đảo class: `slate-1` đổi từ `#fcfcfd` → `#111113`, *tên biến không đổi*.
> Bất kỳ rule nào viết `var(--slate-1)` đều tự đúng theo theme.

---

## 4. Class catalog

Tên class giống hệt `frontend/src/styles/app.css` — dùng lại nguyên xi, **không đặt tên mới**.
Khai báo chúng trong `theme.css` của plugin (copy từ `app.css`, bỏ phần sidebar/topbar/login
vì plugin không có shell).

```
panel          card chứa bảng/form      .panel__head .panel__title .panel__meta .panel__body
table          bảng dữ liệu             .tablewrap .table  + cell: .num .strong .sub .trunc .actions
input/select   ô nhập                   .field > .label , .fieldgrid (lưới label + input)
btn            nút                       .btn--primary .btn--ghost .btn--danger .btn--sm
badge          trạng thái               .badge--ok .badge--off .badge--info .badge--warn .badge--danger
alert          băng lỗi/thành công      .alert--err .alert--ok
empty          rỗng                      .empty__title .empty__text
pager          phân trang                (dùng .btn--ghost + span)
chips / chip   tag nhỏ
search         ô tìm kiếm có icon       .search__icon
toolbar .row .spacer .hint .mono
```

### Quy tắc áp dụng

| Việc | Làm thế nào |
|---|---|
| Nền | `.panel` (slate-1 + border slate-5). **Không dùng shadow.** |
| Tiêu đề trang | Core render **shell**, không render tiêu đề route. Plugin tự viết `.pagehead` giống hệt `PageHead` của core: `<p className="mono">kicker</p> + <h1>title</h1> + <p>lead</p>`. Không dùng `<h1 style>`. |
| Tiêu đề panel | `<span className="panel__title">` (mono, uppercase, auto) |
| Nút hành động chính | `.btn .btn--primary` — **tối đa 1** trên màn hình |
| Nút phụ | `.btn .btn--ghost` (`.btn--sm` cho nút trong ô bảng) |
| Xoá | `.btn .btn--danger` |
| Cột ID / số | `.sub` hoặc `.num` |
| Tên chính trong ô | `.strong` |
| Trạng thái | `.badge .badge--ok` / `--warn` / `--danger` (có chấm tròn `::before` sẵn) |
| Lỗi API | `<div className="alert alert--err" role="alert">` |
| Font | Dùng `var(--font-*)`. **Không hard-code hex.** |

> **Lỗi 422**: FastAPI trả `detail` là list `{loc, msg}`. Đừng `JSON.stringify` — format
> thành `email: value is not a valid email address`. `plugins/opera_cloud/frontend/index.tsx`
> (`msg()`) và `frontend/src/api.ts` (`fmtDetail()`) đã có sẵn, copy đoạn đó.

---

## 5. Template `index.tsx`

Bắt đầu từ đây. Thay `widget` thành tên thật, đổi endpoint, thêm trường.

> **Không `@tanstack`.** Plugin file nằm ngoài root nên không resolve được
> `node_modules`; `vite.config.ts` cố tình **không alias** nó, nên import là build
> error. Thay bằng `useRes` + `usePerms` bên dưới (~40 dòng, đủ dùng).

```tsx
import { useCallback, useEffect, useState } from 'react'
import './theme.css'                    // token + class của plugin

const BASE = ''                          // đi qua vite proxy, không hard-code host

interface Row { id: number; name: string; active: boolean }
interface Page<T> { items: T[]; total: number; page: number; page_size: number }

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const access = localStorage.getItem('access_token')
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { detail?: string }).detail ?? `http_${res.status}`)
  return body as T
}

/** Fetch + loading/error. Stands in for react-query: `deps` = query key. */
function useRes<T>(fetcher: () => Promise<T>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(enabled)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  useEffect(() => {
    if (!enabled) return setLoading(false)
    let alive = true
    setLoading(true)
    fetcher()
      .then((d) => alive && (setData(d), setError('')))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'failed'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [...deps, nonce, enabled])
  return { data, error, loading, reload }
}

/** Own permission check — core exposes nothing importable to a plugin. */
function usePerms() {
  const me = useRes<{ permissions: string[] }>(() => api('/api/v1/core/auth/me'), [])
  const perms = me.data?.permissions ?? []
  return {
    ready: !me.loading && !me.error, // gates the forbidden branch
    can: (p: string) => perms.includes('*') || perms.includes(p),
  }
}

export const routes = [
  { path: '/widget', element: <Widget /> },
]

function Widget() {
  const { can, ready } = usePerms()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [err, setErr] = useState('')

  const list = useRes<Page<Row>>(
    () => api(`/api/v1/plugins/widget/items?q=${encodeURIComponent(q)}&page=${page}`),
    [q, page],
  )
  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0

  if (ready && !can('widget.view')) return <p>No access — needs widget.view</p>

  return (
    <>
      <div className="pagehead">
        <div>
          <p className="mono" style={{ color: 'var(--text-accent)' }}>Plugin · widget</p>
          <h1>Widget</h1>
        </div>
        <button className="btn btn--primary">Create</button>
      </div>

      <div className="toolbar">
        <div className="search">
          <input className="input" value={q} placeholder="search…"
                 aria-label="Search"
                 onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        </div>
        <span className="spacer" />
        <div className="pager">
          <button className="btn btn--ghost btn--sm" disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>page {page} · {total} total</span>
          <button className="btn btn--ghost btn--sm"
                  disabled={items.length === 0 || page * 20 >= total}
                  onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {err && <div className="alert alert--err" role="alert">{err}</div>}

      <div className="panel">
        <div className="panel__head">
          <span className="panel__title">Items</span>
          <span className="panel__meta">{list.loading ? 'loading…' : `${items.length} shown`}</span>
        </div>
        {items.length === 0 ? (
          <div className="empty">
            <h3 className="empty__title">Nothing here</h3>
            <p className="empty__text">Create the first one to get started.</p>
          </div>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr><th>id</th><th>name</th><th>status</th><th className="actions">action</th></tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="sub">{r.id}</td>
                    <td className="strong">{r.name}</td>
                    <td>
                      <span className={r.active ? 'badge badge--ok' : 'badge badge--off'}>
                        {r.active ? 'active' : 'disabled'}
                      </span>
                    </td>
                    <td className="actions">
                      <button className="btn btn--ghost btn--sm">Enable</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
```

> `export const routes` là **bắt buộc** — `frontend/src/plugin_registry.ts` đọc đúng tên này.
> `path` phải khớp `menu[].path` trong `plugin.json`.

---

## 6. Checklist trước khi commit

- [ ] `theme.css` copy nguyên khối token từ `frontend/src/styles/tokens.css` (cả `:root` **và** dark)
- [ ] **0** hex literal, **0** inline style mang màu thật (`var(--token)` thì được)
- [ ] Có `.empty` khi danh sách rỗng — không để trống trơn
- [ ] Có `.alert alert--err` khi API lỗi; lỗi 422 format theo field, không raw JSON
- [ ] Mọi `<input>` có `<label>` (dùng `htmlFor`/`id`)
- [ ] `aria-label` cho mọi nút icon-only / filter select
- [ ] Nút hành động chính dùng `--primary`; xoá dùng `--danger`
- [ ] `export const routes` có mặt, `path` khớp `plugin.json`
- [ ] Không import từ `frontend/src`, không `@tanstack`, không hard-code tên plugin khác
- [ ] `cd frontend && npm run check:plugin-ui && npx tsc --noEmit && npm run build` — cả ba sạch

---

## 7. Verify

```bash
docker compose up -d --build
curl localhost:8100/api/v1/core/plugins          # plugin của bạn có trong list?
cd frontend && npm run check:plugin-ui           # token copy khớp core?
cd frontend && npx tsc --noEmit && npm run build # sạch?
```

Rồi mở `localhost:8101`, đăng nhập, vào menu của plugin, **bật toggle theme** và so:
panel / bảng / nút / badge của plugin có khớp trang Users/Roles không.

Đừng tin mắt: thử cả 3 nhánh — danh sách rỗng, có bản ghi, và tài khoản **không** có
permission (thấy `.empty` "No access", không thấy nút Create/Edit/Delete).

Chỉ khi đó mới assign permission cho role (`PUT /roles/{id}`) để menu hiện.

---

## 8. Chống drift

`theme.css` của plugin là **bản copy**, nên sẽ lệch so với core nếu ai đó sửa token ở
core rồi quên đồng bộ. `scripts/check-plugin-ui.mjs` (`npm --prefix frontend run
check:plugin-ui`) diff từng `plugins/*/frontend/theme.css` với core — từng biến, cả
`:root` lẫn dark — và fail (exit 1) nếu lệch. Cùng lúc đó nó cũng chặn các lỗi đã từng
lọt: import `frontend/src`, import `@tanstack`, hex literal, inline style mang màu
thật, hoặc thiếu `export const routes`.

Chạy nó trong CI, hoặc ít nhất trước mỗi commit có đụng `frontend/src/styles/`.
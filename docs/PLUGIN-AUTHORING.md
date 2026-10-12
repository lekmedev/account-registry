# PLUGIN-AUTHORING — viết một plugin cho Account Registry

Đây là **tài liệu duy nhất** bạn cần đọc để viết plugin. Không cần đọc
`backend/app/core/` hay `frontend/src/`: core đã đóng hợp đồng ở đây.

> Ứng dụng lưu **registry nội bộ** của một loại tài khoản doanh nghiệp. Không gọi
> hệ thống ngoài. Plugin của bạn thêm *loại tài khoản* đó vào registry. Core không
> biết tên plugin của bạn, và bạn không được sửa core.

---

## 0. Trong 5 phút

```bash
git clone <repo> && cd account-registry
docker compose up -d --build
node scripts/new-plugin.mjs my_plugin "My Plugin"
```

Lệnh đó tạo `plugins/my_plugin/` chạy được ngay: bảng + migration + CRUD + export +
UI + test. Việc của bạn là **đổi ngữ cảnh nghiệp vụ**, không phải viết hạ tầng.

Đọc tiếp theo thứ tự này, dừng lại ở từng mục khi đã đủ:

| # | Đọc gì | Khi nào đọc |
|---|---|---|
| 1 | file này, §1–§4 | luôn |
| 2 | `plugins/my_plugin/` — đã chạy, đọc để biết chỗ sửa | luôn |
| 3 | `docs/PLUGIN-UI.md` — token, class, a11y | khi làm UI |
| 4 | `plugins/opera_cloud/` — ví dụ thật, giàu hơn template | khi cần pattern lạ |

Muốn xem hệ thống chạy thật thì đăng nhập `localhost:8101` (`admin` / `Admin123!`,
chỉ dùng dev) và vào menu của plugin vừa tạo.

---

## 1. Core cho sẵn gì (cứ dùng, đừng tự viết)

| Cần | Import từ đây | Ghi chú |
|---|---|---|
| DB session | `from app.core.db import get_db` | `Depends(get_db)` trong route |
| Lớp base SQLAlchemy | `from app.core.db import Base` | bảng của bạn kế thừa `Base` |
| Phân trang | `from app.core.db import paginate` | trả `(rows, total)` |
| Kiểu trả về có phân trang | `from app.core.schemas import Page` | `Page[ItemOut](items=…, total=…, page=…, page_size=…)` |
| Bắt buộc có quyền | `from app.core import auth` → `auth.require_permission("code")` | trả 401 nếu chưa đăng nhập, 403 nếu thiếu quyền |
| Ghi audit | `from app.core import audit` → `audit.log(db, actor_id=…, action=…, resource=…, resource_id=…, details={…})` | chỉ flush; caller tự commit |
| Lỗi domain → HTTP | `from app.core.services import ConflictError, NotFoundError` | `ConflictError`→409, `NotFoundError`→404 |
| Bảng lõi để FK | `from app.core import models as core_models` | `Department`, `Position`, `User` |
| Hẹn giờ | `tasks.py::register_tasks(scheduler)` | core tạo 1 scheduler và gọi hàm này |
| Menu sidebar | `plugin.json` → `menu[]` | core lọc theo quyền của user |
| Kiểm tra quyền ở UI | `GET /api/v1/core/auth/me` → `permissions[]` | plugin tự fetch, không import core |

---

## 2. Hợp đồng file (loader gọi đúng tên này)

```
plugins/my_plugin/
├── __init__.py                      ← BẮT BUỘC nếu bạn có tests/ (xem §6)
├── plugin.json                      ← manifest, 6 khoá bắt buộc
├── permissions.py                   ← PERMISSIONS: list[{code, description}]
├── models.py                        ← class(Base), tự import được
├── services.py                      ← toàn bộ business logic
├── routes.py                        ← router = APIRouter(), chỉ map lỗi
├── tasks.py                         ← không bắt buộc: register_tasks(scheduler)
├── migrations/
│   ├── __init__.py
│   └── versions/0001_*.py           ← revision, down_revision = None
├── frontend/
│   ├── index.tsx                    ← export const routes
│   └── theme.css                    ← copy token/class của core
└── tests/
    ├── __init__.py
    ├── conftest.py                  ← sys.path + re-export fixture
    └── test_crud.py
```

| File | Loader đòi | Gọi vào thế nào |
|---|---|---|
| `plugin.json` | đủ 6 khoá: `name`, `version`, `description`, `min_core_version`, `depends_on`, `menu` | `name` phải **khớp tên folder** |
| `permissions.py` | `PERMISSIONS = [{"code": …, "description": …}]` | upsert vào bảng quyền lõi, không bao giờ xoá |
| `models.py` | bất kỳ class nào kế thừa `Base` | loader import để đăng ký bảng |
| `routes.py` | `router = APIRouter()` ở cấp module | mount tại `/api/v1/plugins/<name>` |
| `tasks.py` | `register_tasks(scheduler)` | gọi 1 lần sau khi plugin load (nếu có file) |
| `migrations/versions/*.py` | `revision`, `down_revision`, `upgrade()`, `downgrade()` | chạy trên version table riêng `alembic_version_<name>` |
| `frontend/index.tsx` | `export const routes = [{ path, element }]` | `path` phải khớp `menu[].path` |

**Cửa vào trong Python luôn phòng thủ.** Loader có thể import module của bạn dưới
tên sinh ra (`account_registry_plugin_<name>_services`) *hoặc* dưới tên package:

```python
try:
    from plugins.my_plugin.models import Thing
except ImportError:  # loader-generated module name
    from account_registry_plugin_my_plugin_models import Thing  # type: ignore
```

Bỏ `try/except` thì plugin sẽ chạy được ở Docker nhưng fail khi test — hoặc ngược lại.

---

## 3. Quy tắc backend

1. **Route mỏng.** Route chỉ nhận input, gọi `services`, map lỗi. Không có SQL, không
   có `if` nghiệp vụ trong `routes.py`.
2. **Validate bằng Pydantic v2.** Mọi input vào DB đều qua schema
   (`RecordCreate` / `RecordUpdate`). Không tin query param.
3. **PUT là partial update.** Field `None` = không đổi. Đây là quy ước của cả core.
4. **`IntegrityError` → `ConflictError`** (409). Không để user thấy 500.
5. **FK không tồn tại → `NotFoundError`** (404), kiểm tra bằng `db.get(core_models.X, id)`.
6. **FK tới bảng lõi dùng `ondelete="SET NULL"` + `nullable=True`.** Không CASCADE — dữ
   liệu của bạn là dữ liệu kinh doanh.
7. **Mọi lần ghi đều `audit.log(...)`** với `actor_id` lấy từ dependency. Job nền thì
   để `actor_id=None` và `action` riêng (`"expire"`).
8. **Đừng thêm `extend_existing`.** Loader đăng ký module plugin dưới **cả hai** tên
   (`plugins.<tên>.<mod>` và tên sinh ra) nhưng chỉ thực thi file **một lần**, nên model
   được định nghĩa đúng một lần — `extend_existing` chỉ giấu lỗi double-import thật.
9. **Trả Pydantic model, không trả object SQLAlchemy.** Enrich tên bảng lõi trong
   `services`, đừng để route tự `.name` của FK.
10. **Đừng sửa `backend/app/core/` hay `frontend/src/`.** Cần thêm gì đó? Ghi vào
    `docs/PROGRESS.md` rồi hỏi; đừng tự vá.

---

## 4. Quy tắc UI (chi tiết ở `docs/PLUGIN-UI.md`)

1. **React-only + self-contained.** Chỉ import `react` và CSS của chính bạn. Cấm
   `frontend/src`, cấm `@tanstack` — `vite.config.ts` cố tình không alias nó nên
   import sẽ **fail build**.
2. **`theme.css` là bắt buộc** khi trang dùng class của design system. Bản copy token
   của core; `npm run check:plugin-ui` diff từng biến và fail nếu lệch.
3. **`export const routes`** — `plugin_registry.ts` chỉ đọc đúng tên này.
4. **Tự kiểm tra quyền**: `GET /api/v1/core/auth/me` → `can(code)`. Ẩn nút user không
   có quyền; thiếu cả quyền view thì hiện panel "No access".
5. **Lỗi 422 hiện theo field**, không phải raw JSON.
6. **A11y**: mọi input có `<label htmlFor>`, filter select có `aria-label`, bảng có
   `.empty` khi rỗng, lỗi có `role="alert"`.
7. **0 hex, 0 inline style mang màu thật.** Chỉ còn style cho layout.

---

## 5. Test — ở trong plugin, không sửa `backend/tests/`

Test của bạn nằm cạnh code bạn: `plugins/my_plugin/tests/test_crud.py`. Chạy chung
với mọi test của repo:

```bash
cd backend && python -m pytest -q        # export DATABASE_URL trước
```

Dùng fixture có sẵn từ `tests/conftest.py` (core), `tests/conftest.py` của bạn chỉ
re-export:

```python
from tests.conftest import app_factory, login  # noqa: F401

@pytest.fixture(scope="module")
def plug(app_factory):
    return app_factory("my_plugin")   # khẳng định plugin của bạn load được
```

`app_factory()` tự tạo schema Postgres tạm, seed admin, chạy migration của **mọi**
plugin vào schema đó, rồi dọn sạp khi test xong. Bạn không cần dựng app.

**Bốn nhóm case bắt buộc** (template đã có sẵn):

| Nhóm | Vì sao |
|---|---|
| manifest + menu + permission | chứng minh loader thấy plugin và upsert quyền |
| migration chạy và version table đúng | migration hỏng là plugin chết âm thầm |
| RBAC: 401 khi chưa login, 403 khi thiếu quyền, 200 khi có | đây là ranh giới bảo mật |
| CRUD + `q`/filter + audit + 409/422/404 + export | hành vi người dùng thật sự thấy |

---

## 6. Definition of done

```bash
# 1. code của bạn load, menu hiện, migration chạy
docker compose up -d --build
curl localhost:8100/api/v1/core/plugins | grep my_plugin
curl localhost:8100/api/v1/core/menu    -H "Authorization: Bearer $TOKEN"

# 2. test — 23 test cũ + test của bạn, tất cả xanh
cd backend && python -m pytest -q

# 3. guard + typecheck + build
cd frontend && npm run check:plugin-ui && npx tsc --noEmit && npm run build

# 4. bằng chứng bằng mắt: mở localhost:8101, vào menu của bạn,
#    tạo/sửa/xoá 1 bản ghi, bấm Export, rồi bật toggle theme
```

Cả 3 lệnh ở bước 3 là **bắt buộc xanh**. Nếu `check:plugin-ui` báo lỗi token drift
thì copy lại token từ `frontend/src/styles/tokens.css`; nếu báo lỗi khác, đọc
`docs/PLUGIN-UI.md` §6.

---

## 7. Anti-pattern

| Đừng | Vì | Làm thay |
|---|---|---|
| Thêm tên plugin vào `backend/app/core` hoặc `frontend/src` | phá vỡ zero-core-edit | chỉ thêm folder dưới `plugins/` |
| Đặt template trong `plugins/` | loader nạp **mọi** folder có `plugin.json` → template sẽ chạy thành plugin thật | template ở `templates/plugin/` |
| Business logic trong `routes.py` | không test được, không tái dùng | `services.py` |
| Bỏ `try/except` khi import module của chính mình | fail ở Docker hoặc ở test | xem §2 |
| Bỏ `__init__.py` ở plugin có `tests/` | trùng module name với `backend/tests/conftest.py` → pytest báo "Plugin already registered" | copy từ template |
| Hard-code `localhost:8100` trong UI | hỏng khi chạy qua domain khác | để trống, đi qua vite proxy |
| Dùng `@tanstack` / import từ `frontend/src` | không resolve ngoài root → build fail hoặc chạy được ở host nhưng hỏng ở Docker | `useRes` trong template |
| Đặt hết thứ vào một bảng JSONB "cho nhanh" | mất filter/index/validate được | cột thật, JSONB chỉ cho list-of-string |
| Nhồi mọi thứ vào `services.py` một file 800 dòng | khó đọc hơn file core | tách theo concern, file vẫn nhỏ |

---

## 8. Khi nào cần sửa core

Gần như không. Ba trường hợp hợp lệ:

1. **Cần bảng/helper dùng chung cho ≥2 plugin** → đề xuất thêm vào core, kèm test.
2. **Cần permission lõi mới** (ví dụ `core.export.view`) → thêm vào core 10 quyền.
3. **Cần thay đổi contract loader** → nghĩ lại kiến trúc trước.

Cả 3 đều là thay đổi core, tức là vi phạm quy tắc của hệ thống. Ghi vào
`docs/PROGRESS.md` mục "Next phase" và để người duy trì repo quyết định — đừng tự
sửa trong PR của bạn.
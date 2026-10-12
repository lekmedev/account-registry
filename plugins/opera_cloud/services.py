"""opera_cloud business logic. Routes stay thin; everything happens here."""
from datetime import date
from io import BytesIO
from typing import Literal

from openpyxl import Workbook
from openpyxl.styles import Font
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import audit
from app.core import models as core_models
from app.core.db import paginate
from app.core.schemas import Page
from app.core.services import ConflictError, NotFoundError

try:
    from plugins.opera_cloud.models import OperaAccount
except ImportError:  # loaded by core plugin_loader under a generated module name
    from account_registry_plugin_opera_cloud_models import OperaAccount  # type: ignore

AccountStatus = Literal["active", "disabled", "expired"]

EXPORT_COLUMNS = [
    "id", "username", "email", "employee_name", "employee_id",
    "department_id", "position_id", "operator_code", "roles",
    "privileges", "account_status", "expiration_date",
    "created_at", "updated_at", "created_by",
]


class OperaAccountCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    email: EmailStr
    employee_name: str = Field(min_length=1, max_length=128)
    employee_id: str = Field(min_length=1, max_length=64)
    department_id: int | None = None
    position_id: int | None = None
    operator_code: str = Field(min_length=1, max_length=64)
    roles: list[str] = Field(default_factory=list)
    privileges: list[str] = Field(default_factory=list)
    account_status: AccountStatus = "active"
    expiration_date: date | None = None


class OperaAccountUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=64)
    email: EmailStr | None = None
    employee_name: str | None = Field(default=None, min_length=1, max_length=128)
    employee_id: str | None = Field(default=None, min_length=1, max_length=64)
    department_id: int | None = None
    position_id: int | None = None
    operator_code: str | None = Field(default=None, min_length=1, max_length=64)
    roles: list[str] | None = None
    privileges: list[str] | None = None
    account_status: AccountStatus | None = None
    expiration_date: date | None = None


class OperaAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    employee_name: str
    employee_id: str
    department_id: int | None = None
    department_name: str | None = None
    position_id: int | None = None
    position_name: str | None = None
    operator_code: str
    roles: list[str] = []
    privileges: list[str] = []
    account_status: str
    expiration_date: date | None = None
    created_at: object | None = None
    updated_at: object | None = None
    created_by: int | None = None


def _check_fk(db: Session, department_id: int | None, position_id: int | None) -> None:
    if department_id is not None and db.get(core_models.Department, department_id) is None:
        raise NotFoundError("department_not_found")
    if position_id is not None and db.get(core_models.Position, position_id) is None:
        raise NotFoundError("position_not_found")


def _out(db: Session, acc: OperaAccount) -> OperaAccountOut:
    dept_name = pos_name = None
    if acc.department_id:
        d = db.get(core_models.Department, acc.department_id)
        dept_name = d.name if d else None
    if acc.position_id:
        p = db.get(core_models.Position, acc.position_id)
        pos_name = p.name if p else None
    return OperaAccountOut(
        id=acc.id, username=acc.username, email=acc.email,
        employee_name=acc.employee_name, employee_id=acc.employee_id,
        department_id=acc.department_id, department_name=dept_name,
        position_id=acc.position_id, position_name=pos_name,
        operator_code=acc.operator_code,
        roles=list(acc.roles or []), privileges=list(acc.privileges or []),
        account_status=acc.account_status, expiration_date=acc.expiration_date,
        created_at=acc.created_at, updated_at=acc.updated_at,
        created_by=acc.created_by,
    )


def _filtered(db: Session, *, q=None, department_id=None, position_id=None,
              account_status=None):
    query = db.query(OperaAccount).order_by(OperaAccount.id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            OperaAccount.username.ilike(like),
            OperaAccount.email.ilike(like),
            OperaAccount.employee_name.ilike(like),
            OperaAccount.employee_id.ilike(like),
            OperaAccount.operator_code.ilike(like),
        ))
    if department_id is not None:
        query = query.filter(OperaAccount.department_id == department_id)
    if position_id is not None:
        query = query.filter(OperaAccount.position_id == position_id)
    if account_status is not None:
        query = query.filter(OperaAccount.account_status == account_status)
    return query


def list_accounts(db: Session, *, q=None, department_id=None, position_id=None,
                  account_status=None, page=1, page_size=20) -> Page[OperaAccountOut]:
    rows, total = paginate(
        _filtered(db, q=q, department_id=department_id, position_id=position_id,
                  account_status=account_status),
        page, page_size,
    )
    return Page[OperaAccountOut](
        items=[_out(db, r) for r in rows], total=total, page=page, page_size=page_size
    )


def create_account(db: Session, data: OperaAccountCreate, *, actor_id: int) -> OperaAccountOut:
    _check_fk(db, data.department_id, data.position_id)
    acc = OperaAccount(
        username=data.username, email=str(data.email),
        employee_name=data.employee_name, employee_id=data.employee_id,
        department_id=data.department_id, position_id=data.position_id,
        operator_code=data.operator_code,
        roles=list(data.roles), privileges=list(data.privileges),
        account_status=data.account_status, expiration_date=data.expiration_date,
        created_by=actor_id,
    )
    db.add(acc)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ConflictError("username_or_operator_code_taken")
    audit.log(db, actor_id=actor_id, action="create", resource="opera_account",
              resource_id=acc.id, details={"username": acc.username})
    db.commit()
    db.refresh(acc)
    return _out(db, acc)


def get_account(db: Session, account_id: int) -> OperaAccountOut:
    acc = db.get(OperaAccount, account_id)
    if acc is None:
        raise NotFoundError("opera_account_not_found")
    return _out(db, acc)


def update_account(db: Session, account_id: int, data: OperaAccountUpdate,
                   *, actor_id: int) -> OperaAccountOut:
    acc = db.get(OperaAccount, account_id)
    if acc is None:
        raise NotFoundError("opera_account_not_found")
    if data.department_id is not None or data.position_id is not None:
        _check_fk(db, data.department_id, data.position_id)
    changed: dict = {}
    for field in ("username", "email", "employee_name", "employee_id",
                  "department_id", "position_id", "operator_code",
                  "roles", "privileges", "account_status", "expiration_date"):
        val = getattr(data, field)
        if val is None:
            continue  # None = unchanged (PUT is partial, like core)
        if field == "email":
            val = str(val)
        if val != getattr(acc, field):
            setattr(acc, field, val)
            changed[field] = val
    audit.log(db, actor_id=actor_id, action="update", resource="opera_account",
              resource_id=acc.id, details=changed)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("username_or_operator_code_taken")
    db.refresh(acc)
    return _out(db, acc)


def delete_account(db: Session, account_id: int, *, actor_id: int) -> None:
    acc = db.get(OperaAccount, account_id)
    if acc is None:
        raise NotFoundError("opera_account_not_found")
    audit.log(db, actor_id=actor_id, action="delete", resource="opera_account",
              resource_id=acc.id, details={"username": acc.username})
    db.delete(acc)
    db.commit()


def query_all(db: Session, *, q=None, department_id=None, position_id=None,
              account_status=None, limit=10000) -> list:
    return _filtered(
        db, q=q, department_id=department_id, position_id=position_id,
        account_status=account_status,
    ).limit(limit).all()


def build_workbook(accounts: list) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "opera_accounts"
    ws.append(EXPORT_COLUMNS)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for a in accounts:
        ws.append([
            a.id, a.username, a.email, a.employee_name, a.employee_id,
            a.department_id, a.position_id, a.operator_code,
            ", ".join(a.roles or []), ", ".join(a.privileges or []),
            a.account_status,
            a.expiration_date.isoformat() if a.expiration_date else "",
            a.created_at.isoformat() if a.created_at else "",
            a.updated_at.isoformat() if a.updated_at else "",
            a.created_by,
        ])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def expire_old_accounts(db: Session) -> int:
    """Set status=expired where expiration_date passed. Returns count."""
    today = date.today()
    rows = db.query(OperaAccount).filter(
        OperaAccount.expiration_date.isnot(None),
        OperaAccount.expiration_date < today,
        OperaAccount.account_status != "expired",
    ).all()
    for r in rows:
        r.account_status = "expired"
        audit.log(db, actor_id=None, action="expire", resource="opera_account",
                  resource_id=r.id,
                  details={"expiration_date": r.expiration_date.isoformat()})
    db.commit()
    return len(rows)

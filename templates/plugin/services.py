"""{{LABEL}} business logic. Routes stay thin; everything happens here.

Conventions this file shows, all enforced by review rather than by the loader:
  * every write calls audit.log(...) with the acting user id
  * IntegrityError becomes ConflictError (409), not a 500
  * PUT is partial: a field left as None means "unchanged", like core
  * list/get/update/delete never leak SQLAlchemy objects to routes — they
    return Pydantic models
"""
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
    from plugins.{{name}}.models import {{Name}}Record
except ImportError:  # loaded by core plugin_loader under a generated module name
    from account_registry_plugin_{{name}}_models import {{Name}}Record  # type: ignore

RecordStatus = Literal["active", "disabled", "expired"]

EXPORT_COLUMNS = [
    "id", "code", "name", "email", "department_id", "tags",
    "status", "expiration_date", "created_at", "updated_at", "created_by",
]


class RecordCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    email: EmailStr
    department_id: int | None = None
    tags: list[str] = Field(default_factory=list)
    status: RecordStatus = "active"
    expiration_date: date | None = None


class RecordUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    email: EmailStr | None = None
    department_id: int | None = None
    tags: list[str] | None = None
    status: RecordStatus | None = None
    expiration_date: date | None = None


class RecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    email: str
    department_id: int | None = None
    department_name: str | None = None
    tags: list[str] = []
    status: str
    expiration_date: date | None = None
    created_at: object | None = None
    updated_at: object | None = None
    created_by: int | None = None


def _check_fk(db: Session, department_id: int | None) -> None:
    if department_id is not None and db.get(core_models.Department, department_id) is None:
        raise NotFoundError("department_not_found")


def _out(db: Session, rec: {{Name}}Record) -> RecordOut:
    """Enrich with core rows for display. N+1 is fine at this list size."""
    dept_name = None
    if rec.department_id:
        d = db.get(core_models.Department, rec.department_id)
        dept_name = d.name if d else None
    return RecordOut(
        id=rec.id, code=rec.code, name=rec.name, email=rec.email,
        department_id=rec.department_id, department_name=dept_name,
        tags=list(rec.tags or []), status=rec.status,
        expiration_date=rec.expiration_date,
        created_at=rec.created_at, updated_at=rec.updated_at,
        created_by=rec.created_by,
    )


def _filtered(db: Session, *, q=None, department_id=None, status=None):
    query = db.query({{Name}}Record).order_by({{Name}}Record.id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            {{Name}}Record.code.ilike(like),
            {{Name}}Record.name.ilike(like),
            {{Name}}Record.email.ilike(like),
        ))
    if department_id is not None:
        query = query.filter({{Name}}Record.department_id == department_id)
    if status is not None:
        query = query.filter({{Name}}Record.status == status)
    return query


def list_records(db: Session, *, q=None, department_id=None, status=None,
                 page=1, page_size=20) -> Page[RecordOut]:
    rows, total = paginate(
        _filtered(db, q=q, department_id=department_id, status=status), page, page_size,
    )
    return Page[RecordOut](
        items=[_out(db, r) for r in rows], total=total, page=page, page_size=page_size
    )


def create_record(db: Session, data: RecordCreate, *, actor_id: int) -> RecordOut:
    _check_fk(db, data.department_id)
    rec = {{Name}}Record(
        code=data.code, name=data.name, email=str(data.email),
        department_id=data.department_id, tags=list(data.tags),
        status=data.status, expiration_date=data.expiration_date,
        created_by=actor_id,
    )
    db.add(rec)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ConflictError("code_taken")
    audit.log(db, actor_id=actor_id, action="create", resource="{{name}}_record",
              resource_id=rec.id, details={"code": rec.code})
    db.commit()
    db.refresh(rec)
    return _out(db, rec)


def get_record(db: Session, record_id: int) -> RecordOut:
    rec = db.get({{Name}}Record, record_id)
    if rec is None:
        raise NotFoundError("{{name}}_record_not_found")
    return _out(db, rec)


def update_record(db: Session, record_id: int, data: RecordUpdate,
                  *, actor_id: int) -> RecordOut:
    rec = db.get({{Name}}Record, record_id)
    if rec is None:
        raise NotFoundError("{{name}}_record_not_found")
    if data.department_id is not None:
        _check_fk(db, data.department_id)
    changed: dict = {}
    for field in ("code", "name", "email", "department_id", "tags",
                  "status", "expiration_date"):
        val = getattr(data, field)
        if val is None:
            continue  # None = unchanged (PUT is partial, like core)
        if field == "email":
            val = str(val)
        if val != getattr(rec, field):
            setattr(rec, field, val)
            changed[field] = val
    audit.log(db, actor_id=actor_id, action="update", resource="{{name}}_record",
              resource_id=rec.id, details=changed)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("code_taken")
    db.refresh(rec)
    return _out(db, rec)


def delete_record(db: Session, record_id: int, *, actor_id: int) -> None:
    rec = db.get({{Name}}Record, record_id)
    if rec is None:
        raise NotFoundError("{{name}}_record_not_found")
    audit.log(db, actor_id=actor_id, action="delete", resource="{{name}}_record",
              resource_id=rec.id, details={"code": rec.code})
    db.delete(rec)
    db.commit()


def query_all(db: Session, *, q=None, department_id=None, status=None,
              limit=10000) -> list:
    """Unpaged rows for export — honours the same filters as the list view."""
    return _filtered(db, q=q, department_id=department_id, status=status).limit(limit).all()


def build_workbook(records: list) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "{{TABLE}}"
    ws.append(EXPORT_COLUMNS)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for r in records:
        ws.append([
            r.id, r.code, r.name, r.email, r.department_id,
            ", ".join(r.tags or []), r.status,
            r.expiration_date.isoformat() if r.expiration_date else "",
            r.created_at.isoformat() if r.created_at else "",
            r.updated_at.isoformat() if r.updated_at else "",
            r.created_by,
        ])
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def expire_old_records(db: Session) -> int:
    """Set status=expired where expiration_date has passed. Returns count."""
    today = date.today()
    rows = db.query({{Name}}Record).filter(
        {{Name}}Record.expiration_date.isnot(None),
        {{Name}}Record.expiration_date < today,
        {{Name}}Record.status != "expired",
    ).all()
    for r in rows:
        r.status = "expired"
        audit.log(db, actor_id=None, action="expire", resource="{{name}}_record",
                  resource_id=r.id,
                  details={"expiration_date": r.expiration_date.isoformat()})
    db.commit()
    return len(rows)
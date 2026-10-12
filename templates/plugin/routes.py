"""{{LABEL}} routes. Thin: maps service errors to JSON, no business logic.

The loader mounts this router at /api/v1/plugins/{{name}}, so @router.get("/records")
becomes GET /api/v1/plugins/{{name}}/records. Declare the literal path — the
mount prefix is added for you.

Order matters here: /records/export must be declared before /records/{record_id},
otherwise "export" is read as an id.
"""
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core import auth
from app.core.db import get_db
from app.core.schemas import Page

try:
    from plugins.{{name}} import services
    from plugins.{{name}}.services import RecordCreate, RecordOut, RecordUpdate
except ImportError:  # loaded by core plugin_loader under a generated module name
    import account_registry_plugin_{{name}}_services as services  # type: ignore
    from account_registry_plugin_{{name}}_services import (  # type: ignore
        RecordCreate, RecordOut, RecordUpdate,
    )

router = APIRouter()


def _err(e: Exception) -> HTTPException:
    """Domain errors → HTTP. Anything else is a bug and must not be hidden."""
    if isinstance(e, services.ConflictError):
        return HTTPException(status_code=409, detail=str(e))
    if isinstance(e, services.NotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    raise e


@router.get("/records", response_model=Page[RecordOut])
def list_records(
    q: str | None = None,
    department_id: int | None = None,
    status: str | None = None,
    page: int = 1, page_size: int = 20,
    db: Session = Depends(get_db),
    _user=Depends(auth.require_permission("{{PERM_PREFIX}}.record.view")),
):
    return services.list_records(
        db, q=q, department_id=department_id, status=status,
        page=page, page_size=page_size,
    )


@router.get("/records/export")
def export_records(
    q: str | None = None,
    department_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    _user=Depends(auth.require_permission("{{PERM_PREFIX}}.record.export")),
):
    rows = services.query_all(db, q=q, department_id=department_id, status=status)
    data = services.build_workbook(rows)
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename={{name}}_records.xlsx"},
    )


@router.post("/records", response_model=RecordOut, status_code=201)
def create_record(
    data: RecordCreate, db: Session = Depends(get_db),
    actor=Depends(auth.require_permission("{{PERM_PREFIX}}.record.create")),
):
    try:
        return services.create_record(db, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


@router.get("/records/{record_id}", response_model=RecordOut)
def get_record(
    record_id: int, db: Session = Depends(get_db),
    _user=Depends(auth.require_permission("{{PERM_PREFIX}}.record.view")),
):
    try:
        return services.get_record(db, record_id)
    except Exception as e:
        raise _err(e)


@router.put("/records/{record_id}", response_model=RecordOut)
def update_record(
    record_id: int, data: RecordUpdate, db: Session = Depends(get_db),
    actor=Depends(auth.require_permission("{{PERM_PREFIX}}.record.edit")),
):
    try:
        return services.update_record(db, record_id, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


@router.delete("/records/{record_id}", status_code=204)
def delete_record(
    record_id: int, db: Session = Depends(get_db),
    actor=Depends(auth.require_permission("{{PERM_PREFIX}}.record.delete")),
):
    try:
        services.delete_record(db, record_id, actor_id=actor.id)
    except Exception as e:
        raise _err(e)
    return Response(status_code=204)
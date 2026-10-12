"""opera_cloud routes. Thin: maps service errors to JSON, no business logic."""
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core import auth
from app.core.db import get_db
from app.core.schemas import Page

try:
    from plugins.opera_cloud import services
    from plugins.opera_cloud.services import (
        OperaAccountCreate, OperaAccountOut, OperaAccountUpdate,
    )
except ImportError:  # loaded by core plugin_loader under a generated module name
    import account_registry_plugin_opera_cloud_services as services  # type: ignore
    from account_registry_plugin_opera_cloud_services import (  # type: ignore
        OperaAccountCreate, OperaAccountOut, OperaAccountUpdate,
    )

router = APIRouter()


def _err(e: Exception) -> HTTPException:
    if isinstance(e, services.ConflictError):
        return HTTPException(status_code=409, detail=str(e))
    if isinstance(e, services.NotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    raise e


@router.get("/accounts", response_model=Page[OperaAccountOut])
def list_accounts(
    q: str | None = None,
    department_id: int | None = None,
    position_id: int | None = None,
    account_status: str | None = None,
    page: int = 1, page_size: int = 20,
    db: Session = Depends(get_db),
    _user=Depends(auth.require_permission("opera.account.view")),
):
    return services.list_accounts(
        db, q=q, department_id=department_id, position_id=position_id,
        account_status=account_status, page=page, page_size=page_size,
    )


@router.get("/accounts/export")
def export_accounts(
    q: str | None = None,
    department_id: int | None = None,
    position_id: int | None = None,
    account_status: str | None = None,
    db: Session = Depends(get_db),
    _user=Depends(auth.require_permission("opera.account.export")),
):
    rows = services.query_all(
        db, q=q, department_id=department_id, position_id=position_id,
        account_status=account_status,
    )
    data = services.build_workbook(rows)
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=opera_accounts.xlsx"},
    )


@router.post("/accounts", response_model=OperaAccountOut, status_code=201)
def create_account(
    data: OperaAccountCreate, db: Session = Depends(get_db),
    actor=Depends(auth.require_permission("opera.account.create")),
):
    try:
        return services.create_account(db, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


@router.get("/accounts/{account_id}", response_model=OperaAccountOut)
def get_account(
    account_id: int, db: Session = Depends(get_db),
    _user=Depends(auth.require_permission("opera.account.view")),
):
    try:
        return services.get_account(db, account_id)
    except Exception as e:
        raise _err(e)


@router.put("/accounts/{account_id}", response_model=OperaAccountOut)
def update_account(
    account_id: int, data: OperaAccountUpdate, db: Session = Depends(get_db),
    actor=Depends(auth.require_permission("opera.account.edit")),
):
    try:
        return services.update_account(db, account_id, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(
    account_id: int, db: Session = Depends(get_db),
    actor=Depends(auth.require_permission("opera.account.delete")),
):
    try:
        services.delete_account(db, account_id, actor_id=actor.id)
    except Exception as e:
        raise _err(e)
    return Response(status_code=204)

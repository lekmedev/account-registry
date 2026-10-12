"""Thin core routes. Business logic lives in services; this maps errors to JSON."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import audit, auth, models, schemas, services
from app.core.auth import ADMIN_ROLE
from app.core.db import get_db

router = APIRouter(prefix="/api/v1/core")


def _err(e: Exception) -> HTTPException:
    if isinstance(e, services.ConflictError):
        return HTTPException(status_code=409, detail=str(e))
    if isinstance(e, services.NotFoundError):
        return HTTPException(status_code=404, detail=str(e))
    raise e


def _me_out(user: models.User) -> schemas.UserOut:
    return services.user_out(user)


# ---- auth ----
@router.post("/auth/login", response_model=schemas.TokenPair)
def login(data: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if user is None or not auth.verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="user_disabled")
    access, refresh = auth.create_token_pair(user.id)
    audit.log(db, actor_id=user.id, action="login", resource="auth")
    db.commit()
    return schemas.TokenPair(access_token=access, refresh_token=refresh)


@router.post("/auth/refresh", response_model=schemas.TokenPair)
def refresh(data: schemas.RefreshIn, db: Session = Depends(get_db)):
    try:
        user_id = auth.decode_token(data.refresh_token, "refresh")
    except ValueError:
        raise HTTPException(status_code=401, detail="invalid_refresh_token")
    user = db.query(models.User).filter(
        models.User.id == user_id, models.User.is_active.is_(True)
    ).first()
    if user is None:
        raise HTTPException(status_code=401, detail="invalid_refresh_token")
    access, new_refresh = auth.create_token_pair(user.id)
    return schemas.TokenPair(access_token=access, refresh_token=new_refresh)


@router.get("/auth/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(auth.get_current_user)):
    return _me_out(user)


# ---- users ----
@router.get("/users", response_model=schemas.Page[schemas.UserOut])
def list_users(
    q: str | None = None, page: int = 1, page_size: int = 20,
    db: Session = Depends(get_db),
    _user: models.User = Depends(auth.require_permission("core.user.view")),
):
    return services.list_users(db, q=q, page=page, page_size=page_size)


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(
    data: schemas.UserCreate, db: Session = Depends(get_db),
    actor: models.User = Depends(auth.require_permission("core.user.manage")),
):
    try:
        return services.create_user(db, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int, data: schemas.UserUpdate, db: Session = Depends(get_db),
    actor: models.User = Depends(auth.require_permission("core.user.manage")),
):
    try:
        return services.update_user(db, user_id, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


# ---- roles & permissions ----
@router.get("/permissions", response_model=list[schemas.PermissionOut])
def list_permissions(
    db: Session = Depends(get_db),
    _user: models.User = Depends(auth.require_permission("core.role.view")),
):
    return db.query(models.Permission).order_by(models.Permission.code).all()


@router.get("/roles", response_model=list[schemas.RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    _user: models.User = Depends(auth.require_permission("core.role.view")),
):
    return services.list_roles(db)


@router.post("/roles", response_model=schemas.RoleOut, status_code=201)
def create_role(
    data: schemas.RoleCreate, db: Session = Depends(get_db),
    actor: models.User = Depends(auth.require_permission("core.role.manage")),
):
    try:
        return services.create_role(db, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


@router.put("/roles/{role_id}", response_model=schemas.RoleOut)
def update_role(
    role_id: int, data: schemas.RoleUpdate, db: Session = Depends(get_db),
    actor: models.User = Depends(auth.require_permission("core.role.manage")),
):
    try:
        return services.update_role(db, role_id, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


# ---- departments ----
@router.get("/departments", response_model=schemas.Page[schemas.DepartmentOut])
def list_departments(
    page: int = 1, page_size: int = 100, db: Session = Depends(get_db),
    _user: models.User = Depends(auth.require_permission("core.department.view")),
):
    return services.list_departments(db, page=page, page_size=page_size)


@router.post("/departments", response_model=schemas.DepartmentOut, status_code=201)
def create_department(
    data: schemas.DepartmentCreate, db: Session = Depends(get_db),
    actor: models.User = Depends(auth.require_permission("core.department.manage")),
):
    try:
        return services.create_department(db, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


@router.put("/departments/{dept_id}", response_model=schemas.DepartmentOut)
def update_department(
    dept_id: int, data: schemas.DepartmentUpdate, db: Session = Depends(get_db),
    actor: models.User = Depends(auth.require_permission("core.department.manage")),
):
    try:
        return services.update_department(db, dept_id, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


# ---- positions ----
@router.get("/positions", response_model=schemas.Page[schemas.PositionOut])
def list_positions(
    department_id: int | None = None, page: int = 1, page_size: int = 100,
    db: Session = Depends(get_db),
    _user: models.User = Depends(auth.require_permission("core.position.view")),
):
    return services.list_positions(db, department_id=department_id, page=page, page_size=page_size)


@router.post("/positions", response_model=schemas.PositionOut, status_code=201)
def create_position(
    data: schemas.PositionCreate, db: Session = Depends(get_db),
    actor: models.User = Depends(auth.require_permission("core.position.manage")),
):
    try:
        return services.create_position(db, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


@router.put("/positions/{pos_id}", response_model=schemas.PositionOut)
def update_position(
    pos_id: int, data: schemas.PositionUpdate, db: Session = Depends(get_db),
    actor: models.User = Depends(auth.require_permission("core.position.manage")),
):
    try:
        return services.update_position(db, pos_id, data, actor_id=actor.id)
    except Exception as e:
        raise _err(e)


# ---- audit log ----
@router.get("/audit", response_model=schemas.Page[schemas.AuditOut])
def list_audit(
    action: str | None = None, resource: str | None = None,
    actor_id: int | None = None, since: datetime | None = None,
    until: datetime | None = None, page: int = 1, page_size: int = 20,
    db: Session = Depends(get_db),
    _user: models.User = Depends(auth.require_permission("core.audit.view")),
):
    return audit.query_logs(
        db, action=action, resource=resource, actor_id=actor_id,
        since=since, until=until, page=page, page_size=page_size,
    )


# ---- plugins (loaded by core.plugin_loader; this code names no plugin) ----
@router.get("/plugins", response_model=list[schemas.PluginOut])
def list_plugins(
    _user: models.User = Depends(auth.require_permission("core.plugin.view")),
):
    from app.core import plugin_loader

    return plugin_loader.get_loaded_plugins()


@router.get("/menu", response_model=list[schemas.PluginMenuItem])
def my_menu(user: models.User = Depends(auth.get_current_user)):
    """Menu items from all loaded plugins, filtered by the caller's perms."""
    from app.core import plugin_loader

    perms = auth.effective_permissions(user)
    items: list[schemas.PluginMenuItem] = []
    for plugin in plugin_loader.get_loaded_plugins():
        for entry in plugin.get("menu", []):
            need = entry.get("permission")
            if need and "*" not in perms and need not in perms:
                continue
            items.append(schemas.PluginMenuItem(**entry))
    return items

"""Core business logic. Routes stay thin; everything happens here."""
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core import audit, auth, models, schemas
from app.core.auth import ADMIN_ROLE
from app.core.db import paginate

USER_PERMS = ("core.user.view", "core.user.manage")
ROLE_PERMS = ("core.role.view", "core.role.manage")
DEPT_PERMS = ("core.department.view", "core.department.manage")
POS_PERMS = ("core.position.view", "core.position.manage")


class ConflictError(Exception):
    pass


class NotFoundError(Exception):
    pass


# ---- bootstrap permission codes granted to no role by default (seeded idempotent) ----
CORE_PERMISSIONS = [
    ("core.user.view", "View users"),
    ("core.user.manage", "Create/edit/deactivate users"),
    ("core.role.view", "View roles and permissions"),
    ("core.role.manage", "Create/edit roles"),
    ("core.department.view", "View departments"),
    ("core.department.manage", "Manage departments"),
    ("core.position.view", "View positions"),
    ("core.position.manage", "Manage positions"),
    ("core.audit.view", "View audit log"),
    ("core.plugin.view", "View loaded plugins and menu"),
]


def seed_permissions(db: Session) -> None:
    existing = {p.code for p in db.query(models.Permission).all()}
    for code, desc in CORE_PERMISSIONS:
        if code not in existing:
            db.add(models.Permission(code=code, description=desc))
    db.commit()


def _roles_by_ids(db: Session, ids: list[int]) -> list[models.Role]:
    if not ids:
        return []
    roles = db.query(models.Role).filter(models.Role.id.in_(ids)).all()
    if len(roles) != len(set(ids)):
        raise NotFoundError("role_not_found")
    return roles


def user_out(user: models.User) -> schemas.UserOut:
    perms = sorted(auth.effective_permissions(user))
    return schemas.UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        roles=[schemas.RoleBrief(id=r.id, name=r.name) for r in user.roles],
        permissions=perms,
    )


# ---- users ----
def list_users(db, *, q=None, page=1, page_size=20, actor=None):
    query = (
        db.query(models.User)
        .options(selectinload(models.User.roles).selectinload(models.Role.permissions))
        .order_by(models.User.id)
    )
    if q:
        like = f"%{q}%"
        query = query.filter(
            (models.User.username.ilike(like)) | (models.User.email.ilike(like))
        )
    rows, total = paginate(query, page, page_size)
    return schemas.Page[schemas.UserOut](
        items=[user_out(u) for u in rows], total=total, page=page, page_size=page_size
    )


def create_user(db, data: schemas.UserCreate, *, actor_id: int) -> schemas.UserOut:
    user = models.User(
        username=data.username,
        email=data.email,
        password_hash=auth.hash_password(data.password),
        is_active=data.is_active,
        roles=_roles_by_ids(db, data.role_ids),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ConflictError("username_or_email_taken")
    audit.log(
        db, actor_id=actor_id, action="create", resource="user",
        resource_id=user.id, details={"username": user.username},
    )
    db.commit()
    db.refresh(user)
    return user_out(user)


def update_user(db, user_id: int, data: schemas.UserUpdate, *, actor_id: int):
    user = db.get(models.User, user_id)
    if user is None:
        raise NotFoundError("user_not_found")
    changed: dict = {}
    if data.email is not None and data.email != user.email:
        user.email, changed["email"] = data.email, data.email
    if data.password is not None:
        user.password_hash = auth.hash_password(data.password)
        changed["password"] = "***"
    if data.is_active is not None and data.is_active != user.is_active:
        user.is_active, changed["is_active"] = data.is_active, data.is_active
    if data.role_ids is not None:
        user.roles = _roles_by_ids(db, data.role_ids)
        changed["role_ids"] = data.role_ids
    audit.log(
        db, actor_id=actor_id, action="update", resource="user",
        resource_id=user.id, details=changed,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("username_or_email_taken")
    db.refresh(user)
    return user_out(user)


# ---- roles ----
def list_roles(db) -> list[schemas.RoleOut]:
    roles = (
        db.query(models.Role)
        .options(selectinload(models.Role.permissions))
        .order_by(models.Role.id)
        .all()
    )
    return [
        schemas.RoleOut(
            id=r.id, name=r.name, description=r.description,
            permissions=[schemas.PermissionOut.model_validate(p) for p in r.permissions],
        )
        for r in roles
    ]


def _permissions_by_codes(db, codes: list[str]) -> list[models.Permission]:
    if not codes:
        return []
    perms = db.query(models.Permission).filter(models.Permission.code.in_(codes)).all()
    if len(perms) != len(set(codes)):
        raise NotFoundError("permission_not_found")
    return perms


def create_role(db, data: schemas.RoleCreate, *, actor_id: int) -> schemas.RoleOut:
    role = models.Role(
        name=data.name, description=data.description,
        permissions=_permissions_by_codes(db, data.permission_codes),
    )
    db.add(role)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ConflictError("role_name_taken")
    audit.log(
        db, actor_id=actor_id, action="create", resource="role",
        resource_id=role.id, details={"name": role.name},
    )
    db.commit()
    db.refresh(role)
    return schemas.RoleOut(
        id=role.id, name=role.name, description=role.description,
        permissions=[schemas.PermissionOut.model_validate(p) for p in role.permissions],
    )


def update_role(db, role_id: int, data: schemas.RoleUpdate, *, actor_id: int):
    role = db.get(models.Role, role_id)
    if role is None:
        raise NotFoundError("role_not_found")
    changed: dict = {}
    if data.description is not None:
        role.description, changed["description"] = data.description, data.description
    if data.permission_codes is not None:
        role.permissions = _permissions_by_codes(db, data.permission_codes)
        changed["permission_codes"] = data.permission_codes
    audit.log(
        db, actor_id=actor_id, action="update", resource="role",
        resource_id=role.id, details=changed,
    )
    db.commit()
    return [r for r in list_roles(db) if r.id == role.id][0]


# ---- departments ----
def list_departments(db, *, page=1, page_size=100):
    query = db.query(models.Department).order_by(models.Department.id)
    rows, total = paginate(query, page, page_size)
    return schemas.Page[schemas.DepartmentOut](
        items=[schemas.DepartmentOut.model_validate(d) for d in rows],
        total=total, page=page, page_size=page_size,
    )


def create_department(db, data: schemas.DepartmentCreate, *, actor_id: int):
    dept = models.Department(name=data.name, description=data.description)
    db.add(dept)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ConflictError("department_name_taken")
    audit.log(
        db, actor_id=actor_id, action="create", resource="department",
        resource_id=dept.id, details={"name": dept.name},
    )
    db.commit()
    return schemas.DepartmentOut.model_validate(dept)


def update_department(db, dept_id: int, data: schemas.DepartmentUpdate, *, actor_id: int):
    dept = db.get(models.Department, dept_id)
    if dept is None:
        raise NotFoundError("department_not_found")
    changed: dict = {}
    if data.name is not None and data.name != dept.name:
        dept.name, changed["name"] = data.name, data.name
    if data.description is not None:
        dept.description, changed["description"] = data.description, data.description
    audit.log(
        db, actor_id=actor_id, action="update", resource="department",
        resource_id=dept.id, details=changed,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("department_name_taken")
    return schemas.DepartmentOut.model_validate(dept)


# ---- positions ----
def position_out(db, p: models.Position) -> schemas.PositionOut:
    dept_name = None
    if p.department_id:
        dept = db.get(models.Department, p.department_id)
        dept_name = dept.name if dept else None
    return schemas.PositionOut(
        id=p.id, name=p.name, description=p.description,
        department_id=p.department_id, department_name=dept_name,
    )


def list_positions(db, *, department_id=None, page=1, page_size=100):
    query = db.query(models.Position).order_by(models.Position.id)
    if department_id:
        query = query.filter(models.Position.department_id == department_id)
    rows, total = paginate(query, page, page_size)
    return schemas.Page[schemas.PositionOut](
        items=[position_out(db, p) for p in rows],
        total=total, page=page, page_size=page_size,
    )


def create_position(db, data: schemas.PositionCreate, *, actor_id: int):
    if data.department_id:
        if db.get(models.Department, data.department_id) is None:
            raise NotFoundError("department_not_found")
    pos = models.Position(
        name=data.name, description=data.description, department_id=data.department_id
    )
    db.add(pos)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ConflictError("position_name_taken")
    audit.log(
        db, actor_id=actor_id, action="create", resource="position",
        resource_id=pos.id, details={"name": pos.name},
    )
    db.commit()
    return position_out(db, pos)


def update_position(db, pos_id: int, data: schemas.PositionUpdate, *, actor_id: int):
    pos = db.get(models.Position, pos_id)
    if pos is None:
        raise NotFoundError("position_not_found")
    changed: dict = {}
    if data.department_id is not None:
        if data.department_id and db.query(models.Department).get(data.department_id) is None:
            raise NotFoundError("department_not_found")
        pos.department_id, changed["department_id"] = data.department_id, data.department_id
    if data.name is not None and data.name != pos.name:
        pos.name, changed["name"] = data.name, data.name
    if data.description is not None:
        pos.description, changed["description"] = data.description, data.description
    audit.log(
        db, actor_id=actor_id, action="update", resource="position",
        resource_id=pos.id, details=changed,
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("position_name_taken")
    return position_out(db, pos)

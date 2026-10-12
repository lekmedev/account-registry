"""Auth: bcrypt passwords, JWT access/refresh, current-user + permission deps."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session, selectinload

from app.core import models
from app.core.config import settings
from app.core.db import get_db

ADMIN_ROLE = "admin"

_bearer = HTTPBearer(auto_error=False)


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode(), hashed.encode())
    except (ValueError, AttributeError):
        return False


def _encode(user_id: int, kind: str, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "type": kind, "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def create_token_pair(user_id: int) -> tuple[str, str]:
    access = _encode(user_id, "access", timedelta(minutes=settings.jwt_access_minutes))
    refresh = _encode(user_id, "refresh", timedelta(days=settings.jwt_refresh_days))
    return access, refresh


def decode_token(token: str, expected_type: str) -> int:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ValueError("invalid_token")
    if payload.get("type") != expected_type:
        raise ValueError("wrong_token_type")
    return int(payload["sub"])


def _unauth() -> None:
    raise HTTPException(status_code=401, detail="unauthorized")


def _forbidden() -> None:
    raise HTTPException(status_code=403, detail="forbidden")


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    if creds is None or not creds.credentials:
        _unauth()
    try:
        user_id = decode_token(creds.credentials, "access")
    except ValueError:
        _unauth()
    user = (
        db.query(models.User)
        .options(
            selectinload(models.User.roles).selectinload(models.Role.permissions)
        )
        .filter(models.User.id == user_id, models.User.is_active.is_(True))
        .first()
    )
    if user is None:
        _unauth()
    return user


def effective_permissions(user: models.User) -> set[str]:
    if any(r.name == ADMIN_ROLE for r in user.roles):
        return {"*"}
    return {p.code for r in user.roles for p in r.permissions}


def require_permission(code: str):
    """FastAPI dependency: 401 if unauthenticated, 403 if missing permission."""

    def check(user: models.User = Depends(get_current_user)) -> models.User:
        perms = effective_permissions(user)
        if "*" not in perms and code not in perms:
            _forbidden()
        return user

    return check

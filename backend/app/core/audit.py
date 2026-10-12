"""Audit helper (shared with plugins) + audit-log query service."""
from datetime import datetime

from sqlalchemy.orm import Session, aliased

from app.core import models, schemas
from app.core.db import paginate

Actor = aliased(models.User)


def log(
    db: Session,
    *,
    actor_id: int | None,
    action: str,
    resource: str,
    resource_id: str | int | None = None,
    details: dict | None = None,
) -> models.AuditLog:
    """Append an audit entry. Flushes only — the caller commits."""
    entry = models.AuditLog(
        actor_id=actor_id,
        action=action,
        resource=resource,
        resource_id=None if resource_id is None else str(resource_id),
        details=details,
    )
    db.add(entry)
    db.flush()
    return entry


def query_logs(
    db: Session,
    *,
    action: str | None = None,
    resource: str | None = None,
    actor_id: int | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    page: int = 1,
    page_size: int = 20,
) -> schemas.Page[schemas.AuditOut]:
    q = (
        db.query(models.AuditLog, Actor.username)
        .outerjoin(Actor, Actor.id == models.AuditLog.actor_id)
        .order_by(models.AuditLog.id.desc())
    )
    if action:
        q = q.filter(models.AuditLog.action == action)
    if resource:
        q = q.filter(models.AuditLog.resource == resource)
    if actor_id:
        q = q.filter(models.AuditLog.actor_id == actor_id)
    if since:
        q = q.filter(models.AuditLog.created_at >= since)
    if until:
        q = q.filter(models.AuditLog.created_at <= until)
    rows, total = paginate(q, page, page_size)
    items = [
        schemas.AuditOut(
            id=e.id,
            actor_id=e.actor_id,
            actor_username=username,
            action=e.action,
            resource=e.resource,
            resource_id=e.resource_id,
            details=e.details,
            created_at=e.created_at,
        )
        for e, username in rows
    ]
    return schemas.Page[schemas.AuditOut](
        items=items, total=total, page=page, page_size=page_size
    )

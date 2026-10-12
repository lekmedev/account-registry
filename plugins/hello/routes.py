"""hello test plugin routes. Routes stay thin; logic is trivial here."""
from fastapi import APIRouter, Depends

from app.core import auth
from app.core.db import get_db  # noqa: F401 — shows plugins use core get_db pattern

router = APIRouter()


@router.get("/ping")
def ping():
    return {"plugin": "hello", "message": "pong"}


@router.get("/whoami")
def whoami(user=Depends(auth.require_permission("hello.view"))):
    return {"plugin": "hello", "username": user.username}

"""Pydantic v2 schemas for core resources. All input validated here."""
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class PermissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    description: str


class RoleBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    permissions: list[PermissionOut] = []


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9_.\-]+$")
    description: str = ""
    permission_codes: list[str] = []


class RoleUpdate(BaseModel):
    description: str | None = None
    permission_codes: list[str] | None = None


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    roles: list[RoleBrief] = []
    permissions: list[str] = []


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.\-]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role_ids: list[int] = []
    is_active: bool = True


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role_ids: list[int] | None = None
    is_active: bool | None = None


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = ""


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None


class PositionOut(BaseModel):
    id: int
    name: str
    description: str
    department_id: int | None
    department_name: str | None = None


class PositionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = ""
    department_id: int | None = None


class PositionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    department_id: int | None = None


class LoginIn(BaseModel):
    username: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AuditOut(BaseModel):
    id: int
    actor_id: int | None
    actor_username: str | None = None
    action: str
    resource: str
    resource_id: str | None = None
    details: dict | None = None
    created_at: datetime


class PluginMenuItem(BaseModel):
    label: str
    path: str
    permission: str | None = None


class PluginOut(BaseModel):
    name: str
    version: str
    description: str = ""
    menu: list[PluginMenuItem] = []
    permissions: list[str] = []

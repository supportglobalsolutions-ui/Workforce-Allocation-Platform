from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, ConfigDict
from models.enums import AdminRoleEnum, AccountStatusEnum


class AdminUserBase(BaseModel):
    firebase_uid:  str
    email:         EmailStr
    role:          AdminRoleEnum
    display_name:  str
    country_scope: Optional[str] = None
    status:        AccountStatusEnum = AccountStatusEnum.active


class AdminUserCreate(AdminUserBase):
    pass


class AdminUserUpdate(BaseModel):
    display_name:  Optional[str]              = None
    country_scope: Optional[str]              = None
    status:        Optional[AccountStatusEnum] = None
    role:          Optional[AdminRoleEnum]     = None


class AdminUserResponse(AdminUserBase):
    model_config = ConfigDict(from_attributes=True)

    id:         UUID
    created_at: datetime
    updated_at: datetime

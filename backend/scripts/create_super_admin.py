"""Create or repair a Global Solutions super-admin account.

Credentials are supplied through environment variables so they are never kept
in source control:

  CREATE_ADMIN_EMAIL
  CREATE_ADMIN_PASSWORD
  CREATE_ADMIN_NAME (optional)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from sqlmodel import Session, select  # noqa: E402

from core.database import engine  # noqa: E402
from core.config import settings  # noqa: E402
from core.supabase_auth import (  # noqa: E402
    _admin_request,
    get_auth_user_by_email,
    is_auth_ready,
    set_user_claims,
)
from models.admin_users import AdminUser  # noqa: E402
from models.enums import AccountStatusEnum, AdminRoleEnum  # noqa: E402


def main() -> None:
    email = os.environ["CREATE_ADMIN_EMAIL"].strip().lower()
    password = os.environ["CREATE_ADMIN_PASSWORD"]
    name = os.getenv("CREATE_ADMIN_NAME", "Global Solutions Support").strip() or "Global Solutions Support"
    if not is_auth_ready():
        raise RuntimeError("Supabase authentication is not configured.")

    try:
        auth_user = get_auth_user_by_email(email)
        uid = auth_user["id"]
        _admin_request("PUT", f"/users/{uid}", json={"password": password, "email_confirm": True})
        auth_action = "updated"
    except ValueError:
        auth_user = _admin_request("POST", "/users", json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": name},
            "app_metadata": {"role": "super_admin", "status": "approved"},
        }) or {}
        uid = auth_user["id"]
        auth_action = "created"

    set_user_claims(uid, role="super_admin", status="approved")
    protected = email in settings.protected_super_admin_emails

    with Session(engine) as db:
        row = db.exec(select(AdminUser).where(AdminUser.email == email)).first()
        if row is None:
            row = AdminUser(
                auth_user_id=uid,
                email=email,
                display_name=name,
                role=AdminRoleEnum.ceo_leadership,
                status=AccountStatusEnum.active,
                is_protected=protected,
            )
            db.add(row)
            db.commit()
            database_action = "created"
        else:
            row.auth_user_id = uid
            row.display_name = name
            row.role = AdminRoleEnum.ceo_leadership
            row.status = AccountStatusEnum.active
            if protected:
                row.is_protected = True
            db.add(row)
            db.commit()
            database_action = "updated"

    print(f"Super admin {auth_action} in Auth and {database_action} in database: {email}")


if __name__ == "__main__":
    main()

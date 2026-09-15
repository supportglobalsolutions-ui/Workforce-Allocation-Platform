"""Remove a founder (protected) Super Admin. The app cannot do this.

Protected Super Admins cannot be deleted, banned, or demoted from Accounts.
The only way to take one off the system is this script, run on a machine that
already has backend/.env and the database URL.

From the backend folder:

  python scripts/remove_protected_super_admin.py ^
    --email the-founder@example.com ^
    --i-understand DELETE_PROTECTED_SUPER_ADMIN
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from sqlmodel import Session, select  # noqa: E402

from core.config import settings  # noqa: E402
from core.database import engine  # noqa: E402
from core.supabase_auth import get_auth_user_by_email, is_auth_ready  # noqa: E402
from models.admin_users import AdminUser  # noqa: E402
from services.account_delete import delete_login_account  # noqa: E402
from services.account_guard import is_protected_email  # noqa: E402

CONFIRM_PHRASE = "DELETE_PROTECTED_SUPER_ADMIN"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Permanently remove a protected Super Admin. Not available in the app.",
    )
    parser.add_argument("--email", required=True, help="Exact login email of the founder account")
    parser.add_argument(
        "--i-understand",
        dest="confirm",
        required=True,
        help=f"Must be exactly {CONFIRM_PHRASE}",
    )
    args = parser.parse_args()
    email = args.email.strip().lower()

    if args.confirm != CONFIRM_PHRASE:
        raise SystemExit(f"Refusing to run. Pass --i-understand {CONFIRM_PHRASE}")

    if not is_auth_ready():
        raise SystemExit("Supabase authentication is not configured.")

    protected = ", ".join(sorted(settings.protected_super_admin_emails)) or "(none configured)"
    print(f"Protected Super Admin emails: {protected}")

    with Session(engine) as db:
        row = db.exec(select(AdminUser).where(AdminUser.email == email)).first()
        try:
            auth_user = get_auth_user_by_email(email)
        except Exception:
            auth_user = {}
        uid = (auth_user or {}).get("id") or (row.auth_user_id if row else "")
        if not uid:
            raise SystemExit(f"No Auth or database account for {email}")

        if not (is_protected_email(email) or (row and row.is_protected)):
            raise SystemExit(
                f"{email} is not a protected Super Admin. Delete it from Accounts instead."
            )

        print(f"Removing protected Super Admin {email} ({uid})")
        result = delete_login_account(
            db,
            uid,
            actor_uid="script:remove_protected_super_admin",
            actor_role="super_admin",
            bypass_protection=True,
        )
        print(result)
        print("Done. That person can no longer sign in. Session history was kept.")


if __name__ == "__main__":
    main()

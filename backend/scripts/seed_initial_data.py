"""Seed the founding super_admin account and the first RDP machine.

Creates, idempotently:
  * a Supabase Auth user with role=super_admin in app_metadata
  * the matching admin_users row (what the API authorises against)
  * an rdp_resources row for the Guacamole-backed VPS

Credentials are read from the environment so nothing sensitive is committed:

    SEED_SUPER_ADMIN_EMAIL      default peterkelvinkibiru1532@gmail.com
    SEED_SUPER_ADMIN_PASSWORD   required on first run
    SEED_RDP_NICKNAME           default RDP1
    SEED_RDP_HOST               required to seed the machine
    SEED_RDP_USER               default administrator
    SEED_RDP_PASSWORD           required to seed the machine
    SEED_RDP_COUNTRY            default Uganda
    SEED_RDP_CLIENT_GROUP       default Default

Usage:
    python scripts/seed_initial_data.py
    python scripts/seed_initial_data.py --check
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from sqlmodel import Session, select  # noqa: E402

from core.database import engine  # noqa: E402
from core.supabase_auth import (  # noqa: E402
    _admin_request,
    get_auth_user_by_email,
    is_auth_ready,
    set_user_claims,
)
from models.admin_users import AdminUser  # noqa: E402
from models.enums import AccountStatusEnum, RdpStatusEnum  # noqa: E402
from models.rdp_machine import RDPResource  # noqa: E402
# admin_users.role is the ORG role (job function), which is a different axis
# from the auth role in app_metadata. Reuse the app's own mapping so a seeded
# account is indistinguishable from one provisioned just-in-time at login.
from routers.deps import _AUTH_TO_ORG_ROLE  # noqa: E402

SUPER_ADMIN_ORG_ROLE = _AUTH_TO_ORG_ROLE["super_admin"]

DEFAULT_EMAIL = "peterkelvinkibiru1532@gmail.com"


def seed_super_admin(check: bool) -> None:
    email = os.getenv("SEED_SUPER_ADMIN_EMAIL", DEFAULT_EMAIL).strip()
    password = os.getenv("SEED_SUPER_ADMIN_PASSWORD", "").strip()

    print(f"--- super admin: {email} ---")
    if not is_auth_ready():
        print("  Supabase auth not configured - skipped")
        return

    # 1. Supabase Auth user
    try:
        user = get_auth_user_by_email(email)
        uid = user["id"]
        print(f"  auth user exists          uid={uid}")
        if password and not check:
            _admin_request("PUT", f"/users/{uid}", json={"password": password})
            print("  password reset to SEED_SUPER_ADMIN_PASSWORD")
    except ValueError:
        if check:
            print("  auth user MISSING (would be created)")
            return
        if not password:
            print("  auth user missing and SEED_SUPER_ADMIN_PASSWORD not set - skipped")
            return
        user = _admin_request("POST", "/users", json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": "Peter Kelvin Kibiru"},
            "app_metadata": {"role": "super_admin", "status": "approved"},
        }) or {}
        uid = user.get("id", "")
        print(f"  auth user CREATED         uid={uid}")

    if not check:
        set_user_claims(uid, role="super_admin", status="approved")
        print("  app_metadata role=super_admin status=approved")

    # 2. admin_users row - this is what the API authorises against
    with Session(engine) as db:
        row = db.exec(select(AdminUser).where(AdminUser.email == email)).first()
        if row:
            changed = []
            if row.firebase_uid != uid:
                row.firebase_uid = uid
                changed.append("auth uid")
            if row.role != SUPER_ADMIN_ORG_ROLE:
                row.role = SUPER_ADMIN_ORG_ROLE
                changed.append("role")
            if row.status != AccountStatusEnum.active:
                row.status = AccountStatusEnum.active
                changed.append("status")
            if changed and not check:
                db.add(row)
                db.commit()
                print(f"  admin_users row updated   ({', '.join(changed)})")
            elif changed:
                print(f"  admin_users row WOULD update ({', '.join(changed)})")
            else:
                print("  admin_users row already correct")
        elif check:
            print("  admin_users row MISSING (would be created)")
        else:
            db.add(AdminUser(
                firebase_uid=uid,
                email=email,
                role=SUPER_ADMIN_ORG_ROLE,
                display_name="Peter Kelvin Kibiru",
                status=AccountStatusEnum.active,
            ))
            db.commit()
            print("  admin_users row CREATED   role=super_admin")


def seed_rdp(check: bool) -> None:
    nickname = os.getenv("SEED_RDP_NICKNAME", "RDP1").strip()
    host = os.getenv("SEED_RDP_HOST", "").strip()
    country = os.getenv("SEED_RDP_COUNTRY", "Uganda").strip()
    group = os.getenv("SEED_RDP_CLIENT_GROUP", "Default").strip()

    print(f"\n--- rdp resource: {nickname} ---")
    if not host:
        print("  SEED_RDP_HOST not set - skipped")
        return

    with Session(engine) as db:
        row = db.exec(select(RDPResource).where(RDPResource.nickname == nickname)).first()
        if row:
            if row.monitor_host != host and not check:
                row.monitor_host = host
                db.add(row)
                db.commit()
                print(f"  updated monitor_host -> {host}")
            else:
                print(f"  already exists            host={row.monitor_host} status={row.status.value}")
            return
        if check:
            print(f"  MISSING (would be created, host={host})")
            return
        db.add(RDPResource(
            nickname=nickname,
            country=country,
            client_group=group,
            status=RdpStatusEnum.online_free,
            monitor_host=host,
            monitor_port=3389,
            health_notes="Seeded by scripts/seed_initial_data.py",
        ))
        db.commit()
        print(f"  CREATED                   host={host}:3389 status=online_free")
        print("  NOTE: guacamole_connection_id is still empty - set it after")
        print("        creating the connection in Guacamole (see docs).")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, change nothing")
    args = ap.parse_args()

    seed_super_admin(args.check)
    seed_rdp(args.check)

    print("\nDone." if not args.check else "\nCheck only - nothing changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

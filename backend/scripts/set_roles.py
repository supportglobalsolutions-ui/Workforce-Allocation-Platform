"""
One-time script: set Firebase custom claims (role) for specific accounts.
Run from the backend/ directory:
    python scripts/set_roles.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import firebase_admin
from firebase_admin import auth, credentials

CRED_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "admin.json")

ROLE_ASSIGNMENTS = {
    "support.globalsolutions@gmail.com": "super_admin",
    "peterkelvinkibiru1532@gmail.com":   "super_admin",
}

def main():
    if not os.path.exists(CRED_PATH):
        print(f"ERROR: Service account not found at {CRED_PATH}")
        sys.exit(1)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(CRED_PATH))

    for email, role in ROLE_ASSIGNMENTS.items():
        try:
            user = auth.get_user_by_email(email)
            auth.set_custom_user_claims(user.uid, {"role": role})
            print(f"OK  {email}  ->  {role}  (uid: {user.uid})")
        except auth.UserNotFoundError:
            print(f"SKIP  {email}  — not found in Firebase (create the account first)")
        except Exception as e:
            print(f"ERR  {email}  — {e}")

if __name__ == "__main__":
    main()

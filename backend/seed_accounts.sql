-- ============================================================================
-- Manual account seeding: bridge existing Firebase accounts -> Postgres rows
-- ============================================================================
--
-- WHY THIS EXISTS
--   Login + role come from Firebase (the token "role" claim: super_admin / admin / user).
--   But the backend data layer (get_admin_user / get_worker_for_user) looks up rows in
--   `admin_users` (and `workers`) by `firebase_uid`. Those rows don't exist yet, which is
--   why you get "Admin user not found for this Firebase account".
--
-- WHAT TO DO
--   1. In the Firebase Console -> Authentication -> Users, copy each account's
--      "User UID" (the long string in the Identifier/UID column).
--   2. Replace every <PLACEHOLDER> below with the real value.
--   3. Run this file against the app DB (see commands at the bottom).
--
-- NOTES
--   * `admin_users.role` is an ORG role, not the auth role. It does NOT control which
--     dashboard you see (that's the Firebase claim). Any valid value below is fine.
--   * Re-running is safe: ON CONFLICT (firebase_uid) just updates the existing row.
-- ============================================================================


-- ── 1. SUPER ADMIN  (Firebase claim role = "super_admin" -> executive dashboard) ──
INSERT INTO admin_users (firebase_uid, email, role, display_name, status)
VALUES (
    '<SUPER_ADMIN_FIREBASE_UID>',
    'support.globalsolutions@gmail.com',
    'ceo_leadership',
    'Super Admin',
    'active'
)
ON CONFLICT (firebase_uid) DO UPDATE
    SET email = EXCLUDED.email,
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status;


-- ── 2. ADMIN  (Firebase claim role = "admin" -> admin dashboard) ──────────────────
INSERT INTO admin_users (firebase_uid, email, role, display_name, status)
VALUES (
    '<ADMIN_FIREBASE_UID>',
    '<admin_email@example.com>',
    'operations_lead',
    'Admin User',
    'active'
)
ON CONFLICT (firebase_uid) DO UPDATE
    SET email = EXCLUDED.email,
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status;


-- ── 3. WORKER  (Firebase claim role = "user" -> worker dashboard) ─────────────────
-- A worker needs TWO rows: an admin_users row (the login identity) AND a workers row
-- (the profile that worker-scoped endpoints like /sessions and /quality/me read).

-- 3a. login identity
INSERT INTO admin_users (firebase_uid, email, role, display_name, status)
VALUES (
    '<WORKER_FIREBASE_UID>',
    '<worker_email@example.com>',
    'technical_admin',
    'Worker User',
    'active'
)
ON CONFLICT (firebase_uid) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status;

-- 3b. worker profile, linked to the admin_users row above by firebase_uid.
--     Edit country / pay_tier / worker_type / start_date to real values.
INSERT INTO workers (admin_user_id, worker_type, display_name, country, pay_tier, status, start_date)
SELECT au.id, 'gs_registered', 'Worker User', 'Kenya', 'tier_1', 'active', CURRENT_DATE
FROM admin_users au
WHERE au.firebase_uid = '<WORKER_FIREBASE_UID>'
ON CONFLICT (admin_user_id) DO NOTHING;


-- ── Verify ────────────────────────────────────────────────────────────────────────
-- SELECT firebase_uid, email, role, display_name FROM admin_users;
-- SELECT w.display_name, w.country, w.pay_tier, w.status FROM workers w;

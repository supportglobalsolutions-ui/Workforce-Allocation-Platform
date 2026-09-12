-- ============================================================================
-- Manual account seeding: bridge existing auth accounts -> Postgres rows
-- ============================================================================
--
-- WHY THIS EXISTS
--   Login + role come from Supabase (the token "role" claim: super_admin / admin / user).
--   The backend data layer (get_admin_user / get_worker_for_user) looks up rows in
--   `admin_users` (and `workers`) by `auth_user_id`.
--
-- WHAT TO DO
--   1. In Supabase Dashboard -> Authentication -> Users, copy each account's User UID.
--   2. Replace every <PLACEHOLDER> below with the real value.
--   3. Run this file against the app DB (see commands at the bottom).
--
-- NOTES
--   * `admin_users.role` is an ORG role, not the auth role.
--   * Re-running is safe: ON CONFLICT (auth_user_id) just updates the existing row.
-- ============================================================================


-- ── 1. SUPER ADMIN  (Auth claim role = "super_admin" -> executive dashboard) ───────
INSERT INTO admin_users (auth_user_id, email, role, display_name, status)
VALUES (
    '<SUPER_ADMIN_AUTH_UID>',
    'support.globalsolutions@gmail.com',
    'ceo_leadership',
    'Super Admin',
    'active'
)
ON CONFLICT (auth_user_id) DO UPDATE
    SET email = EXCLUDED.email,
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status;


-- ── 2. ADMIN  (Auth claim role = "admin" -> admin dashboard) ──────────────────────
INSERT INTO admin_users (auth_user_id, email, role, display_name, status)
VALUES (
    '<ADMIN_AUTH_UID>',
    '<admin_email@example.com>',
    'operations_lead',
    'Admin User',
    'active'
)
ON CONFLICT (auth_user_id) DO UPDATE
    SET email = EXCLUDED.email,
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status;


-- ── 3. WORKER  (Auth claim role = "user" -> worker dashboard) ─────────────────────
-- A worker needs TWO rows: an admin_users row (the login identity) AND a workers row
-- (the profile that worker-scoped endpoints like /sessions and /quality/me read).

-- 3a. login identity
INSERT INTO admin_users (auth_user_id, email, role, display_name, status)
VALUES (
    '<WORKER_AUTH_UID>',
    '<worker_email@example.com>',
    'technical_admin',
    'Worker User',
    'active'
)
ON CONFLICT (auth_user_id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status;

-- 3b. worker profile, linked to the admin_users row above by auth_user_id.
--     Edit country / pay_tier / worker_type / start_date to real values.
INSERT INTO workers (admin_user_id, worker_type, display_name, country, pay_tier, status, start_date)
SELECT au.id, 'gs_registered', 'Worker User', 'Kenya', 'tier_1', 'active', CURRENT_DATE
FROM admin_users au
WHERE au.auth_user_id = '<WORKER_AUTH_UID>'
ON CONFLICT (admin_user_id) DO NOTHING;


-- ── Verify ────────────────────────────────────────────────────────────────────────
-- SELECT auth_user_id, email, role, display_name FROM admin_users;
-- SELECT w.display_name, w.country, w.pay_tier, w.status FROM workers w;

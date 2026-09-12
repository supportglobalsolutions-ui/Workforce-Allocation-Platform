-- ===========================================================================
--  Row Level Security for the Workforce Allocation Platform
-- ===========================================================================
--
--  WHY DENY-BY-DEFAULT IS THE CORRECT POLICY SET HERE
--  --------------------------------------------------
--  The browser never talks to Postgres in this architecture. The Next.js
--  frontend calls the FastAPI backend through the /api rewrite, and only the
--  backend holds a database connection. Nothing legitimate reaches these
--  tables through Supabase's Data API (PostgREST) or supabase-js.
--
--  So the right configuration is: RLS enabled on every table, and NO
--  permissive policies. Every anon/authenticated request through the Data API
--  returns zero rows. This both clears the "RLS Disabled in Public" advisor
--  errors and is genuinely the most secure posture - adding permissive
--  policies would open a second, unguarded door into the database.
--
--  WHY THIS DOES NOT BREAK THE BACKEND
--  -----------------------------------
--  The backend connects as `postgres`, which both owns these tables and holds
--  BYPASSRLS. A table owner bypasses RLS unless FORCE ROW LEVEL SECURITY is
--  set, and we deliberately do not set it. Verified on this project:
--      current_user = postgres, rolbypassrls = true, owner = postgres
--
--  Idempotent: safe to run repeatedly, and it picks up newly created tables.
-- ===========================================================================


-- ---------------------------------------------------------------------------
--  1. Enable RLS on every base table in the public schema.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t record;
    n integer := 0;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public'
          AND c.relkind = 'r'
          AND NOT c.relrowsecurity
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
        n := n + 1;
    END LOOP;
    RAISE NOTICE 'RLS enabled on % table(s)', n;
END $$;


-- ---------------------------------------------------------------------------
--  2. Revoke the blanket Data API grants.
--
--  Supabase grants ALL on public tables to anon/authenticated by default.
--  RLS with no policy already denies every row, but removing the grant means
--  the API returns a permission error instead of a silent empty set - a much
--  clearer signal if something ever does try to read directly.
--
--  service_role keeps its grants: it is server-side only and bypasses RLS.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relkind = 'r'
    LOOP
        EXECUTE format(
            'REVOKE ALL ON public.%I FROM anon, authenticated', t.relname
        );
    END LOOP;
END $$;


-- ===========================================================================
--  3. OPTIONAL - Supabase Realtime for the RDP claim board
-- ===========================================================================
--
--  Only needed when the frontend subscribes to Postgres changes directly
--  (worker/rdp-claim-board). Realtime enforces RLS, so a subscribing client
--  needs both a SELECT grant and a SELECT policy on the table.
--
--  Everything below is commented out. Uncomment ONLY the tables you actually
--  subscribe to - each one you enable is a table the browser can read.
--
--  These assume the Supabase JWT's `sub` is stored on admin_users.auth_user_id
--  (holds the Supabase user id).
-- ---------------------------------------------------------------------------

-- -- Machine availability: every signed-in worker may see the board.
-- -- Columns exposed: nickname, country, status, client_group. No credentials
-- -- live on this table, but review that list before enabling.
-- GRANT SELECT ON public.rdp_resources TO authenticated;
-- CREATE POLICY "rdp_resources: signed-in users may read the board"
--     ON public.rdp_resources
--     FOR SELECT
--     TO authenticated
--     USING (true);
--
-- -- A worker may see only their own sessions, never anyone else's.
-- GRANT SELECT ON public.sessions TO authenticated;
-- CREATE POLICY "sessions: a worker sees only their own rows"
--     ON public.sessions
--     FOR SELECT
--     TO authenticated
--     USING (
--         worker_id IN (
--             SELECT w.id
--             FROM public.workers w
--             JOIN public.admin_users au ON au.id = w.admin_user_id
--             WHERE au.auth_user_id = auth.jwt() ->> 'sub'
--         )
--     );
--
-- -- Realtime also requires the table to be in the publication:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.rdp_resources;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;


-- ===========================================================================
--  4. Verification
-- ===========================================================================
--  Expect: tables_without_rls = 0, and permissive_policies = 0 unless you
--  deliberately enabled the Realtime section above.
-- ---------------------------------------------------------------------------
SELECT
    count(*) FILTER (WHERE NOT c.relrowsecurity) AS tables_without_rls,
    count(*)                                     AS total_tables,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public')
                                                 AS permissive_policies
FROM pg_class c
JOIN pg_namespace ns ON ns.oid = c.relnamespace
WHERE ns.nspname = 'public' AND c.relkind = 'r';

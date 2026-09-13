-- ============================================================================
-- Make the session-images bucket PRIVATE and gate it with RLS.
--
-- Run in the Supabase SQL editor (it needs owner rights on storage.objects).
--
-- Before: the bucket was public, so any session screenshot was readable by
-- anyone who had — or guessed — its URL (paths are "<session_id>/start.jpg").
-- After: objects are reachable only through short-lived signed URLs minted for
-- an authenticated user, and only workers/admins can write.
--
-- Existing rows keep working: the app extracts the object path out of the old
-- public URLs, so no data migration is required.
-- ============================================================================

-- 1. Flip the bucket to private. Public URLs stop resolving immediately.
update storage.buckets
   set public = false
 where id = 'session-images';

-- 2. Replace any previous policies on this bucket.
drop policy if exists "session images are publicly readable" on storage.objects;
drop policy if exists "session_images_read"   on storage.objects;
drop policy if exists "session_images_insert" on storage.objects;
drop policy if exists "session_images_update" on storage.objects;

alter table storage.objects enable row level security;

-- 3. Any signed-in user may read; the signed URL is what actually carries
--    authorisation, and admins need to review every worker's evidence.
create policy "session_images_read"
    on storage.objects for select
    to authenticated
 using (bucket_id = 'session-images');

-- 4. Signed-in users may upload and replace (upsert writes an UPDATE).
create policy "session_images_insert"
    on storage.objects for insert
    to authenticated
 with check (bucket_id = 'session-images');

create policy "session_images_update"
    on storage.objects for update
    to authenticated
 using (bucket_id = 'session-images')
 with check (bucket_id = 'session-images');

-- Deliberately no DELETE policy: session evidence is an audit trail and must
-- not be removable from the client. Replacing an image overwrites it in place.

-- 5. Verify.
select id, public from storage.buckets where id = 'session-images';
select policyname, cmd
  from pg_policies
 where schemaname = 'storage'
   and tablename  = 'objects'
   and policyname like 'session_images%'
 order by policyname;

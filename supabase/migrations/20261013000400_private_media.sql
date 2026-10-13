-- mystory: book media is no longer public.
--
-- Until now the three buckets were PUBLIC: anyone who knew (or guessed) an
-- object name could download it, including the pictures and recordings of
-- private, draft and pending books, and a revoked share link did not revoke
-- them. Object names are predictable ("books/<bookId>/cover.png").
--
-- From here on the buckets are PRIVATE. Browsers never talk to storage
-- directly: they ask the site's /media route, which checks the book
-- (published => anyone; otherwise the owner, staff, or a valid share token)
-- and redirects to a signed URL that expires (src/app/media/[...path]/route.ts,
-- src/lib/media/supabase.ts). The server signs with the service-role key.
--
-- NOT TESTED against a real Supabase project.

update storage.buckets
   set public = false
 where id in ('book-images', 'book-audio', 'book-files');

-- The mystory_media_select policy (owner or staff may read their own objects
-- with their own JWT) stays as it is. There is no policy for anon, so with the
-- buckets private an anonymous request to storage gets nothing.

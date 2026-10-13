-- mystory: book content is written by the server only.
--
-- The first two migrations let a signed-in browser client (anon key + the
-- user's own JWT) write the books, pages and storage objects it owns. Those
-- direct writes skipped every rule the application enforces in
-- src/lib/studio and src/lib/auth:
--   - a published book is locked for its owner (only editors change it), so an
--     owner could replace the reviewed text, images and audio of a book in the
--     public library, including with external URLs;
--   - page count and text length limits, media path validation, media type
--     checks and the per-owner book limit.
--
-- The Next.js server never uses those privileges: it reads and writes with the
-- service-role key (src/lib/repo/supabase.ts, src/lib/media/supabase.ts) and
-- the anon key is only used for Supabase Auth. So the privileges are removed
-- instead of being narrowed. Reading is unchanged.

-- ---------------------------------------------------------------------------
-- Tables: no direct insert / update / delete on books and pages
-- ---------------------------------------------------------------------------

revoke insert, update, delete, truncate on public.books, public.pages from anon, authenticated;

-- The write policies are dropped too, so that granting the privilege back by
-- mistake does not silently reopen the hole: with row level security enabled
-- and no policy for a command, that command is denied.
drop policy if exists books_insert on public.books;
drop policy if exists books_update on public.books;
drop policy if exists books_delete on public.books;
drop policy if exists pages_insert on public.pages;
drop policy if exists pages_update on public.pages;
drop policy if exists pages_delete on public.pages;

-- replace_book_pages() rewrites all pages of a book; server only.
revoke execute on function public.replace_book_pages(text, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_book_pages(text, jsonb, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: no direct upload, overwrite or delete in the book buckets
-- ---------------------------------------------------------------------------

drop policy if exists mystory_media_insert on storage.objects;
drop policy if exists mystory_media_update on storage.objects;
drop policy if exists mystory_media_delete on storage.objects;

-- The remaining mystory_media_select policy only lets a signed-in user list
-- the files of books they own (or any book, for editors and admins). It still
-- calls can_write_media(), which despite its name no longer grants any write.
comment on function public.can_write_media(text, text) is
  'Used by mystory_media_select only: may the caller list this object. Grants no write access.';

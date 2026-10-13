-- mystory: storage buckets and policies.
--
-- A media path "books/<bookId>/<file>" is stored under the same object name in
-- one of three buckets, chosen by file extension (see src/lib/media/supabase.ts).
--
-- The buckets are PUBLIC: anyone who knows an object URL can download it, the
-- same as the local /media route. Object names contain the opaque book id, and
-- no policy lets visitors list a bucket. The server uploads with the
-- service-role key; the policies below additionally let a signed-in user manage
-- the files of books they own (or any book, for editors and admins).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('book-images', 'book-images', true, 20971520, array['image/*']),
  ('book-audio', 'book-audio', true, 52428800, array['audio/*', 'video/webm']),
  ('book-files', 'book-files', true, 52428800, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when the caller may write the object: it lives under books/<bookId>/
-- and the caller owns that book or is staff.
create function public.can_write_media(p_bucket text, p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_bucket in ('book-images', 'book-audio', 'book-files')
    and (storage.foldername(p_name))[1] = 'books'
    and exists (
      select 1 from public.books b
      where b.id = (storage.foldername(p_name))[2]
        and (b.owner_id = (select auth.uid())::text or public.is_staff())
    );
$$;

grant execute on function public.can_write_media(text, text) to authenticated, service_role;

create policy mystory_media_select on storage.objects
  for select to authenticated
  using (public.can_write_media(bucket_id, name));

create policy mystory_media_insert on storage.objects
  for insert to authenticated
  with check (public.can_write_media(bucket_id, name));

create policy mystory_media_update on storage.objects
  for update to authenticated
  using (public.can_write_media(bucket_id, name))
  with check (public.can_write_media(bucket_id, name));

create policy mystory_media_delete on storage.objects
  for delete to authenticated
  using (public.can_write_media(bucket_id, name));

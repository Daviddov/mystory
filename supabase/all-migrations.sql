-- mystory: database schema, indexes and row level security.
--
-- One table per entity of src/lib/types.ts. The Next.js server talks to the
-- database with the service-role key (which bypasses RLS) and enforces access
-- in application code (canViewBook / canEditBook / requireRole). The policies
-- below protect the data against direct use of the public anon key, which is
-- shipped to every browser.
--
-- Ids are text, not uuid: books use "bk_...", seeded books are owned by
-- "system", and a signed-in user's id is auth.uid()::text.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  name text not null check (char_length(name) between 1 and 100),
  email text,
  role text not null default 'parent' check (role in ('parent', 'editor', 'admin')),
  created_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

create table public.books (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null default '',
  author text not null default '',
  illustrator text not null default '',
  license text not null default '',
  source text not null default '',
  age_group text not null default '3-5' check (age_group in ('0-2', '3-5', '6-8')),
  reading_minutes numeric not null default 1 check (reading_minutes between 1 and 240),
  cover_image text not null default '',
  status text not null default 'draft' check (status in ('draft', 'private', 'pending', 'published')),
  owner_id text not null,
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  -- tags.map(tagSlug), maintained by the application; used by the tag filter.
  tag_slugs text[] not null default '{}',
  themes text[] not null default '{}',
  discussion_questions text[] not null default '{}',
  share_token text check (share_token is null or char_length(share_token) >= 16),
  origin text not null default 'manual' check (origin in ('manual', 'import', 'ai')),
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  soundtrack text,
  review_note text,
  cost_usd numeric check (cost_usd is null or cost_usd >= 0),
  -- Nikud-free, lowercased text of every searchable field and of all pages
  -- (normalizeForSearch in src/lib/hebrew.ts), maintained by the application.
  search_text text not null default '',
  -- Sort key of the default "new" order.
  sort_date timestamptz generated always as (coalesce(published_at, created_at)) stored,
  constraint books_slug_key unique (slug),
  constraint books_share_token_key unique (share_token)
);

-- Library filters.
create index books_status_new_idx on public.books (status, sort_date desc);
create index books_status_popular_idx on public.books (status, view_count desc);
create index books_status_age_idx on public.books (status, age_group);
create index books_status_minutes_idx on public.books (status, reading_minutes);
create index books_status_title_idx on public.books (status, title);
create index books_owner_idx on public.books (owner_id, updated_at desc);
create index books_categories_idx on public.books using gin (categories);
create index books_themes_idx on public.books using gin (themes);
create index books_tag_slugs_idx on public.books using gin (tag_slugs);
-- Free-text search. Postgres has no Hebrew text-search dictionary, and Hebrew
-- attaches prefixes to words, so search is substring based (ILIKE per token)
-- and served by a trigram index instead of a tsvector.
create index books_search_idx on public.books using gin (search_text extensions.gin_trgm_ops);

create table public.pages (
  book_id text not null references public.books (id) on delete cascade,
  page_index integer not null check (page_index >= 0),
  text text not null default '',
  text_nikud text,
  image text,
  audio text,
  word_timings jsonb,
  audio_source text check (audio_source is null or audio_source in ('tts', 'recorded', 'mock')),
  primary key (book_id, page_index)
);

create table public.collections (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  -- Ordered list of book ids.
  book_ids text[] not null default '{}',
  season text,
  created_at timestamptz not null default now(),
  constraint collections_slug_key unique (slug)
);

-- A single row holding the SiteSettings object.
create table public.site_settings (
  id boolean primary key default true check (id),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (true);

create table public.favorites (
  user_id text not null,
  book_id text not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create index favorites_user_idx on public.favorites (user_id, created_at desc);
create index favorites_book_idx on public.favorites (book_id);

create table public.reading_progress (
  user_id text not null,
  book_id text not null references public.books (id) on delete cascade,
  page_index integer not null default 0 check (page_index >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create index reading_progress_user_idx on public.reading_progress (user_id, updated_at desc);
create index reading_progress_book_idx on public.reading_progress (book_id);

create table public.generation_jobs (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  owner_id text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  step text not null default 'queued',
  progress numeric not null default 0 check (progress between 0 and 100),
  book_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  kind text check (kind is null or kind in ('wizard', 'daily')),
  input jsonb,
  message text,
  used_mock boolean,
  cost_usd numeric check (cost_usd is null or cost_usd >= 0)
);
create index generation_jobs_owner_idx on public.generation_jobs (owner_id, created_at desc);
create index generation_jobs_status_idx on public.generation_jobs (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies can read the caller's own role
-- without opening the profiles table)
-- ---------------------------------------------------------------------------

create function public.app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = (select auth.uid())::text),
    'anon'
  );
$$;

create function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.app_role() in ('editor', 'admin');
$$;

create function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.app_role() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A profile row for every new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id::text,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'הורה'
      ),
      100
    ),
    lower(new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Columns a browser client (anon / authenticated key) may never set on its
-- own, even on rows it owns. SECURITY INVOKER on purpose: current_user is
-- 'anon' / 'authenticated' for API requests, and the function owner inside the
-- security definer functions of this file, which must stay unrestricted.
create function public.books_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_staff() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.view_count := 0;
    new.published_at := null;
    new.review_note := null;
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.view_count := old.view_count;
    new.published_at := old.published_at;
    new.review_note := old.review_note;
  end if;
  return new;
end;
$$;

create trigger books_guard
  before insert or update on public.books
  for each row execute function public.books_guard();

create function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'parent';
  else
    new.id := old.id;
    new.role := old.role;
    new.email := old.email;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- Deleting a book also removes it from collections and from the settings
-- (pages, favorites and progress go through ON DELETE CASCADE).
create function public.books_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.collections
    set book_ids = array_remove(book_ids, old.id)
    where book_ids @> array[old.id];
  update public.site_settings
    set data = data - 'bookOfTheWeekId'::text
    where data ->> 'bookOfTheWeekId' = old.id;
  return old;
end;
$$;

create trigger books_cleanup
  after delete on public.books
  for each row execute function public.books_cleanup();

-- ---------------------------------------------------------------------------
-- RPC functions
-- ---------------------------------------------------------------------------

-- The only way to read a non-published book without being its owner or staff:
-- present its share token. Returns the book row with a "pages" array, or null.
create function public.get_shared_book(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (to_jsonb(b) - 'search_text'::text) || jsonb_build_object(
    'pages',
    coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.page_index) from public.pages p where p.book_id = b.id),
      '[]'::jsonb
    )
  )
  from public.books b
  where p_token is not null
    and char_length(p_token) >= 16
    and b.share_token = p_token
  limit 1;
$$;

-- Replaces all pages of a book in one transaction and refreshes the search
-- text. SECURITY INVOKER: row level security of the caller applies.
create function public.replace_book_pages(
  p_book_id text,
  p_pages jsonb,
  p_search_text text,
  p_updated_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.books
    set search_text = p_search_text, updated_at = p_updated_at
    where id = p_book_id;
  if not found then
    raise exception 'book % not found', p_book_id using errcode = 'P0002';
  end if;

  delete from public.pages where book_id = p_book_id;

  insert into public.pages (book_id, page_index, text, text_nikud, image, audio, word_timings, audio_source)
  select
    p_book_id,
    (t.ord - 1)::integer,
    coalesce(t.elem ->> 'text', ''),
    t.elem ->> 'textNikud',
    t.elem ->> 'image',
    t.elem ->> 'audio',
    case when jsonb_typeof(t.elem -> 'wordTimings') = 'array' then t.elem -> 'wordTimings' end,
    t.elem ->> 'audioSource'
  from jsonb_array_elements(coalesce(p_pages, '[]'::jsonb)) with ordinality as t (elem, ord);
end;
$$;

-- Atomic view counter. Server only (service role), so visitors cannot inflate
-- counts through the public API. Returns null when the book does not exist.
create function public.increment_book_views(p_book_id text)
returns integer
language sql
set search_path = ''
as $$
  update public.books set view_count = view_count + 1 where id = p_book_id returning view_count;
$$;

revoke execute on function public.increment_book_views(text) from public, anon, authenticated;
grant execute on function public.increment_book_views(text) to service_role;

revoke execute on function public.replace_book_pages(text, jsonb, text, timestamptz) from public, anon;
grant execute on function public.replace_book_pages(text, jsonb, text, timestamptz) to authenticated, service_role;

grant execute on function public.get_shared_book(text) to anon, authenticated, service_role;
grant execute on function public.app_role() to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- Trigger functions are never called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.books_cleanup() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges (explicit, so the result does not depend on the project's
-- default privileges)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant all on
  public.profiles, public.books, public.pages, public.collections, public.site_settings,
  public.favorites, public.reading_progress, public.generation_jobs
  to service_role;

revoke all on
  public.profiles, public.books, public.pages, public.collections, public.site_settings,
  public.favorites, public.reading_progress, public.generation_jobs
  from anon, authenticated;
grant select on public.books, public.pages, public.collections, public.site_settings to anon, authenticated;
grant insert, update, delete on public.books, public.pages, public.collections to authenticated;
grant insert, update on public.site_settings to authenticated;
grant select, insert, update, delete on public.profiles, public.favorites, public.reading_progress to authenticated;
grant select, insert, update, delete on public.generation_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.pages enable row level security;
alter table public.collections enable row level security;
alter table public.site_settings enable row level security;
alter table public.favorites enable row level security;
alter table public.reading_progress enable row level security;
alter table public.generation_jobs enable row level security;

-- books: published books are public; everything else is visible to its owner
-- and to editors / admins. Share-token readers go through get_shared_book().
create policy books_select on public.books
  for select to anon, authenticated
  using (
    status = 'published'
    or owner_id = (select auth.uid())::text
    or (select public.is_staff())
  );

-- Owners write their own books but cannot publish them: only an editor or an
-- admin may set status 'published'.
create policy books_insert on public.books
  for insert to authenticated
  with check (
    (owner_id = (select auth.uid())::text and status in ('draft', 'private', 'pending'))
    or (select public.is_staff())
  );

create policy books_update on public.books
  for update to authenticated
  using (owner_id = (select auth.uid())::text or (select public.is_staff()))
  with check (
    (owner_id = (select auth.uid())::text and status in ('draft', 'private', 'pending'))
    or (select public.is_staff())
  );

create policy books_delete on public.books
  for delete to authenticated
  using (owner_id = (select auth.uid())::text or (select public.is_staff()));

-- pages: readable exactly when the book is readable (the subquery is itself
-- filtered by books_select); writable by the book's owner and by staff.
create policy pages_select on public.pages
  for select to anon, authenticated
  using (exists (select 1 from public.books b where b.id = pages.book_id));

create policy pages_insert on public.pages
  for insert to authenticated
  with check (
    exists (
      select 1 from public.books b
      where b.id = pages.book_id
        and (b.owner_id = (select auth.uid())::text or (select public.is_staff()))
    )
  );

create policy pages_update on public.pages
  for update to authenticated
  using (
    exists (
      select 1 from public.books b
      where b.id = pages.book_id
        and (b.owner_id = (select auth.uid())::text or (select public.is_staff()))
    )
  )
  with check (
    exists (
      select 1 from public.books b
      where b.id = pages.book_id
        and (b.owner_id = (select auth.uid())::text or (select public.is_staff()))
    )
  );

create policy pages_delete on public.pages
  for delete to authenticated
  using (
    exists (
      select 1 from public.books b
      where b.id = pages.book_id
        and (b.owner_id = (select auth.uid())::text or (select public.is_staff()))
    )
  );

-- collections: public to read, curated by editors and admins.
create policy collections_select on public.collections
  for select to anon, authenticated using (true);
create policy collections_insert on public.collections
  for insert to authenticated with check ((select public.is_staff()));
create policy collections_update on public.collections
  for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy collections_delete on public.collections
  for delete to authenticated using ((select public.is_staff()));

-- site settings: public to read, written by admins only.
create policy site_settings_select on public.site_settings
  for select to anon, authenticated using (true);
create policy site_settings_insert on public.site_settings
  for insert to authenticated with check ((select public.is_admin()));
create policy site_settings_update on public.site_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- profiles: a user sees and renames only their own profile (profiles_guard
-- keeps role and email unchanged); editors may read all, admins manage all.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid())::text or (select public.is_staff()));
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid())::text or (select public.is_admin()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())::text or (select public.is_admin()))
  with check (id = (select auth.uid())::text or (select public.is_admin()));
create policy profiles_delete on public.profiles
  for delete to authenticated using ((select public.is_admin()));

-- favorites and reading progress: strictly per user.
create policy favorites_all on public.favorites
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

create policy reading_progress_all on public.reading_progress
  for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

-- generation jobs: owners may only read theirs. Jobs drive the weekly AI
-- quota, so they are written by the server (service role) or by an admin.
create policy generation_jobs_select on public.generation_jobs
  for select to authenticated
  using (owner_id = (select auth.uid())::text or (select public.is_staff()));
create policy generation_jobs_insert on public.generation_jobs
  for insert to authenticated with check ((select public.is_admin()));
create policy generation_jobs_update on public.generation_jobs
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy generation_jobs_delete on public.generation_jobs
  for delete to authenticated using ((select public.is_admin()));
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
-- mystory: imported Creative Commons books and their translation.
--
--   books.language           language of the title, summary and page texts ('he' | 'en')
--   books.original_language  language the book was written in, when it is a translation
--   books.credits            designer, editor, translator, original publisher, attribution line
--   pages.original_text      the page text in the original language, kept next to the translation
--   pages.image_alt          description of the illustration (alternative text)
--
-- Only Hebrew books may enter the public library; the application enforces it
-- (src/lib/studio/shared.ts, src/app/admin/_lib/service.ts) and the check
-- constraint below repeats it in the database.

alter table public.books
  add column language text not null default 'he' check (language in ('he', 'en')),
  add column original_language text check (original_language is null or original_language in ('he', 'en')),
  add column credits jsonb check (credits is null or jsonb_typeof(credits) = 'object');

alter table public.books
  add constraint books_published_in_hebrew check (status <> 'published' or language = 'he');

alter table public.pages
  add column original_text text,
  add column image_alt text;

-- Same function as before, now also writing original_text and image_alt.
-- "create or replace" keeps the privileges set by the previous migration
-- (service_role only); they are stated again below so this file stands alone.
create or replace function public.replace_book_pages(
  p_book_id text,
  p_pages jsonb,
  p_search_text text,
  p_updated_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.books
    set search_text = p_search_text, updated_at = p_updated_at
    where id = p_book_id;
  if not found then
    raise exception 'book % not found', p_book_id using errcode = 'P0002';
  end if;

  delete from public.pages where book_id = p_book_id;

  insert into public.pages (
    book_id, page_index, text, text_nikud, image, audio, word_timings, audio_source, original_text, image_alt
  )
  select
    p_book_id,
    (t.ord - 1)::integer,
    coalesce(t.elem ->> 'text', ''),
    t.elem ->> 'textNikud',
    t.elem ->> 'image',
    t.elem ->> 'audio',
    case when jsonb_typeof(t.elem -> 'wordTimings') = 'array' then t.elem -> 'wordTimings' end,
    t.elem ->> 'audioSource',
    t.elem ->> 'originalText',
    t.elem ->> 'imageAlt'
  from jsonb_array_elements(coalesce(p_pages, '[]'::jsonb)) with ordinality as t (elem, ord);
end;
$$;

revoke execute on function public.replace_book_pages(text, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_book_pages(text, jsonb, text, timestamptz) to service_role;
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
-- An admin may publish a book that is not in Hebrew (the server asks for an explicit
-- confirmation). The database no longer forbids it.
alter table public.books drop constraint if exists books_published_in_hebrew;
-- Family recordings: a reader's own narration of a book, page by page.
-- private -> only the person who recorded it and staff; pending -> waiting in
-- the admin queue; approved -> offered to every reader as a narration version.
-- Written and read only by the server (service role), like the other tables
-- since 20261013000200_server_only_writes.

create table public.recordings (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  book_id text not null references public.books (id) on delete cascade,
  user_id text not null,
  title text not null check (char_length(title) between 1 and 60),
  status text not null default 'private' check (status in ('private', 'pending', 'approved')),
  review_note text,
  -- [{ "index": 0, "audio": "books/<bookId>/rec/<id>/<file>" }, ...]
  pages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index recordings_user_idx on public.recordings (user_id, updated_at desc);
create index recordings_book_idx on public.recordings (book_id, status);
create index recordings_status_idx on public.recordings (status, submitted_at);

grant all on public.recordings to service_role;
revoke all on public.recordings from anon, authenticated;
alter table public.recordings enable row level security;
-- No policies: browser roles have no access.
-- mystory: the hero of an illustrated book.
--
--   books.hero   { description, style?, image? }: the character every page is
--                drawn from (see BookHeroSchema in src/lib/types.ts). The
--                studio makes the reference image and illustrates pages from it.

alter table public.books
  add column hero jsonb check (hero is null or jsonb_typeof(hero) = 'object');
-- Living illustrations: a short muted clip that animates a page illustration.
-- See Page.video / videoImageHash / videoSource in src/lib/types.ts.

alter table public.pages
  add column if not exists video text,
  add column if not exists video_image_hash text,
  add column if not exists video_source text check (video_source in ('ai', 'mock'));

create or replace function public.replace_book_pages(
  p_book_id text,
  p_pages jsonb,
  p_search_text text,
  p_updated_at timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.books
    set search_text = p_search_text, updated_at = p_updated_at
    where id = p_book_id;
  if not found then
    raise exception 'book % not found', p_book_id using errcode = 'P0002';
  end if;

  delete from public.pages where book_id = p_book_id;

  insert into public.pages (
    book_id, page_index, text, text_nikud, image, audio, word_timings, audio_source, original_text, image_alt,
    video, video_image_hash, video_source
  )
  select
    p_book_id,
    (t.ord - 1)::integer,
    coalesce(t.elem ->> 'text', ''),
    t.elem ->> 'textNikud',
    t.elem ->> 'image',
    t.elem ->> 'audio',
    case when jsonb_typeof(t.elem -> 'wordTimings') = 'array' then t.elem -> 'wordTimings' end,
    t.elem ->> 'audioSource',
    t.elem ->> 'originalText',
    t.elem ->> 'imageAlt',
    t.elem ->> 'video',
    t.elem ->> 'videoImageHash',
    t.elem ->> 'videoSource'
  from jsonb_array_elements(coalesce(p_pages, '[]'::jsonb)) with ordinality as t (elem, ord);
end;
$$;

revoke execute on function public.replace_book_pages(text, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_book_pages(text, jsonb, text, timestamptz) to service_role;

-- mystory: a book can suit more than one age group.
--
--   books.extra_age_groups   age groups the book also suits besides age_group.
--                            The library lists it under each of them too.

alter table public.books
  add column extra_age_groups text[] not null default '{}'
    check (extra_age_groups <@ array['0-2', '3-5', '6-8']::text[]);

create index books_extra_age_groups_idx on public.books using gin (extra_age_groups);

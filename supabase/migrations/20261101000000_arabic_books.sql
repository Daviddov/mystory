-- mystory: Arabic books.
--
-- Arabic joins the book languages ('he' | 'en' | 'ar'), and an Arabic book may
-- be published as it is: the public library is Hebrew and Arabic (see
-- LIBRARY_LANGUAGES in src/lib/types.ts). English books still wait for a
-- Hebrew translation.

alter table public.books
  drop constraint if exists books_language_check,
  drop constraint if exists books_original_language_check,
  drop constraint if exists books_published_in_hebrew;

alter table public.books
  add constraint books_language_check check (language in ('he', 'en', 'ar')),
  add constraint books_original_language_check
    check (original_language is null or original_language in ('he', 'en', 'ar')),
  add constraint books_published_in_library_language check (status <> 'published' or language in ('he', 'ar'));

create index if not exists books_language_status_idx on public.books (language, status);

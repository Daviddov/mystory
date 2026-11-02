-- mystory: more than one second language per book.
-- See Book.extraTranslations and Page.extraTranslations in src/lib/types.ts.
--
--   books.extra_translations   [{ language, title, summary?, translator?, attributionLine? }, ...]
--   pages.extra_translations   { "<language>": { text, audio?, wordTimings?, audioSource? }, ... }
--   books.reading_languages    every language the book can be read in (its own, translation,
--                              extra_translations), kept by the database; the shelves filter on it.

alter table public.books
  add column if not exists extra_translations jsonb
    check (extra_translations is null or jsonb_typeof(extra_translations) = 'array');

alter table public.pages
  add column if not exists extra_translations jsonb
    check (extra_translations is null or jsonb_typeof(extra_translations) = 'object');

-- BOOK_LANGUAGES has three languages, so a book has at most two others: a translation and
-- one extra. Three extra slots leave room without a subquery (not allowed in a generated column).
alter table public.books
  add column if not exists reading_languages text[] generated always as (
    array_remove(array[
      language,
      translation ->> 'language',
      extra_translations -> 0 ->> 'language',
      extra_translations -> 1 ->> 'language',
      extra_translations -> 2 ->> 'language'
    ], null)
  ) stored;

create index if not exists books_reading_languages_idx on public.books using gin (reading_languages);

-- Same function as before, now also writing extra_translations.
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
    video, video_image_hash, video_source, translation, extra_translations
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
    t.elem ->> 'videoSource',
    case when jsonb_typeof(t.elem -> 'translation') = 'object' then t.elem -> 'translation' end,
    case when jsonb_typeof(t.elem -> 'extraTranslations') = 'object' then t.elem -> 'extraTranslations' end
  from jsonb_array_elements(coalesce(p_pages, '[]'::jsonb)) with ordinality as t (elem, ord);
end;
$$;

revoke execute on function public.replace_book_pages(text, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.replace_book_pages(text, jsonb, text, timestamptz) to service_role;

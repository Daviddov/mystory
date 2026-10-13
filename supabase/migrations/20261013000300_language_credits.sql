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

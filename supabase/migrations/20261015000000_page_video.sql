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

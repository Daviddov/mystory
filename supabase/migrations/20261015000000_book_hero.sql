-- mystory: the hero of an illustrated book.
--
--   books.hero   { description, style?, image? }: the character every page is
--                drawn from (see BookHeroSchema in src/lib/types.ts). The
--                studio makes the reference image and illustrates pages from it.

alter table public.books
  add column hero jsonb check (hero is null or jsonb_typeof(hero) = 'object');

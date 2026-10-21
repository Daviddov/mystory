-- mystory: sort books by author in the admin console.
--
--   books.author_sort   the author without surrounding spaces, null when the
--                       book has no author, so "order by author_sort nulls last"
--                       lists books without an author after all the others.

alter table public.books
  add column author_sort text generated always as (nullif(btrim(author), '')) stored;

create index books_author_sort_idx on public.books (author_sort, title);

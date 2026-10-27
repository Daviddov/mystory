-- mystory: a book can suit more than one age group.
--
--   books.extra_age_groups   age groups the book also suits besides age_group.
--                            The library lists it under each of them too.

alter table public.books
  add column extra_age_groups text[] not null default '{}'
    check (extra_age_groups <@ array['0-2', '3-5', '6-8']::text[]);

create index books_extra_age_groups_idx on public.books using gin (extra_age_groups);

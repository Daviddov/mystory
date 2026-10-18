-- mystory: star ratings. One 1-5 rating per user per book; readers see the average.
-- Written and read only by the server (service role), like recordings.

create table public.ratings (
  user_id text not null,
  book_id text not null references public.books (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create index ratings_book_idx on public.ratings (book_id);

grant all on public.ratings to service_role;
revoke all on public.ratings from anon, authenticated;
alter table public.ratings enable row level security;
-- No policies: browser roles have no access.

-- mystory: readers' comments on books. Plain text, 1-1000 characters; signed-in
-- users write and delete their own, editors and admins delete any.
-- Written and read only by the server (service role), like ratings.

create table public.comments (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  book_id text not null references public.books (id) on delete cascade,
  user_id text not null,
  author_name text not null check (char_length(author_name) between 1 and 100),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_book_created_idx on public.comments (book_id, created_at desc);

grant all on public.comments to service_role;
revoke all on public.comments from anon, authenticated;
alter table public.comments enable row level security;
-- No policies: browser roles have no access.

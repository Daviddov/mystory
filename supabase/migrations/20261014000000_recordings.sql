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

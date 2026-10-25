-- mystory: the user's own listening playlist (/listen). One row per user per book.
-- Written and read only by the server (service role), like ratings.

create table public.listen_playlist (
  user_id text not null,
  book_id text not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create index listen_playlist_book_idx on public.listen_playlist (book_id);

grant all on public.listen_playlist to service_role;
revoke all on public.listen_playlist from anon, authenticated;
alter table public.listen_playlist enable row level security;
-- No policies: browser roles have no access.

-- mystory: waiting list for paid credits and printed personal books (a demand test).
-- Written and read only by the server (service role). One row per e-mail, lower-cased.

create table public.waitlist (
  email text primary key check (email = lower(email) and char_length(email) <= 254),
  interests text[] not null check (cardinality(interests) >= 1),
  created_at timestamptz not null default now()
);

grant all on public.waitlist to service_role;
revoke all on public.waitlist from anon, authenticated;
alter table public.waitlist enable row level security;
-- No policies: browser roles have no access.

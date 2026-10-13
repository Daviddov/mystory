-- An admin may publish a book that is not in Hebrew (the server asks for an explicit
-- confirmation). The database no longer forbids it.
alter table public.books drop constraint if exists books_published_in_hebrew;

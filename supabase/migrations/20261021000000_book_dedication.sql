-- mystory: a personal dedication on a book.
--
--   books.dedication   short free text shown on the reader's start screen
--                      ("לנועם, באהבה, סבתא"). Optional, at most 200 characters.

alter table public.books
  add column dedication text check (dedication is null or char_length(dedication) <= 200);

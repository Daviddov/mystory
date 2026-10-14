# הסיפור שלי (mystory)

A Hebrew, right-to-left website for reading and listening to children's
stories, with easy book upload and creation. The product plan is in
[PLAN.md](PLAN.md).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

No credentials are needed. Six sample books are already seeded under `data/`,
each with (silent) demo narration.

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (`src/**/*.test.ts(x)`) |
| `npm run seed` | Rewrite the sample books, collections and book of the week, then narrate them |
| `npm run narrate -- <slug>… \| --all \| --seed [--force] [--pages 1,3]` | Run the nikud + narration pipeline on local books |
| `npm run pipeline:status -- [--details]` | What stands between the local books and the library: missing details, pages and characters still to narrate |
| `npm run book-meta -- <bookId> <file> [--submit]` / `-- --batch <file>` | Set metadata and credits from a JSON patch; `--batch` takes `{ "<bookId>": patch }` for many books |
| `npm run bookdash:credits -- [<slug>…] [--dry-run]` | Fill author, illustrator, designer and editor of Book Dash books from their page on bookdash.org |
| `npm run daily-story -- [--force] [--dry-run]` | Create today's AI story as a `pending` book (local data only) |
| `npm run import:bookdash -- <slug>… \| --all \| --list [--owner <email>] [--force]` | Import Book Dash books (CC BY 4.0) as English drafts; see "Free books and translation" |

To sign in on a production build (`npm start`) without Supabase, set
`ALLOW_DEV_LOGIN=1`; the password-less development login is otherwise refused
there. An email listed in `ADMIN_EMAILS` gets the admin role.

## What exists

| Area | Routes |
|---|---|
| Library | `/`, `/books`, `/age/[group]`, `/category/[slug]`, `/tag/[tag]`, `/time/[bucket]`, `/theme/[slug]`, `/collections`, `/search`, `/book/[slug]` |
| Reader | `/read/[slug]` (`?page=`, `?listen=1`, `?token=`), `/listen` (bedtime queue) |
| Print | `/print/[slug]`, `GET /api/pdf/[slug]` (`?nikud=1`, `?token=`) |
| Studio | `/studio`, `/studio/new`, `/studio/[id]`, `/studio/import`, `/api/studio/books/**`, `/api/import/*`, `GET /api/export/[bookId]` |
| Narration | `POST /api/narration/[bookId]` (NDJSON progress), `POST /api/narration/nikud` |
| AI wizard | `/create`, `POST /api/generate`, `GET /api/generate/[jobId]`, `POST /api/generate/daily` |
| Personal | `/me`, `/me/favorites`, `/share/[token]`, `/api/favorites`, `/api/progress`, `/api/share/[bookId]`, `POST /api/views/[bookId]` |
| Offline / PWA | `/offline`, `/offline/read`, `public/sw.js`, `manifest.webmanifest` |
| Admin | `/admin`, `/admin/queue`, `/admin/pipeline`, `/admin/books`, `/admin/collections`, `/admin/taxonomy`, `/admin/import`, `/admin/users`, `/api/admin/**` |
| Info | `/about`, `/faq`, `/privacy`, `/terms` (the last two are unreviewed drafts with `[חסר]` placeholders) |

Book lifecycle: `draft` → `private` (share link possible) → `pending`
(submitted by the owner) → `published` (approved by an editor or admin). A
pending or published book is locked for its owner until it is moved back to
private, so the editor approves exactly what they read (the approval also
carries the `updatedAt` the editor saw and is refused if the book changed).
Unpublished books open only for their owner, for editors and admins, and for
anyone holding the share token; everyone else gets a 404. The same rule covers
their pictures and recordings (see "Media access" below). A share link is
cleared when a book leaves the public library.

### From draft to library, many books at once

`/admin/pipeline` ("מסלול פרסום", editors and admins) lists every book that is
not both published and fully narrated, with what it lacks: the items of the
publication checklist (`publishProblems`, plus a source) and how many of its
text pages have a real narration. Tick books and:

- **קטגוריות וגיל** sets the age group and adds or replaces categories and
  themes (`POST /api/admin/books/bulk`, `action: "meta"`).
- **ניקוד והקראה** narrates the ticked books one after the other through the
  ordinary `POST /api/narration/<bookId>`. The run lives in the browser tab,
  shows the number of characters before it starts (the vendor charges by
  character), can be stopped, and can be run again: narrated pages are skipped.
  `npm run narrate -- --all` does the same from the command line and now reads
  `.env.local` itself.
- **פרסום** publishes the ticked books that pass the whole checklist
  (`action: "publish"`). Nothing is waived in bulk: a book with missing details
  is reported and left as it is. Narration is not required, but the dialog says
  how many of the books lack it.

The rules are in `src/app/admin/_lib/readiness.ts` and `bulk.ts`. The page
loads every book with its pages, which is fine for a few hundred local books
and would need a summary query in Supabase mode.

Studio saves are conditional: each one sends the `updatedAt` the tab last saw
(header `x-book-updated-at`), and the server answers 409 when the book changed
elsewhere, instead of overwriting it. Media files are deleted only by such a
conditional save.

Limits that apply to every book, whatever created it, are in
`src/lib/limits.ts` (60 pages, 3000 characters a page, 300 books an account).
Upload sizes are in `src/lib/importers/limits.ts` and `src/lib/studio/shared.ts`;
`experimental.proxyClientMaxBodySize` in `next.config.ts` must stay above the
largest of them, because Next.js cuts request bodies off at that size when a
proxy runs.

## Environment

Copy `.env.example` to `.env.local`. Every variable is optional. When a
service's variables are missing, a local or mock implementation is used, and
mock output is always labelled as such in the UI.

| Service | Variables | Without them |
|---|---|---|
| Data, auth, storage | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (required with the other two) | JSON files and media under `./data`, development login |
| Session | `AUTH_SECRET`, `ADMIN_EMAILS`, `ALLOW_DEV_LOGIN` | Random secret in `data/.auth-secret` (warning printed) |
| Story text, OCR | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5-5`) | One fixed sample story; OCR buttons hidden (no mock OCR) |
| Nikud | `NIKUD_PROVIDER=dicta`, `DICTA_API_URL` | Text returned unchanged, never stored as nikud |
| Narration | `TTS_PROVIDER=elevenlabs`, `TTS_API_KEY`, `TTS_VOICE` (required), `TTS_REGION`, `TTS_MODEL`, `TTS_OUTPUT_FORMAT`, `TTS_STRIP_NIKUD` | Silent audio, evenly spaced word timings, "demo voice" notice |
| Illustrations | `IMAGE_PROVIDER=gemini`, `IMAGE_API_KEY`, `IMAGE_MODEL` | Labelled SVG placeholder |
| Other | `NEXT_PUBLIC_SITE_URL`, `DATA_DIR`, `AI_WEEKLY_QUOTA`, `CRON_SECRET`, `NEXT_PUBLIC_ENABLE_SW`, `GITHUB_TOKEN` | Sensible defaults |
| Limits | `RATE_LIMIT_NARRATION_PER_HOUR` (30), `RATE_LIMIT_NIKUD_PER_HOUR` (400), `RATE_LIMIT_OCR_PER_HOUR` (150), `RATE_LIMIT_TRANSLATE_PER_HOUR` (60), `RATE_LIMIT_PDF_PER_HOUR` (60), `RATE_LIMIT_VIEWS_PER_HOUR` (120), `TTS_ALLOWED_VOICES` | The defaults in brackets; only `TTS_VOICE` may be requested |

**None of the real vendors has been called yet.** The Claude, ElevenLabs,
Gemini and Supabase code was written against the vendors' documentation and is
covered only by tests with stubbed responses; the Dicta provider was tried
with two short live calls. Expect to debug each one the first time a key is
set. Everything else in this README was exercised on the local/mock setup.

### Supabase setup (untested against a real project)

1. Apply every file in `supabase/migrations`, in name order. They remove
   direct browser writes to books, pages and storage (only the server, with
   the service-role key, writes book content) and make the three media buckets
   private (`20261013000400_private_media.sql`).
2. Set the three Supabase variables and `NEXT_PUBLIC_SITE_URL`.
3. In Supabase Auth, add `<site>/auth/callback` to the redirect allow list and
   enable the Google provider.
4. Optionally copy the local library in: `npx tsx supabase/import-local.ts`.
5. Keep **"Confirm email" enabled** in Supabase Auth. An address in
   `ADMIN_EMAILS` is promoted to admin only when the auth server reports it as
   confirmed, and with confirmation switched off Supabase marks every new
   sign-up as confirmed without checking, so anyone could register an admin's
   address before the admin does.

Sign-in is then at `/auth/sign-in` (email magic link or Google); `src/proxy.ts`
refreshes the session and redirects `/login` there.

## Free books and translation

Book Dash publishes picture books under CC BY 4.0 in the GitHub repository
`bookdash/bookdash-books`. `npm run import:bookdash` (or `/admin/import`, for
editors and admins) downloads a book's text and its text-free illustrations and
creates a **draft in English**: `language: "en"`, the English text in both
`text` and `originalText`, the illustration descriptions in `imageAlt`, and the
credit in `credits` (publisher, link, logo, attribution line). A book is found
again by its Book Dash slug (id `bookdash-<slug>`) and is skipped on a second
import unless `--force`, which replaces it together with its translation.
`GITHUB_TOKEN` is optional; it only raises GitHub's limit for the catalogue
listing.

- **Credits are incomplete on purpose.** The repository names the people behind
  a book as one list ("creator: A, B, C") without roles, so the importer stores
  that list in `credits.creators` and leaves author, illustrator, designer and
  editor empty rather than guess. The studio and `/admin/import` flag such a
  book. `npm run bookdash:credits` reads the roles from the book's page on
  bookdash.org and fills the empty fields. A book without an author cannot be
  submitted.
- **Translation.** In the studio a book whose original language is not Hebrew
  gets a "תרגום" tab: one button translates the whole book in a single Claude
  call (`src/lib/translation`), and every page shows the original next to the
  editable Hebrew. Without `ANTHROPIC_API_KEY` nothing is translated and the
  text is not touched; the Hebrew can be typed by hand and accepted. Nikud and
  narration run afterwards as for any book.
- **Hebrew only in the library.** A book whose `language` is not `he` cannot be
  submitted or approved, and a translated book needs a translator credit.
- **Credit display.** `<BookCredits>` (book page, end of reading, share page)
  and the last sheet of the print view and the PDF show the makers, the
  translator, the attribution line, the license linked to its Creative Commons
  deed, and the publisher with link and logo.
- **Other sources (StoryWeaver).** There is no scraper. Use `/studio/import`
  with "Creative Commons book"; the form takes the same credit fields.

## Architecture

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS v4. Cache
Components are turned off; pages read live data on every request.

- **A book is data.** `src/lib/types.ts` defines `Book` and `Page` (Zod
  schemas). Manual, imported and AI-generated books share this shape, so one
  reader shows them all.
- **`src/lib/repo`**: the `Repository` interface and `getRepo()`. Local JSON
  (`data/books/<slug>/book.json`) by default, Supabase when configured.
- **`src/lib/media`**: `MediaStore` and `getMediaStore()`. Files live under
  `data/media` and are served by `/media/[...path]` (range requests, strict
  path validation, access check). Books store media *paths*; `mediaUrl()`
  turns them into URLs.
- **`src/lib/auth`**: `getCurrentUser()`, `requireUser()`, `requireRole()`,
  `canViewBook()`, `canEditBook()`. Local mode is a password-less development
  login with an HMAC-signed cookie.
- **`src/lib/ai`**: four provider interfaces (text, nikud, TTS, image) with
  mocks; real vendors live in `src/lib/ai/providers/*`.
- **`src/components/reader`**: `BookPlayer`, the one reading player. The
  reader page, the studio preview and share links all use it;
  `/offline/read` has its own smaller reader that works without the network.
- **`src/lib/narration`**: text → nikud → speech → stored audio and word
  timings, run once per page.
- **`src/lib/generation`**: the AI story pipeline (outline, pages, second-pass
  review, character sheet, illustrations, narration), quota and daily story.
- **`src/lib/book-package.ts`**: a book as a zip (`book.json`, `images/`,
  `audio/`), for export and import.
- **`src/lib/pdf`**: the printable PDF, with its own Hebrew shaping and bidi.
- **`src/lib/routes.ts`**: every URL of the site. Build links with it.
- **`src/components/ui`**: shared primitives. Colors come from CSS variables
  in `src/app/globals.css` (day theme and a dark bedtime theme).
- **`scripts/seed.ts`**: the sample stories and their hand-built SVG
  illustrations.

User-facing text is Hebrew; code, identifiers and comments are English.

## Media access

Files of a book live under `books/<bookId>/` and follow the book
(`src/lib/media/access.ts`, enforced by the `/media` route in both storage
modes):

- **Published book**: anyone, with a public, revalidated cache header.
- **Any other status**: the owner, editors and admins (by session cookie), or
  a request that carries the book's share token as `?t=<token>`. The response
  is `Cache-Control: private, no-store`. Everyone else gets the same 404 as for
  a missing file, so knowing or guessing a path is not enough, and revoking the
  share link stops the files as well as the text.
- **No such book** (files of a generation or import that is still running):
  staff only.
- Files outside `books/` (the seeded library under `seed-<name>/`) are site
  content and always public.

Pages opened through a share link pass the token to `mediaUrl(path, version,
token)`: the reader, the print page and the share page. The offline download
adds the token to its own requests and stores each file under its plain
address, so the token is not kept in the saved book. The PDF and the zip
export read files on the server and need no token.

Local mode is covered by route-level tests (`src/lib/media/access.test.ts`).

**Supabase mode: written, not tested against a real project.** Migration
`20261013000400_private_media.sql` makes the three buckets private. The
`/media` route makes the same decision as in local mode and then redirects to
a signed URL from the storage API: valid 10 minutes for a private file, and 1
hour for a public one (those are reused in memory, and the redirect itself may
be cached for 5 minutes). What is open or unverified:

- Nothing here has run against Supabase: the migration, `createSignedUrl`,
  byte ranges through the redirect, and the offline download, which follows
  the redirect to the storage origin and therefore needs that origin to allow
  cross-origin reads.
- `src/proxy.ts` does not run for `/media` requests. An owner whose access
  token expired while a page was open relies on the route's own Supabase
  client to refresh the session; that path is untested.
- A signed URL that was already handed out keeps working until it expires: up
  to 10 minutes after a share link is revoked, and up to 1 hour after a book is
  unpublished. Book status is also cached for 5 seconds per server process.
- Until the migration is applied the buckets stay public, and the storage URLs
  can be fetched directly around the check.
- A device that downloaded a book for offline reading keeps its copy after the
  link is revoked.

## Known gaps

- **Media access in Supabase mode is untested.** See "Media access" below for
  what the code does and what stays open.
- **Rate limits are per process.** `src/lib/rate-limit.ts` counts requests in
  the memory of one server process (per user; per IP address for anonymous
  routes) on narration, nikud, OCR, translation, PDF and the view counter. The
  counters reset on restart, and with several instances (serverless, more than
  one container) every instance counts separately, so the real limit is the
  configured one times the number of instances. That is not enough for a
  multi-instance deployment: it needs a shared store (Redis or a table) or
  limits at the gateway or the vendor. The limits count requests, not
  characters or tokens, so they cap how often a paid call is made, not what one
  call costs. IP addresses come from `X-Forwarded-For`, which only a trusted
  reverse proxy makes reliable; without that header all anonymous callers share
  one counter.
- **Concurrent saves across instances.** The check "is this still the version
  the tab saw?" and the write that follows are serialised by an in-process
  lock per book (`src/lib/book-lock.ts`). Two server instances can still both
  pass the check within the same few milliseconds; closing that needs a
  conditional update in the database.
- A generation job that dies before its book is saved leaves the illustrations
  it already stored under `books/<id>/` (the id is not on the job yet). They
  are not public (no book, so only staff can fetch them) but nothing deletes
  them.
- Two upload sniffers remain (`src/lib/studio/upload.ts` for studio uploads,
  `src/lib/importers/media-sniff.ts` for imports). They now agree on SVG: it
  is refused for anything a user picks, and accepted only inside a book
  package when it contains nothing that can run code.
- A per-book soundtrack and "regenerate one illustration" from PLAN.md are not
  built. The translation flow has only run against stubbed model answers.
- AI jobs run inside the web process (`after()`); there is no durable queue.
  A job that stops reporting for ten minutes is closed: as done when its book
  was already saved (it then counts against the quota), otherwise as failed.
- There are two share endpoints (`/api/studio/books/[id]/share`, used by the
  studio, and `/api/share/[bookId]`, used by `/me`); they return the same token.
- No TTS vendor comparison was done and no default voice chosen.

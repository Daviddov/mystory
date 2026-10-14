/**
 * Serves files from the media store: GET/HEAD /media/<media path>[?v=..][&t=<share token>].
 * Supports single byte ranges (needed for audio seeking), ETag revalidation,
 * and rejects any path that is not a valid media path.
 *
 * Access follows the book the file belongs to (see @/lib/media/access):
 * media of a published book is public and cacheable; media of any other book
 * is served only to its owner, to editors and admins, or to a request that
 * carries the book's share token, and then with `Cache-Control: private,
 * no-store`. Everyone else gets the same 404 as for a missing file.
 *
 * Supabase mode: the buckets are private, so an authorised request is
 * redirected to a signed URL that expires (untested against a real project).
 */
import { getCurrentUser } from "@/lib/auth";
import { getMediaStore, isValidMediaPath, type MediaStore } from "@/lib/media";
import { bookAccessLoader, decideMediaAccess, MEDIA_TOKEN_PARAM, type MediaAccess } from "@/lib/media/access";
import { getRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  // Uploaded SVG files must never run scripts when opened directly.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const PUBLIC_CACHE = "public, max-age=0, must-revalidate";
const PRIVATE_CACHE = "private, no-store";

/** Lifetime of a signed URL of a public file, and how long browsers may reuse the redirect to it. */
const PUBLIC_SIGNED_SECONDS = 60 * 60;
const PUBLIC_REDIRECT_MAX_AGE = 5 * 60;
/**
 * Lifetime of a signed URL of a private file: long enough to play one page's
 * audio, short enough that a revoked share link stops working soon.
 */
const PRIVATE_SIGNED_SECONDS = 10 * 60;

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

interface SignedCacheGlobal {
  __mystorySignedMedia?: Map<string, { url: string; expiresAt: number }>;
}
const signedGlobal = globalThis as unknown as SignedCacheGlobal;

/** Signed URLs of PUBLIC files are reused until shortly before they expire, to save a storage API call per image. */
async function publicSignedUrl(store: MediaStore, mediaPath: string): Promise<string | null> {
  const cache = (signedGlobal.__mystorySignedMedia ??= new Map());
  const now = Date.now();
  const hit = cache.get(mediaPath);
  // Reuse only while the URL outlives the redirect's own cache lifetime with room to spare.
  if (hit && hit.expiresAt - now > (PUBLIC_REDIRECT_MAX_AGE + 5 * 60) * 1000) return hit.url;
  const url = await store.signedUrl!(mediaPath, PUBLIC_SIGNED_SECONDS);
  if (!url) {
    cache.delete(mediaPath);
    return null;
  }
  if (cache.size >= 5000) cache.clear();
  cache.set(mediaPath, { url, expiresAt: now + PUBLIC_SIGNED_SECONDS * 1000 });
  return url;
}

/** Remote store: redirect an authorised request to the file itself. */
async function redirectToStore(store: MediaStore, mediaPath: string, access: MediaAccess, request: Request): Promise<Response> {
  if (!store.signedUrl) {
    // A remote store without signing can only offer its own public URL.
    return Response.redirect(new URL(store.url(mediaPath), request.url), 302);
  }
  const target =
    access === "public" ? await publicSignedUrl(store, mediaPath) : await store.signedUrl(mediaPath, PRIVATE_SIGNED_SECONDS);
  if (!target) return notFound();
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": access === "public" ? `public, max-age=${PUBLIC_REDIRECT_MAX_AGE}` : PRIVATE_CACHE,
      "Referrer-Policy": "no-referrer",
    },
  });
}

interface ByteRange {
  start: number;
  end: number;
}

/** Parses "bytes=a-b", "bytes=a-" and "bytes=-n". Returns "invalid" when unsatisfiable. */
function parseRange(header: string, size: number): ByteRange | "invalid" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null; // unsupported form (e.g. multiple ranges): send the whole file
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return "invalid";
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (suffix <= 0 || size === 0) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

async function serve(request: Request, segments: string[], headOnly: boolean): Promise<Response> {
  // Next.js gives us decoded segments; anything outside the strict media path
  // alphabet (including "..", backslashes and encoded separators) is rejected.
  const mediaPath = segments.join("/");
  if (!isValidMediaPath(mediaPath)) return notFound();

  // Who may have this file? Denied and missing look the same on purpose.
  const repo = await getRepo();
  const access = await decideMediaAccess({
    mediaPath,
    token: new URL(request.url).searchParams.get(MEDIA_TOKEN_PARAM),
    getBook: bookAccessLoader(repo),
    getRecording: (id) => repo.getRecording(id),
    // A session that cannot be read is an anonymous visitor, never an error page with details.
    getUser: async () => {
      try {
        return await getCurrentUser();
      } catch {
        return null;
      }
    },
  });
  if (access === "denied") return notFound();

  const store = await getMediaStore();
  if (store.kind !== "local") return redirectToStore(store, mediaPath, access, request);

  const object = await store.get(mediaPath);
  if (!object) return notFound();

  const isPublic = access === "public";
  const etag = `"${object.size.toString(16)}-${Math.floor(object.mtimeMs ?? 0).toString(16)}"`;
  const headers = new Headers({
    ...SECURITY_HEADERS,
    "Content-Type": object.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": isPublic ? PUBLIC_CACHE : PRIVATE_CACHE,
  });
  if (isPublic) {
    headers.set("ETag", etag);
    if (object.mtimeMs) headers.set("Last-Modified", new Date(object.mtimeMs).toUTCString());
  } else {
    // The address may carry a share token: keep it out of Referer headers.
    headers.set("Referrer-Policy", "no-referrer");
  }

  if (isPublic && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader, object.size) : null;
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }

  if (range) {
    const length = range.end - range.start + 1;
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
    headers.set("Content-Length", String(length));
    const body = headOnly ? null : (object.bytes.slice(range.start, range.end + 1) as BodyInit);
    return new Response(body, { status: 206, headers });
  }

  headers.set("Content-Length", String(object.size));
  return new Response(headOnly ? null : (object.bytes.slice() as BodyInit), { status: 200, headers });
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  return serve(request, (await context.params).path, false);
}

export async function HEAD(request: Request, context: Context): Promise<Response> {
  return serve(request, (await context.params).path, true);
}

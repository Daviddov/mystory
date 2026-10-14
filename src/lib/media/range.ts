/**
 * HTTP byte ranges for the /media route. Audio seeking needs them, and Safari
 * (macOS and iOS) refuses to play a <video> whose server does not answer a
 * "Range: bytes=0-1" probe with 206 Partial Content.
 */

export interface ByteRange {
  /** First byte, inclusive. */
  start: number;
  /** Last byte, inclusive. */
  end: number;
}

/**
 * Parses "bytes=a-b", "bytes=a-" and "bytes=-n" against a file of `size` bytes.
 * Returns null for a form this server does not support (several ranges, other
 * units): the caller then sends the whole file, which HTTP allows. Returns
 * "invalid" when the range cannot be satisfied (answer 416).
 */
export function parseByteRange(header: string, size: number): ByteRange | "invalid" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
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

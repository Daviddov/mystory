/**
 * The optional child photo, held in memory for one use.
 *
 * Privacy is enforced by structure, not by convention:
 *  - The bytes live in a private class field. They are not an enumerable
 *    property, so JSON.stringify, structuredClone, object spread, console.log
 *    and util.inspect cannot reach them (toJSON / inspect return a marker).
 *  - This module imports nothing: it has no filesystem, network, repository or
 *    logging access, and it exposes no way to copy the bytes out.
 *  - The only reader is `useOnce`. It lends the bytes to one callback and then
 *    overwrites them with zeros, whether the callback succeeds or throws.
 *    A second call gets nothing.
 *  - WizardInput (the part of a request that is stored on a job) has no photo
 *    field and its schema is strict, so a photo cannot ride along with it.
 *
 * The pipeline passes the lent bytes to exactly one place: the text model's
 * vision call that turns the photo into a written, non-identifying appearance
 * description. The photo is never given to the image model or the media store.
 */

const SIGNATURES: { contentType: string; test: (b: Uint8Array) => boolean }[] = [
  { contentType: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    contentType: "image/png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    contentType: "image/webp",
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, // WEBP
  },
];

/** Content type according to the file signature, or null when it is not a supported image. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  return SIGNATURES.find((s) => s.test(bytes))?.contentType ?? null;
}

export interface LentPhoto {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

const REDACTED = "[child photo: in memory only]";

export class EphemeralPhoto {
  #bytes: Uint8Array | null;
  readonly #contentType: string;

  private constructor(bytes: Uint8Array, contentType: string) {
    this.#bytes = bytes;
    this.#contentType = contentType;
  }

  /**
   * Takes ownership of `bytes` (the caller must not keep using the array).
   * Returns null when the bytes are not a JPEG, PNG or WebP image.
   */
  static from(bytes: Uint8Array): EphemeralPhoto | null {
    const contentType = sniffImageType(bytes);
    return contentType ? new EphemeralPhoto(bytes, contentType) : null;
  }

  /** True until the photo has been used or discarded. */
  get available(): boolean {
    return this.#bytes !== null;
  }

  /**
   * Lends the photo to `fn` once, then destroys it. Returns undefined without
   * calling `fn` when the photo was already used.
   */
  async useOnce<T>(fn: (photo: LentPhoto) => Promise<T>): Promise<T | undefined> {
    const bytes = this.#bytes;
    if (!bytes) return undefined;
    this.#bytes = null;
    try {
      return await fn({ bytes, contentType: this.#contentType });
    } finally {
      bytes.fill(0);
    }
  }

  /** Destroys the photo without using it. Safe to call more than once. */
  discard(): void {
    this.#bytes?.fill(0);
    this.#bytes = null;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}

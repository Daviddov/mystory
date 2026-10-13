/**
 * Detects the real type of an uploaded file from its first bytes. The browser's
 * declared content type and the file name are never trusted. Pure and client-safe.
 */

export interface SniffedMedia {
  kind: "image" | "audio";
  contentType: string;
  /** File extension without the dot. The local media store serves by extension. */
  ext: string;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (bytes.length < start + length) return "";
  let out = "";
  for (let i = start; i < start + length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, i) => bytes[i] === value);
}

const AVIF_BRANDS = new Set(["avif", "avis"]);
const AUDIO_MP4_BRANDS = new Set(["M4A ", "M4B ", "mp41", "mp42", "isom", "iso2", "iso5", "iso6", "dash", "3gp4", "3gp5"]);

/**
 * Returns the detected type, or null when the bytes are not one of the
 * accepted formats: PNG, JPEG, GIF, WebP, AVIF; MP3, WAV, Ogg, WebM, MP4/M4A, AAC (ADTS).
 * SVG is deliberately not accepted for uploads.
 */
export function sniffMedia(bytes: Uint8Array): SniffedMedia | null {
  if (bytes.length < 12) return null;

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { kind: "image", contentType: "image/png", ext: "png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { kind: "image", contentType: "image/jpeg", ext: "jpg" };
  const head6 = ascii(bytes, 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a") return { kind: "image", contentType: "image/gif", ext: "gif" };

  if (ascii(bytes, 0, 4) === "RIFF") {
    const form = ascii(bytes, 8, 4);
    if (form === "WEBP") return { kind: "image", contentType: "image/webp", ext: "webp" };
    if (form === "WAVE") return { kind: "audio", contentType: "audio/wav", ext: "wav" };
    return null;
  }

  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (AVIF_BRANDS.has(brand)) return { kind: "image", contentType: "image/avif", ext: "avif" };
    if (AUDIO_MP4_BRANDS.has(brand)) return { kind: "audio", contentType: "audio/mp4", ext: "m4a" };
    return null;
  }

  if (ascii(bytes, 0, 4) === "OggS") return { kind: "audio", contentType: "audio/ogg", ext: "ogg" };
  // EBML header: WebM (what MediaRecorder produces in Chrome and Firefox).
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: "audio", contentType: "audio/webm", ext: "webm" };
  if (ascii(bytes, 0, 3) === "ID3") return { kind: "audio", contentType: "audio/mpeg", ext: "mp3" };

  // Raw MPEG audio frame sync: 11 set bits, then version and layer.
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    const layer = (bytes[1] >> 1) & 0x03;
    const version = (bytes[1] >> 3) & 0x03;
    if (version === 1) return null; // reserved
    if (layer === 0) {
      // ADTS AAC uses layer bits 00 with a 12-bit sync word.
      return (bytes[1] & 0xf0) === 0xf0 ? { kind: "audio", contentType: "audio/aac", ext: "aac" } : null;
    }
    return { kind: "audio", contentType: "audio/mpeg", ext: "mp3" };
  }
  return null;
}

/**
 * Content sniffing for uploaded media. A file is accepted only when its bytes
 * match the type its extension claims, so a renamed executable or HTML file
 * cannot be stored as "page.png". Client-safe (no Node imports).
 */
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, fileExtension } from "./limits";

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, i) => bytes[offset + i] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < Math.min(bytes.length, start + length); i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096)).replace(/^﻿/, "");
  const trimmed = head.trimStart();
  if (!/^(<\?xml|<!--|<!DOCTYPE\s+svg|<svg[\s>])/i.test(trimmed)) return false;
  return /<svg[\s>]/i.test(head);
}

/**
 * True when an SVG contains nothing that can run or load code: no script,
 * no event handler attribute, no javascript: URL, no embedded HTML or plugin.
 * SVG is text, so the whole file is checked, not only its head.
 */
export function isInertSvg(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (/<\s*(script|foreignObject|iframe|embed|object|set|animate)\b/i.test(text)) return false;
  if (/[\s"'/]on[a-z]+\s*=/i.test(text)) return false;
  if (/(javascript|vbscript)\s*:/i.test(text)) return false;
  if (/<!ENTITY/i.test(text)) return false;
  return true;
}

export interface DetectImageOptions {
  /**
   * SVG is a document format that can carry scripts. Uploads a user picks
   * (studio, pages import) pass `false` and never accept it. A book package
   * may contain the site's own placeholder art, so it passes `true` and the
   * file must then also be inert (isInertSvg). Default: true, for callers that
   * only identify a type.
   */
  allowSvg?: boolean;
}

/** Content type of an image recognised from its bytes, or null. */
export function detectImageType(bytes: Uint8Array, options: DetectImageOptions = {}): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 4) === "ftyp" && /^(avif|avis)$/.test(ascii(bytes, 8, 4))) return "image/avif";
  if (options.allowSvg !== false && looksLikeSvg(bytes)) return "image/svg+xml";
  return null;
}

/** Content type of an audio file recognised from its bytes, or null. */
export function detectAudioType(bytes: Uint8Array): string | null {
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "audio/wav";
  if (ascii(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(bytes, 0, 3) === "ID3") return "audio/mpeg";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (ascii(bytes, 4, 4) === "ftyp") return "audio/mp4";
  if (ascii(bytes, 0, 4) === "ADIF") return "audio/aac";
  if (bytes.length >= 2 && bytes[0] === 0xff) {
    // ADTS AAC: 12 sync bits, layer 00. MPEG audio: 11 sync bits, layer != 00.
    if ((bytes[1] & 0xf6) === 0xf0) return "audio/aac";
    if ((bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0) return "audio/mpeg";
  }
  return null;
}

export type MediaKind = "image" | "audio";

export interface MediaCheck {
  ok: boolean;
  /** Content type to store the file with (from the extension) when ok. */
  contentType?: string;
  /** Why the file was refused. */
  reason?: "extension" | "content";
}

/**
 * Checks the extension against the allow-list of `kind` and the bytes against
 * the extension.
 */
export function checkMediaFile(kind: MediaKind, fileName: string, bytes: Uint8Array): MediaCheck {
  const expected = (kind === "image" ? IMAGE_EXTENSIONS : AUDIO_EXTENSIONS)[fileExtension(fileName)];
  if (!expected) return { ok: false, reason: "extension" };
  const detected = kind === "image" ? detectImageType(bytes) : detectAudioType(bytes);
  if (detected !== expected) return { ok: false, reason: "content" };
  // An SVG that could run code is refused wherever it comes from.
  if (detected === "image/svg+xml" && !isInertSvg(bytes)) return { ok: false, reason: "content" };
  return { ok: true, contentType: expected };
}

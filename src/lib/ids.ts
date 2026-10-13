import { customAlphabet } from "nanoid";

const idAlphabet = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);
const tokenAlphabet = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  24,
);

/** New opaque id such as "bk_4f9k2m1x8a0q". Lowercase, safe in paths, URLs and slugs. */
export function newId(prefix?: string): string {
  return prefix ? `${prefix}_${idAlphabet()}` : idAlphabet();
}

/** Unguessable token for public share links. */
export function newShareToken(): string {
  return tokenAlphabet();
}

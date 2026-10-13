/**
 * WOFF 1.0 -> SFNT (TrueType / OpenType) conversion.
 *
 * The Hebrew fonts ship in node_modules as WOFF files (@fontsource). A PDF can
 * only embed a bare SFNT font program, so the zlib-compressed tables are
 * unpacked and written back out as a plain .ttf byte array.
 */
import { inflateSync } from "node:zlib";

const WOFF_HEADER_SIZE = 44;
const WOFF_ENTRY_SIZE = 20;
const SFNT_HEADER_SIZE = 12;
const SFNT_ENTRY_SIZE = 16;

export class InvalidFontError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFontError";
  }
}

/** True when the bytes start with the "wOFF" signature. */
export function isWoff(bytes: Uint8Array): boolean {
  return (
    bytes.length >= WOFF_HEADER_SIZE &&
    bytes[0] === 0x77 &&
    bytes[1] === 0x4f &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  );
}

const pad4 = (n: number): number => (n + 3) & ~3;

/** Returns the uncompressed SFNT font. Bytes that are not WOFF are returned unchanged. */
export function woffToSfnt(bytes: Uint8Array): Uint8Array {
  if (!isWoff(bytes)) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flavor = view.getUint32(4);
  const numTables = view.getUint16(12);
  if (numTables === 0 || WOFF_HEADER_SIZE + numTables * WOFF_ENTRY_SIZE > bytes.length) {
    throw new InvalidFontError("corrupt WOFF table directory");
  }

  const tables: { tag: number; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < numTables; i++) {
    const at = WOFF_HEADER_SIZE + i * WOFF_ENTRY_SIZE;
    const tag = view.getUint32(at);
    const offset = view.getUint32(at + 4);
    const compLength = view.getUint32(at + 8);
    const origLength = view.getUint32(at + 12);
    const checksum = view.getUint32(at + 16);
    if (offset + compLength > bytes.length) throw new InvalidFontError("corrupt WOFF table");
    const raw = bytes.subarray(offset, offset + compLength);
    let data: Uint8Array;
    try {
      data = compLength < origLength ? new Uint8Array(inflateSync(raw)) : raw;
    } catch {
      throw new InvalidFontError("corrupt WOFF table data");
    }
    if (data.length !== origLength) throw new InvalidFontError("corrupt WOFF table data");
    tables.push({ tag, checksum, data });
  }
  // The SFNT directory must be sorted by tag.
  tables.sort((a, b) => a.tag - b.tag);

  let size = SFNT_HEADER_SIZE + numTables * SFNT_ENTRY_SIZE;
  for (const table of tables) size += pad4(table.data.length);

  const out = new Uint8Array(size);
  const outView = new DataView(out.buffer);
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  outView.setUint32(0, flavor);
  outView.setUint16(4, numTables);
  outView.setUint16(6, searchRange);
  outView.setUint16(8, entrySelector);
  outView.setUint16(10, numTables * 16 - searchRange);

  let offset = SFNT_HEADER_SIZE + numTables * SFNT_ENTRY_SIZE;
  tables.forEach((table, i) => {
    const at = SFNT_HEADER_SIZE + i * SFNT_ENTRY_SIZE;
    outView.setUint32(at, table.tag);
    outView.setUint32(at + 4, table.checksum);
    outView.setUint32(at + 8, offset);
    outView.setUint32(at + 12, table.data.length);
    out.set(table.data, offset);
    offset += pad4(table.data.length);
  });
  return out;
}

/**
 * Mock providers used when no API keys are configured. They never pretend to
 * be the real thing: every result has isMock = true, the audio is silence and
 * the illustration is a labelled placeholder.
 */
import { splitWords } from "../hebrew";
import type { WordTiming } from "../types";
import {
  GeneratedStorySchema,
  type GeneratedStory,
  type ImageProvider,
  type ImageRequest,
  type NikudProvider,
  type TextProvider,
  type TextRequest,
  type TtsProvider,
  type VideoProvider,
} from "./types";

// --- Text -----------------------------------------------------------------------

export const MOCK_STORY: GeneratedStory = {
  title: "העפיפון של נועם (סיפור לדוגמה)",
  summary:
    "סיפור לדוגמה שמוחזר כשאין מפתח לשירות הטקסט. נועם בונה עפיפון, הרוח לא באה, והוא מגלה מה עושים בינתיים.",
  pages: [
    {
      text: "נועם בנה עפיפון אדום עם זנב ארוך. הוא רץ איתו אל הגבעה שמאחורי הבית.",
      illustrationPrompt: "A child holding a red kite with a long tail, running up a green hill behind a house",
    },
    {
      text: "אבל הרוח לא באה. העפיפון שכב על הדשא כמו דג עייף.",
      illustrationPrompt: "The red kite lying on the grass, the child looking at a still sky",
    },
    {
      text: "נועם חיכה. הוא ספר עננים, ואחר כך נמלים, ואחר כך את האצבעות שלו.",
      illustrationPrompt: "The child lying on the hill counting clouds, ants walking nearby",
    },
    {
      text: "פתאום העשב התחיל לזוז. עלה אחד התגלגל. הרוח הגיעה!",
      illustrationPrompt: "Grass bending in the wind, a leaf rolling, the child jumping up",
    },
    {
      text: "העפיפון עלה גבוה גבוה, ונועם צחק. לפעמים צריך רק לחכות קצת.",
      illustrationPrompt: "The red kite high in a blue sky, the child laughing and holding the string",
    },
  ],
  discussionQuestions: ["מה נועם עשה בזמן שחיכה לרוח?", "למה קשה לפעמים לחכות?"],
  categories: ["nature", "values"],
  themes: ["patience"],
  tags: ["רוח", "עפיפון"],
};

export const mockTextProvider: TextProvider = {
  name: "mock",
  isMock: true,
  async generate<T>(request: TextRequest<T>) {
    if (request.mockData !== undefined) {
      return { data: request.schema.parse(request.mockData), isMock: true };
    }
    const parsed = request.schema.safeParse(MOCK_STORY);
    if (!parsed.success) {
      throw new Error(
        "The mock text provider can only return GeneratedStorySchema data. " +
          "Pass `mockData` in the request for any other schema.",
      );
    }
    return { data: parsed.data, isMock: true };
  },
};

// Keep the fixed story honest: it must always satisfy the canonical schema.
GeneratedStorySchema.parse(MOCK_STORY);

// --- Nikud ----------------------------------------------------------------------

export const mockNikudProvider: NikudProvider = {
  name: "mock",
  isMock: true,
  async addNikud(text: string) {
    return { text, isMock: true };
  },
};

// --- TTS --------------------------------------------------------------------------

const MOCK_SAMPLE_RATE = 8000;
export const MOCK_SECONDS_PER_WORD = 0.4;

/** A valid 8-bit mono PCM WAV file containing silence. */
export function silentWav(durationSeconds: number, sampleRate: number = MOCK_SAMPLE_RATE): Uint8Array {
  const samples = Math.max(1, Math.round(durationSeconds * sampleRate));
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate (1 byte per sample)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128); // 8-bit PCM silence
  return new Uint8Array(buffer);
}

/** Evenly spaced timings, one per splitWords(text) token. */
export function evenWordTimings(text: string, secondsPerWord: number = MOCK_SECONDS_PER_WORD): WordTiming[] {
  return splitWords(text).map((word, i) => ({
    word,
    start: Number((i * secondsPerWord).toFixed(3)),
    end: Number(((i + 1) * secondsPerWord).toFixed(3)),
  }));
}

export const mockTtsProvider: TtsProvider = {
  name: "mock",
  isMock: true,
  async synthesize(text, options) {
    const speed = options?.speed && options.speed > 0 ? options.speed : 1;
    const wordTimings = evenWordTimings(text, MOCK_SECONDS_PER_WORD / speed);
    const durationSeconds = Math.max(0.5, wordTimings.at(-1)?.end ?? 0);
    return {
      audio: silentWav(durationSeconds),
      contentType: "audio/wav",
      wordTimings,
      durationSeconds,
      isMock: true,
    };
  },
};

// --- Images -------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function wrapCaption(caption: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of caption.split(/\s+/).filter(Boolean)) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

const MOCK_PALETTES = [
  { sky: "#FFE8C2", sky2: "#FFD0A8", hill: "#9BD3A0", hill2: "#6FBF8B", sun: "#FFB347" },
  { sky: "#D7ECFF", sky2: "#BBDDF7", hill: "#A8DDB5", hill2: "#7CC6A0", sun: "#FFD45E" },
  { sky: "#F3E1FF", sky2: "#E0C9F7", hill: "#B9E0C4", hill2: "#8FCBAA", sun: "#FF9E8A" },
  { sky: "#FFF2CC", sky2: "#FFE19A", hill: "#B5DFA1", hill2: "#86C98A", sun: "#FF8C6B" },
];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

/** A friendly landscape placeholder with the scene caption and a visible "sample illustration" badge. */
export function mockIllustrationSvg(request: Pick<ImageRequest, "prompt" | "caption" | "style" | "aspect">): string {
  const [width, height] =
    request.aspect === "1:1" ? [800, 800] : request.aspect === "3:4" ? [600, 800] : [800, 600];
  const caption = (request.caption ?? request.prompt).trim();
  const palette = MOCK_PALETTES[hash(caption + request.style) % MOCK_PALETTES.length];
  const lines = wrapCaption(caption, width >= 800 ? 34 : 26, 3);
  const boxHeight = 44 + lines.length * 38;
  const boxY = height - boxHeight - 28;
  const text = lines
    .map(
      (line, i) =>
        `<text x="${width / 2}" y="${boxY + 50 + i * 38}" text-anchor="middle" direction="rtl" font-family="Rubik, 'Segoe UI', 'Arial Hebrew', Arial, Tahoma, sans-serif" font-size="28" fill="#4A3B2A">${escapeXml(line)}</text>`,
    )
    .join("");
  const sunX = 120 + (hash(caption) % (width - 240));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(`איור לדוגמה: ${caption}`)}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${palette.sky}"/><stop offset="1" stop-color="${palette.sky2}"/></linearGradient></defs>
<rect width="${width}" height="${height}" fill="url(#sky)"/>
<circle cx="${sunX}" cy="${height * 0.22}" r="54" fill="${palette.sun}" opacity="0.9"/>
<g fill="#FFFFFF" opacity="0.85"><ellipse cx="${width * 0.24}" cy="${height * 0.2}" rx="70" ry="24"/><ellipse cx="${width * 0.31}" cy="${height * 0.17}" rx="46" ry="22"/><ellipse cx="${width * 0.74}" cy="${height * 0.3}" rx="64" ry="20"/></g>
<path d="M0 ${height * 0.68} Q ${width * 0.25} ${height * 0.5} ${width * 0.5} ${height * 0.66} T ${width} ${height * 0.6} V ${height} H 0 Z" fill="${palette.hill}"/>
<path d="M0 ${height * 0.8} Q ${width * 0.3} ${height * 0.66} ${width * 0.6} ${height * 0.8} T ${width} ${height * 0.76} V ${height} H 0 Z" fill="${palette.hill2}"/>
<rect x="40" y="${boxY}" width="${width - 80}" height="${boxHeight}" rx="24" fill="#FFFDF7" opacity="0.92"/>
${text}
<g><rect x="${width - 236}" y="20" width="216" height="44" rx="22" fill="#4A3B2A" opacity="0.85"/><text x="${width - 128}" y="50" text-anchor="middle" direction="rtl" font-family="Rubik, 'Segoe UI', 'Arial Hebrew', Arial, Tahoma, sans-serif" font-size="22" fill="#FFFDF7">איור לדוגמה</text></g>
</svg>`;
}

export const mockImageProvider: ImageProvider = {
  name: "mock",
  isMock: true,
  async generate(request) {
    return {
      image: new TextEncoder().encode(mockIllustrationSvg(request)),
      contentType: "image/svg+xml",
      isMock: true,
    };
  },
};

// --- Video ----------------------------------------------------------------------------

/**
 * A real, tiny H.264 MP4 (64x36, 2 s, 4 fps, one flat cream colour, no audio,
 * faststart), generated once with:
 *   ffmpeg -f lavfi -i "color=c=0xF3E9D2:s=64x36:r=4:d=2" -c:v libx264 -preset veryslow
 *          -crf 40 -pix_fmt yuv420p -profile:v baseline -movflags +faststart -an mock.mp4
 * Browsers play it, so the reader's video path can be exercised without a vendor.
 */
const MOCK_MP4_BASE64 =
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANGbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAnF0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAAAkAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHpbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABlG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAVRzdGJsAAAAvHN0c2QAAAAAAAAAAQAAAKxhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAJABIAAAASAAAAAAAAAABFUxhdmM2MS4zMy4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAMmF2Y0MBQsAK/+EAGWdCwAqmERH+fARAAAADAEAAAAMCA8SJhGABAAZoyEIDksgAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAALdAAAAAAAAAAYc3R0cwAAAAAAAAABAAAACAAAEAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAACAAAAAEAAAA0c3RzegAAAAAAAAAAAAAACAAAApMAAAAKAAAACgAAAAoAAAALAAAACwAAAAsAAAALAAAAFHN0Y28AAAAAAAAAAQAAA3YAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYxLjkuMTA3AAAACGZyZWUAAALlbWRhdAAAAnIGBf//btxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMyMDQgMzczNjk3YiAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjUgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0xNiBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgxOjB4MTMxIG1lPXVtaCBzdWJtZT0xMCBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTI0IGNocm9tYV9tZT0xIHRyZWxsaXM9MiA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49NCBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTYwIHJjPWNyZiBtYnRyZWU9MSBjcmY9NDAuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAABlliIICXiMUAARPo4AB2OAG+++uuuuuuuvAAAAABkGaHAS8bAAAAAZBmioBLxsAAAAGQZo7AS8bAAAAB0GaSQBLxsAAAAAHQZpZQEvGwAAAAAdBmmmAR8bAAAAAB0GaecBDxsA=";
export const MOCK_VIDEO_SECONDS = 2;

/** The bytes of the placeholder clip (a fresh copy on every call). */
export function mockVideoMp4(): Uint8Array {
  return new Uint8Array(Buffer.from(MOCK_MP4_BASE64, "base64"));
}

export const mockVideoProvider: VideoProvider = {
  name: "mock",
  isMock: true,
  async animate(_request, signal) {
    signal?.throwIfAborted();
    return { video: mockVideoMp4(), contentType: "video/mp4", durationSeconds: MOCK_VIDEO_SECONDS, isMock: true };
  },
};

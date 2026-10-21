/**
 * Records a book as a video in the browser: a canvas (illustration + subtitles)
 * and the narration, mixed through Web Audio, captured by MediaRecorder.
 * Client-only. The recording runs in real time.
 */

export interface VideoPage {
  text: string;
  /** Browser URL of the illustration. */
  image?: string;
  /** Browser URL of the narration. */
  audio?: string;
}

export interface CreateVideoOptions {
  title: string;
  cover?: string;
  pages: VideoPage[];
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export class VideoCancelledError extends Error {
  constructor() {
    super("video cancelled");
    this.name = "VideoCancelledError";
  }
}

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
/** Seconds a page stays when it has no narration, plus a little per word. */
const SILENT_BASE = 3;
const SILENT_PER_WORD = 0.45;
const TITLE_SECONDS = 3;
const FONT = '"Rubik", "Arial Hebrew", Arial, sans-serif';

const MIME_CANDIDATES: Array<{ mime: string; extension: string }> = [
  { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" },
  { mime: "video/mp4", extension: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", extension: "webm" },
  { mime: "video/webm;codecs=vp8,opus", extension: "webm" },
  { mime: "video/webm", extension: "webm" },
];

function pickFormat(): { mime: string; extension: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate.mime)) ?? null;
}

export function videoSupported(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  return (
    typeof canvas.captureStream === "function" &&
    typeof AudioContext !== "undefined" &&
    pickFormat() !== null
  );
}

function loadImage(src: string | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadAudio(ctx: AudioContext, src: string | undefined): Promise<AudioBuffer | null> {
  if (!src) return null;
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new VideoCancelledError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new VideoCancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawImageFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cover: boolean) {
  const scale = (cover ? Math.max : Math.min)(WIDTH / img.naturalWidth, HEIGHT / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

function drawFrame(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, text: string, titleCard = false) {
  ctx.fillStyle = "#1c1917";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (img) {
    // A blurred, enlarged copy fills the bars around a picture that is not 16:9.
    ctx.save();
    ctx.filter = "blur(28px) brightness(0.6)";
    drawImageFit(ctx, img, true);
    ctx.restore();
    drawImageFit(ctx, img, titleCard);
  }
  if (!text.trim()) return;

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = titleCard ? 72 : 38;
  ctx.font = `600 ${size}px ${FONT}`;
  const lines = wrapLines(ctx, text.trim(), WIDTH - 160);
  const lineHeight = size * 1.35;
  const boxHeight = lines.length * lineHeight + 36;
  const top = titleCard ? (HEIGHT - boxHeight) / 2 : HEIGHT - boxHeight - 24;
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.beginPath();
  ctx.roundRect(60, top, WIDTH - 120, boxHeight, 20);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, top + 18 + lineHeight * (i + 0.5)));
}

export async function createBookVideo(options: CreateVideoOptions): Promise<{ blob: Blob; extension: string }> {
  const { title, cover, pages, signal, onProgress } = options;
  const format = pickFormat();
  if (!format) throw new Error("recording is not supported");

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);

  const audioCtx = new AudioContext();
  const destination = audioCtx.createMediaStreamDestination();
  const stream = canvas.captureStream(FPS);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: format.mime,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 128_000,
  });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  // The current frame is redrawn on a timer, so the stream keeps producing frames while a page is held.
  let current: { img: HTMLImageElement | null; text: string; titleCard: boolean } = { img: null, text: "", titleCard: false };
  const redraw = () => drawFrame(ctx, current.img, current.text, current.titleCard);
  const ticker = setInterval(redraw, 1000 / FPS);
  let activeSource: AudioBufferSourceNode | null = null;

  try {
    await audioCtx.resume();
    const coverImage = await loadImage(cover);
    current = { img: coverImage, text: title, titleCard: true };
    redraw();
    recorder.start(1000);
    await sleep(TITLE_SECONDS * 1000, signal);

    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i]!;
      onProgress?.(i, pages.length);
      const [img, buffer] = await Promise.all([loadImage(page.image), loadAudio(audioCtx, page.audio)]);
      current = { img, text: page.text, titleCard: false };
      redraw();
      let seconds: number;
      if (buffer) {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(destination);
        source.start();
        activeSource = source;
        seconds = buffer.duration + 0.6;
      } else {
        seconds = SILENT_BASE + page.text.split(/\s+/).filter(Boolean).length * SILENT_PER_WORD;
      }
      await sleep(seconds * 1000, signal);
      activeSource = null;
    }

    current = { img: coverImage, text: "סוף", titleCard: true };
    redraw();
    await sleep(2000, signal);
    onProgress?.(pages.length, pages.length);
  } catch (err) {
    activeSource?.stop();
    throw err;
  } finally {
    clearInterval(ticker);
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    void audioCtx.close();
  }

  return { blob: new Blob(chunks, { type: format.mime.split(";")[0] }), extension: format.extension };
}

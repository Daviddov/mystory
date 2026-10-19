"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { ArrowRight, ClipboardPaste, Clock, Images, Lock, Plus, Sparkles, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Button, ButtonLink, Chip, Dialog, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CostContext } from "@/lib/generation/costs";
import { countWords, estimateReadingMinutes, hasNikud, stripNikud } from "@/lib/hebrew";
import { timingsMatchText } from "@/lib/narration/align";
import { routes } from "@/lib/routes";
import {
  acceptTranslation,
  createHeroImage,
  createShareLink,
  deleteBook,
  fetchBook,
  gridCapacity,
  fetchNarrationInfo,
  fetchVoiceSample,
  illustrateGrid,
  illustratePage,
  type GridLayout,
  type NarrationInfo,
  narrate,
  removeShareLink,
  requestNikud,
  setBookStatus,
  shrinkImage,
  StudioApiError,
  suggestBookDetails,
  translateBookToHebrew,
  uploadMedia,
  writeStoryPages,
} from "@/lib/studio/client";
import {
  IMAGE_ACCEPT,
  isBlankPage,
  MAX_PAGES,
  publishProblems,
  sortByFileName,
  splitStoryIntoPages,
  STATUS_LABELS,
  STATUS_TONES,
  type BookMetaPatch,
} from "@/lib/studio/shared";
import {
  describeFilled,
  detailsCompleteness,
  mergeCredits,
  mergeDetails,
  type AutoFilled,
  type FilledField,
} from "@/lib/studio/auto-details";
import { EXPECTED_SECONDS, toBusy, type BusyInput, type BusyState } from "@/lib/studio/progress";
import { readingTimeLabel } from "@/lib/taxonomy";
import type { BookHero, BookStatus, BookWithPages } from "@/lib/types";
import { BusyOverlay } from "./BusyOverlay";
import { HeroPanel } from "./HeroPanel";
import { MetaForm } from "./MetaForm";
import { NoticeToast } from "./NoticeToast";
import { PageEditor } from "./PageEditor";
import { PageList } from "./PageList";
import { PreviewPane } from "./PreviewPane";
import { PublishPanel } from "./PublishPanel";
import { SaveIndicator } from "./SaveIndicator";
import { StagesPanel, type NarrateAllOptions } from "./StagesPanel";
import { TranslationPanel } from "./TranslationPanel";
import {
  composeBook,
  newPageKey,
  pickInfo,
  pickMeta,
  toEditorPage,
  toServerPages,
  type EditorMeta,
  type EditorNotice,
  type EditorPage,
  type ServerInfo,
} from "./types";
import { useAutosave } from "./useAutosave";

type Tab = "stages" | "pages" | "translate" | "details" | "preview" | "publish";

/** Shown only for a book whose original language is not Hebrew. */
const TRANSLATE_TAB: { id: Tab; label: string } = { id: "translate", label: "תרגום" };

const TABS: { id: Tab; label: string }[] = [
  { id: "stages", label: "שלבי היצירה" },
  { id: "pages", label: "עמודים" },
  { id: "details", label: "פרטי הספר" },
  { id: "preview", label: "תצוגה מקדימה" },
  { id: "publish", label: "שיתוף ופרסום" },
];

interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => void;
  /** A second way to confirm (e.g. also replace the human recordings). */
  alt?: { label: string; run: () => void };
}

/** True when the page's audio belongs to its current text (a human recording always counts). */
function hasFreshAudio(page: EditorPage): boolean {
  if (!page.audio) return false;
  if (page.audioSource === "recorded") return true;
  const spoken = page.textNikud && countWords(page.textNikud) === countWords(page.text) ? page.textNikud : page.text;
  return timingsMatchText(page.wordTimings, spoken);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof StudioApiError ? err.message : fallback;
}

/** Runs `worker` over `items` with at most `limit` running at once. */
async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

export interface StudioEditorProps {
  book: BookWithPages;
  /** True for editors and admins: they may publish directly and edit published books. */
  canPublish: boolean;
  /** Providers and prices for the cost estimates of the stages tab (no secrets). */
  costs?: CostContext;
}

/** The manual book studio: pages, details, live preview, sharing and publication, with autosave. */
export function StudioEditor({ book, canPublish, costs }: StudioEditorProps) {
  const router = useRouter();
  const bookId = book.id;

  const [meta, setMetaState] = useState<EditorMeta>(() => pickMeta(book));
  const [pages, setPagesState] = useState<EditorPage[]>(() => book.pages.map(toEditorPage));
  const [info, setInfo] = useState<ServerInfo>(() => pickInfo(book));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(book.pages.some((page) => page.text.trim().length > 0 || page.image) ? "pages" : "stages");
  const [busy, setBusyState] = useState<BusyState | null>(null);
  // Accepts a plain label as well as the object form with progress information.
  const setBusy = useCallback((next: BusyInput) => setBusyState(toBusy(next)), []);
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [mockTranslation, setMockTranslation] = useState(false);
  const [untranslatedPages, setUntranslatedPages] = useState<number[]>([]);

  // The refs hold the newest state so async work (uploads, narration) never acts on a stale copy.
  const metaRef = useRef(meta);
  const pagesRef = useRef(pages);
  const previews = useRef(new Set<string>());
  const filesInput = useRef<HTMLInputElement>(null);

  const onSaved = useCallback((saved: BookWithPages) => setInfo(pickInfo(saved)), []);
  const autosave = useAutosave(bookId, onSaved, book.updatedAt);
  const { markMeta, markPages, flush, setBase, discard } = autosave;

  // Owners cannot edit a published book, nor one that waits for review (the editor approves what they read).
  const locked = (info.status === "published" || info.status === "pending") && !canPublish;
  const selected = pages.find((page) => page.key === selectedKey) ?? pages[0] ?? null;
  const selectedIndex = selected ? pages.indexOf(selected) : -1;

  useEffect(() => {
    const urls = previews.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  // Voices of the active narration provider, for the narration stage.
  const [narrationInfo, setNarrationInfo] = useState<NarrationInfo | undefined>();
  useEffect(() => {
    let cancelled = false;
    void fetchNarrationInfo(bookId).then((info) => {
      if (!cancelled) setNarrationInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);
  const sampleVoice = async (options: { voice?: string; style: string }) => {
    try {
      const sample = await fetchVoiceSample(options);
      if (sample.isMock) {
        URL.revokeObjectURL(sample.url);
        setNotice({ tone: "info", text: "אין קול אמיתי מוגדר באתר, ולכן אי אפשר לשמוע דוגמה." });
        return;
      }
      const audio = new Audio(sample.url);
      audio.addEventListener("ended", () => URL.revokeObjectURL(sample.url), { once: true });
      await audio.play();
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "הדגמת הקול נכשלה") });
    }
  };

  // A file dropped outside a drop zone must not make the browser leave the editor.
  useEffect(() => {
    const block = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  // ---- State changes --------------------------------------------------------

  const commitPages = useCallback(
    (next: EditorPage[], save = true) => {
      pagesRef.current = next;
      setPagesState(next);
      if (save) markPages(toServerPages(next));
    },
    [markPages],
  );

  const updatePage = useCallback(
    (key: string, patch: Partial<EditorPage>, save = true) => {
      commitPages(
        pagesRef.current.map((page) => (page.key === key ? { ...page, ...patch } : page)),
        save,
      );
    },
    [commitPages],
  );

  const updateMeta = useCallback(
    (patch: Partial<EditorMeta>) => {
      const next = { ...metaRef.current, ...patch };
      metaRef.current = next;
      setMetaState(next);
      const toSend: BookMetaPatch = { ...patch };
      // An empty title is never sent: the stored title stays until a new one is typed.
      if (toSend.title !== undefined && toSend.title.trim().length === 0) delete toSend.title;
      // Removing the hero is sent as null (an undefined field would not reach the server).
      if ("hero" in patch && patch.hero === undefined) toSend.hero = null;
      if (Object.keys(toSend).length > 0) markMeta(toSend);
    },
    [markMeta],
  );

  /** Takes over fields the server decides (status, slug, share token, an auto-chosen cover). */
  const applyServerBook = useCallback((fresh: BookWithPages) => {
    // Later saves are based on this version of the book.
    setBase(fresh.updatedAt);
    setInfo(pickInfo(fresh));
    if (fresh.coverImage !== metaRef.current.coverImage) {
      const next = { ...metaRef.current, coverImage: fresh.coverImage };
      metaRef.current = next;
      setMetaState(next);
    }
  }, [setBase]);

  // ---- Translation -------------------------------------------------------------

  const originalLanguage = info.originalLanguage ?? info.language ?? "he";
  const translatable = originalLanguage !== "he";
  const tabs = translatable ? [TABS[0], TABS[1], TRANSLATE_TAB, ...TABS.slice(2)] : TABS;

  /** The server changes the text, the title and the credits: save first, then take over its version of the book. */
  const runTranslation = async (mode: "translate" | "accept", translator: string) => {
    setBusy(
      mode === "translate"
        ? { label: "מתרגם את כל הספר לעברית…", expectedSeconds: EXPECTED_SECONDS.translate }
        : { label: "מאשר את התרגום…", expectedSeconds: EXPECTED_SECONDS.acceptTranslation },
    );
    setUntranslatedPages([]);
    try {
      if (!(await flush())) {
        setNotice({ tone: "error", text: "אי אפשר לתרגם לפני שהשינויים נשמרים. בדקו את החיבור ונסו שוב." });
        return;
      }
      const outcome =
        mode === "translate" ? await translateBookToHebrew(bookId, translator) : await acceptTranslation(bookId, translator);
      if (outcome.status === "mock" || outcome.isMock) {
        setMockTranslation(true);
        setNotice({ tone: "info", text: "הספר לא תורגם, והטקסט לא השתנה.", mock: "translation" });
        return;
      }
      setMockTranslation(false);
      const fresh = outcome.book;
      const nextMeta = pickMeta(fresh);
      metaRef.current = nextMeta;
      setMetaState(nextMeta);
      if (outcome.status === "translated") {
        const nextPages = fresh.pages.map(toEditorPage);
        pagesRef.current = nextPages;
        setPagesState(nextPages);
        setSelectedKey(null);
      }
      applyServerBook(fresh);
      setNotice({
        tone: "success",
        text:
          outcome.status === "translated"
            ? "הספר תורגם לעברית. עברו על התרגום מול המקור ותקנו, ואז נקדו והקריאו את הספר."
            : "התרגום אושר: הספר מסומן עכשיו כספר בעברית. אפשר לנקד ולהקריא אותו.",
      });
    } catch (err) {
      const details = err instanceof StudioApiError ? (err.details as { pageIndexes?: unknown } | undefined) : undefined;
      if (Array.isArray(details?.pageIndexes)) {
        setUntranslatedPages(details.pageIndexes.filter((value): value is number => typeof value === "number"));
      }
      setNotice({ tone: "error", text: errorMessage(err, "התרגום נכשל. הספר לא השתנה.") });
    } finally {
      setBusy(null);
    }
  };

  const requestTranslation = (translator: string) => {
    if ((info.language ?? "he") !== "he") {
      void runTranslation("translate", translator);
      return;
    }
    setConfirm({
      title: "לתרגם מחדש את כל הספר?",
      description: "התרגום החדש יחליף את הטקסט העברי בכל העמודים, כולל תיקונים שעשיתם, וגם את הניקוד וההקראה.",
      confirmLabel: "תרגום מחדש",
      danger: true,
      run: () => void runTranslation("translate", translator),
    });
  };

  const localPreview = (file: Blob): string => {
    const url = URL.createObjectURL(file);
    previews.current.add(url);
    return url;
  };

  // ---- Pages ----------------------------------------------------------------

  const addPage = () => {
    const current = pagesRef.current;
    if (current.length >= MAX_PAGES) {
      setNotice({ tone: "error", text: `אפשר עד ${MAX_PAGES} עמודים בספר.` });
      return;
    }
    const page: EditorPage = { key: newPageKey(), text: "" };
    const at = selectedIndex >= 0 ? selectedIndex + 1 : current.length;
    commitPages([...current.slice(0, at), page, ...current.slice(at)]);
    setSelectedKey(page.key);
  };

  const duplicatePage = (key: string) => {
    const current = pagesRef.current;
    const at = current.findIndex((page) => page.key === key);
    if (at < 0 || current.length >= MAX_PAGES) return;
    if (current[at].uploading) {
      setNotice({ tone: "info", text: "התמונה של העמוד עדיין עולה. נסו לשכפל שוב בעוד רגע." });
      return;
    }
    const copy: EditorPage = { ...current[at], key: newPageKey(), uploading: false, uploadError: undefined };
    commitPages([...current.slice(0, at + 1), copy, ...current.slice(at + 1)]);
    setSelectedKey(copy.key);
  };

  const removePage = (key: string) => {
    const current = pagesRef.current;
    const at = current.findIndex((page) => page.key === key);
    if (at < 0) return;
    const rest = current.filter((page) => page.key !== key);
    // A book always keeps at least one page to type into.
    const next = rest.length > 0 ? rest : [{ key: newPageKey(), text: "" }];
    commitPages(next);
    setSelectedKey(next[Math.min(at, next.length - 1)].key);
  };

  const requestRemovePage = (key: string) => {
    const page = pagesRef.current.find((candidate) => candidate.key === key);
    if (!page) return;
    if (isBlankPage(page) && !page.preview) {
      removePage(key);
      return;
    }
    const number = pagesRef.current.indexOf(page) + 1;
    setConfirm({
      title: `למחוק את עמוד ${number}?`,
      description: "הטקסט, התמונה וההקראה של העמוד יימחקו.",
      confirmLabel: "מחיקת העמוד",
      danger: true,
      run: () => removePage(key),
    });
  };

  const movePage = (key: string, delta: -1 | 1) => {
    const current = pagesRef.current;
    const from = current.findIndex((page) => page.key === key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= current.length) return;
    commitPages(arrayMove(current, from, to));
  };

  const reorderPages = (fromKey: string, toKey: string) => {
    const current = pagesRef.current;
    const from = current.findIndex((page) => page.key === fromKey);
    const to = current.findIndex((page) => page.key === toKey);
    if (from < 0 || to < 0) return;
    commitPages(arrayMove(current, from, to));
  };

  const uploadPageImage = async (key: string, file: File) => {
    try {
      const upload = await uploadMedia(bookId, "image", await shrinkImage(file), file.name);
      updatePage(key, { image: upload.path, uploading: false, uploadError: undefined });
    } catch (err) {
      updatePage(key, { uploading: false, uploadError: errorMessage(err, "העלאת התמונה נכשלה") }, false);
    }
  };

  const setPageImage = (key: string, file: File) => {
    if (!file.type.startsWith("image/")) {
      setNotice({ tone: "error", text: "אפשר לבחור רק קובץ תמונה." });
      return;
    }
    updatePage(key, { preview: localPreview(file), uploading: true, uploadError: undefined }, false);
    void uploadPageImage(key, file);
  };

  /** One new page per picture, in filename order. Blank starter pages are replaced. */
  const addImagesAsPages = async (files: File[]) => {
    const images = sortByFileName(files.filter((file) => file.type.startsWith("image/")));
    if (images.length === 0) {
      setNotice({ tone: "error", text: "אפשר לגרור לכאן רק קובצי תמונה." });
      return;
    }
    const current = pagesRef.current;
    const base = current.every((page) => isBlankPage(page) && !page.preview) ? [] : current;
    const accepted = images.slice(0, Math.max(0, MAX_PAGES - base.length));
    if (accepted.length === 0) {
      setNotice({ tone: "error", text: `אפשר עד ${MAX_PAGES} עמודים בספר.` });
      return;
    }
    const created: EditorPage[] = accepted.map((file) => ({
      key: newPageKey(),
      text: "",
      preview: localPreview(file),
      uploading: true,
    }));
    commitPages([...base, ...created], false);
    setSelectedKey(created[0].key);
    setTab("pages");
    const skipped = images.length - accepted.length;
    setNotice({
      tone: skipped > 0 ? "error" : "info",
      text:
        skipped > 0
          ? `נוספו ${accepted.length} עמודים. ${skipped} תמונות לא נוספו כי בספר אפשר עד ${MAX_PAGES} עמודים.`
          : `נוספו ${accepted.length} עמודים לפי סדר שמות הקבצים. התמונות עולות ברקע.`,
    });
    await runPool(accepted, 3, (file, index) => uploadPageImage(created[index].key, file));
  };

  const setPageAudio = async (key: string, audio: Blob, fileName: string) => {
    try {
      const upload = await uploadMedia(bookId, "audio", audio, fileName);
      updatePage(key, { audio: upload.path, audioSource: "recorded", wordTimings: undefined });
      setNotice({ tone: "success", text: "ההקלטה נשמרה בעמוד." });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "שמירת ההקלטה נכשלה") });
    }
  };

  const applyPastedStory = () => {
    const texts = splitStoryIntoPages(pasteText);
    setPasteOpen(false);
    setPasteText("");
    if (texts.length === 0) return;
    // Fill pages that have no text yet, in order; the rest become new pages. Existing text is never replaced.
    const next = pagesRef.current.map((page) => ({ ...page }));
    let cursor = 0;
    for (const page of next) {
      if (cursor >= texts.length) break;
      if (page.text.trim().length === 0) {
        page.text = texts[cursor];
        cursor += 1;
      }
    }
    while (cursor < texts.length && next.length < MAX_PAGES) {
      next.push({ key: newPageKey(), text: texts[cursor] });
      cursor += 1;
    }
    commitPages(next);
    const left = texts.length - cursor;
    setNotice({
      tone: left > 0 ? "error" : "success",
      text:
        left > 0
          ? `הטקסט חולק לעמודים, אבל ${left} קטעים לא נכנסו כי בספר אפשר עד ${MAX_PAGES} עמודים.`
          : `הטקסט חולק ל-${texts.length} עמודים.`,
    });
    void detailsAfterPaste();
  };

  // ---- Nikud and narration ---------------------------------------------------

  const autoNikud = async (keys: string[], overwrite: boolean) => {
    const todo = keys.filter((key) => {
      const page = pagesRef.current.find((candidate) => candidate.key === key);
      return !!page && page.text.trim().length > 0 && (overwrite || !page.textNikud || !hasNikud(page.textNikud));
    });
    const nikudBusy = (at: number): BusyState => ({
      label: todo.length > 1 ? `מנקד עמוד ${Math.min(at + 1, todo.length)} מתוך ${todo.length}…` : "מנקד את הטקסט…",
      steps: { done: at, total: Math.max(1, todo.length) },
      expectedSeconds: EXPECTED_SECONDS.nikudPage,
    });
    setBusy(nikudBusy(0));
    let done = 0;
    let mock = false;
    let failure: string | null = null;
    try {
      for (const key of keys) {
        const page = pagesRef.current.find((candidate) => candidate.key === key);
        if (!page || page.text.trim().length === 0) continue;
        if (!overwrite && page.textNikud && hasNikud(page.textNikud)) continue;
        setBusy(nikudBusy(done));
        const outcome = await requestNikud(page.text);
        if (!outcome.available) {
          failure = outcome.message;
          break;
        }
        // The demo provider returns the text unchanged: never store that as "vocalized".
        if (outcome.isMock || !hasNikud(outcome.text)) {
          mock = true;
          break;
        }
        updatePage(key, { textNikud: outcome.text });
        done += 1;
      }
    } finally {
      setBusy(null);
    }
    if (failure) setNotice({ tone: "error", text: failure });
    else if (mock) setNotice({ tone: "info", text: "הטקסט לא נוקד. אפשר לנקד ידנית.", mock: "nikud" });
    else if (done === 0) setNotice({ tone: "info", text: "לא נמצא טקסט שצריך לנקד." });
    else setNotice({ tone: "success", text: done === 1 ? "העמוד נוקד. כדאי לעבור על הניקוד ולתקן." : `נוקדו ${done} עמודים. כדאי לעבור על הניקוד ולתקן.` });
  };

  /** Narration is stored by the server inside the book, so: save first, narrate, then reload the audio fields. */
  const autoNarrate = async (
    pageIndexes: number[] | undefined,
    replaceRecording: boolean,
    voice?: { style?: string; notes?: string; voice?: string },
    /** Narrate again even where the audio is up to date. Default: only when pages are listed explicitly. */
    force: boolean = pageIndexes !== undefined,
  ): Promise<{ styleNotesIgnored?: boolean } | void> => {
    setBusy({ label: "מכין הקראה…", expectedSeconds: EXPECTED_SECONDS.upload });
    try {
      if (!(await flush())) {
        setNotice({ tone: "error", text: "אי אפשר להקריא לפני שהשינויים נשמרים. בדקו את החיבור ונסו שוב." });
        return;
      }
      const outcome = await narrate(
        bookId,
        {
          pages: pageIndexes,
          force,
          overwriteRecorded: replaceRecording,
          ...(voice?.style ? { style: voice.style } : {}),
          ...(voice?.notes?.trim() ? { notes: voice.notes.trim() } : {}),
          ...(voice?.voice ? { voice: voice.voice } : {}),
        },
        (done, total) =>
          setBusy({
            label: done >= total ? "שומרים את ההקראה…" : `מקריא עמוד ${done + 1} מתוך ${total}…`,
            steps: { done, total },
            expectedSeconds: EXPECTED_SECONDS.narrationPage,
          }),
      );
      if (!outcome.available) {
        setNotice({ tone: "error", text: outcome.message ?? "ההקראה האוטומטית לא זמינה כרגע." });
        return;
      }
      const fresh = await fetchBook(bookId);
      const merged = pagesRef.current.map((page, index) => {
        const stored = fresh.pages[index];
        if (!stored || stored.text !== page.text) return page;
        return {
          ...page,
          audio: stored.audio,
          audioSource: stored.audioSource,
          wordTimings: stored.wordTimings,
          textNikud: page.textNikud ?? stored.textNikud,
        };
      });
      // Saved again on purpose: it replaces any older pending snapshot that lacks the new audio.
      commitPages(merged);
      applyServerBook(fresh);

      const pagesLabel = (count: number) => (count === 1 ? "עמוד אחד" : `${count} עמודים`);
      const parts = [`${outcome.narrated === 1 ? "הוקרא" : "הוקראו"} ${pagesLabel(outcome.narrated)}`];
      if (outcome.skipped > 0) parts.push(`${outcome.skipped} דולגו`);
      if (outcome.failed > 0) parts.push(`${outcome.failed} נכשלו`);
      const rawError = outcome.pages.find((p) => p.status === "failed")?.error;
      // Vendor errors come in English (often raw JSON): show a short Hebrew reason instead.
      const firstError = rawError
        ? /quota|credit|402|429|limit/i.test(rawError)
          ? "מכסת ההקראה אצל ספק הקול נגמרה. אפשר לנסות שוב מאוחר יותר או לבחור ספק אחר."
          : /401|403|api key|unauthor/i.test(rawError)
            ? "ספק הקול דחה את המפתח. בדקו את TTS_API_KEY."
            : /[֐-׿]/.test(rawError)
              ? rawError
              : "שירות ההקראה נכשל. נסו שוב בעוד רגע."
        : undefined;
      setNotice({
        tone: outcome.failed > 0 ? "error" : outcome.narrated > 0 ? "success" : "info",
        text:
          outcome.narrated === 0 && outcome.failed === 0
            ? force
              ? "לא הוקרא אף עמוד: עמודים עם הקלטה שלכם לא מוחלפים, ועמודים בלי טקסט מדולגים."
              : "לא היה מה להקריא: לכל העמודים עם טקסט כבר יש הקראה עדכנית או הקלטה שלכם. כדי להקריא שוב בקול אחר, בחרו \"הקראה מחדש של כל הספר\"."
            : `${parts.join(", ")}.${firstError ? ` (${firstError})` : ""}`,
        mock: outcome.ttsMock ? "tts" : undefined,
      });
      return { styleNotesIgnored: outcome.styleNotesIgnored };
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "ההקראה נכשלה") });
    } finally {
      setBusy(null);
    }
  };

  /** Stage 5: only the pages without narration, or every page with text again in the chosen voice and style. */
  const narrateAll = (options: NarrateAllOptions): Promise<{ styleNotesIgnored?: boolean } | void> | void => {
    const voice = { style: options.style, notes: options.notes, voice: options.voice };
    if (options.scope === "missing") return autoNarrate(undefined, false, voice);
    if (pagesRef.current.some((candidate) => candidate.uploading)) {
      setNotice({ tone: "info", text: "חכו רגע לסיום העלאת התמונות, ואז נסו שוב." });
      return;
    }
    const indexes = pagesRef.current.flatMap((page, index) => (page.text.trim().length > 0 ? [index] : []));
    if (indexes.length === 0) {
      setNotice({ tone: "info", text: "אין עמודים עם טקסט להקריא." });
      return;
    }
    const recorded = indexes.filter((index) => {
      const page = pagesRef.current[index];
      return !!page.audio && page.audioSource === "recorded";
    }).length;
    const replaced = indexes.length - recorded;
    const description =
      `ההקראה של ${replaced === 1 ? "עמוד אחד" : `${replaced} עמודים`} תוחלף בקול ובסגנון שנבחרו, ויש לכך עלות לפי אורך הטקסט.` +
      (recorded > 0
        ? ` ב-${recorded === 1 ? "עמוד אחד" : `${recorded} עמודים`} יש הקלטה בקול שלכם: כברירת מחדל היא נשארת.`
        : "");
    setConfirm({
      title: "להקריא מחדש את כל הספר?",
      description,
      confirmLabel: recorded > 0 ? "הקראה מחדש, בלי לגעת בהקלטות" : "הקראה מחדש",
      ...(recorded > 0
        ? {
            alt: {
              label: "הקראה מחדש, כולל ההקלטות שלי",
              run: () => void autoNarrate(indexes, true, voice, true),
            },
          }
        : {}),
      run: () => void autoNarrate(indexes, false, voice, true),
    });
  };

  const narratePage = (key: string) => {
    const index = pagesRef.current.findIndex((page) => page.key === key);
    if (index < 0) return;
    const page = pagesRef.current[index];
    if (pagesRef.current.some((candidate) => candidate.uploading)) {
      setNotice({ tone: "info", text: "חכו רגע לסיום העלאת התמונות, ואז נסו שוב." });
      return;
    }
    if (page.audio && page.audioSource === "recorded") {
      setConfirm({
        title: "להחליף את ההקלטה שלכם?",
        description: "בעמוד הזה יש הקלטה בקול שלכם. הקראה אוטומטית תחליף אותה.",
        confirmLabel: "החלפה בהקראה אוטומטית",
        run: () => void autoNarrate([index], true),
      });
      return;
    }
    void autoNarrate([index], false);
  };

  // ---- Hero and illustrations -------------------------------------------------

  const setHero = (hero: BookHero | undefined) => updateMeta({ hero });

  /** The server may write the description from the story, so the story is saved first. */
  const generateHero = async (description: string, style: string) => {
    setBusy(
      description
        ? { label: "מצייר את הגיבור…", expectedSeconds: EXPECTED_SECONDS.hero }
        : { label: "כותב תיאור של הגיבור לפי הסיפור ומצייר אותו…", expectedSeconds: EXPECTED_SECONDS.heroWithDescription },
    );
    try {
      if (!(await flush())) {
        setNotice({ tone: "error", text: "אי אפשר ליצור את הגיבור לפני שהשינויים נשמרים. בדקו את החיבור ונסו שוב." });
        return;
      }
      const outcome = await createHeroImage(bookId, { description: description || undefined, style });
      setHero({ ...metaRef.current.hero, description: outcome.description, style: outcome.style, image: outcome.path });
      setNotice({
        tone: "success",
        text: outcome.descriptionWritten
          ? "הגיבור מוכן. כתבנו את התיאור שלו לפי הסיפור, ואפשר לתקן אותו וליצור מחדש."
          : "הגיבור מוכן. עכשיו אפשר ליצור איור לכל עמוד לפיו.",
        mock: outcome.isMock ? "image" : undefined,
      });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "יצירת הגיבור נכשלה") });
    } finally {
      setBusy(null);
    }
  };

  const uploadHero = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setNotice({ tone: "error", text: "אפשר לבחור רק קובץ תמונה." });
      return;
    }
    setBusy({ label: "מעלה את תמונת הגיבור…", expectedSeconds: EXPECTED_SECONDS.upload });
    try {
      const upload = await uploadMedia(bookId, "image", await shrinkImage(file), file.name);
      const current = metaRef.current.hero;
      setHero({ ...current, description: current?.description ?? "", image: upload.path });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "העלאת התמונה נכשלה") });
    } finally {
      setBusy(null);
    }
  };

  /** Illustrations are drawn from the SAVED book: save first, then one page at a time. */
  const illustrate = async (keys: string[], note?: string) => {
    const illustrateBusy = (at: number): BusyState =>
      keys.length > 1
        ? { label: `מאייר עמוד ${at + 1} מתוך ${keys.length}…`, steps: { done: at, total: keys.length }, expectedSeconds: EXPECTED_SECONDS.illustratePage }
        : { label: "מאייר את העמוד…", expectedSeconds: EXPECTED_SECONDS.illustratePage };
    setBusy(illustrateBusy(0));
    let done = 0;
    let mock = false;
    try {
      if (!(await flush())) {
        setNotice({ tone: "error", text: "אי אפשר לאייר לפני שהשינויים נשמרים. בדקו את החיבור ונסו שוב." });
        return;
      }
      for (const [i, key] of keys.entries()) {
        const index = pagesRef.current.findIndex((page) => page.key === key);
        if (index < 0) continue;
        setBusy(illustrateBusy(i));
        const outcome = await illustratePage(bookId, index, note);
        updatePage(key, { image: outcome.path, preview: undefined, uploadError: undefined });
        if (outcome.isMock) mock = true;
        done += 1;
      }
      const credit = done > 0 && !mock ? await afterPictures() : "";
      setNotice({
        tone: "success",
        text: `${done === 1 ? "האיור מוכן. אם הוא לא מתאים, אפשר ליצור איור חדש." : `אוירו ${done} עמודים.`}${credit ? ` ${credit}` : ""}`,
        mock: mock ? "image" : undefined,
      });
    } catch (err) {
      const prefix = done > 0 ? `אוירו ${done} עמודים, ואז ` : "";
      setNotice({ tone: "error", text: `${prefix}${errorMessage(err, "יצירת האיור נכשלה")}`, mock: mock ? "image" : undefined });
    } finally {
      setBusy(null);
    }
  };

  const illustrateOne = (key: string, note: string) => {
    const page = pagesRef.current.find((candidate) => candidate.key === key);
    if (!page) return;
    if (page.image || page.preview) {
      setConfirm({
        title: "להחליף את התמונה של העמוד?",
        description: "האיור החדש יחליף את התמונה שיש עכשיו בעמוד.",
        confirmLabel: "יצירת איור חדש",
        run: () => void illustrate([key], note),
      });
      return;
    }
    void illustrate([key], note);
  };

  /** Pictures for many pages, one grid image per request (9 or 16 pages), saved first and applied page by page. */
  const illustrateGrids = async (keys: string[], options: { layout: GridLayout; notes?: string }) => {
    const size = gridCapacity(options.layout);
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += size) chunks.push(keys.slice(i, i + size));
    let done = 0;
    let mock = false;
    const warnings: string[] = [];
    const gridBusy = (at: number): BusyState => ({
      label: chunks.length > 1 ? `מאיירים רשת ${at + 1} מתוך ${chunks.length}…` : "מאיירים את העמודים ברשת אחת…",
      steps: { done: at, total: chunks.length },
      expectedSeconds: EXPECTED_SECONDS.grid,
    });
    setBusy(gridBusy(0));
    try {
      if (!(await flush())) {
        setNotice({ tone: "error", text: "אי אפשר לאייר לפני שהשינויים נשמרים. בדקו את החיבור ונסו שוב." });
        return;
      }
      for (const [i, chunk] of chunks.entries()) {
        setBusy(gridBusy(i));
        const indexes = chunk.map((key) => pagesRef.current.findIndex((page) => page.key === key)).filter((index) => index >= 0);
        if (indexes.length === 0) continue;
        const outcome = await illustrateGrid(bookId, { pages: indexes, layout: options.layout, notes: options.notes });
        for (const panel of outcome.panels) {
          const target = pagesRef.current[panel.page];
          if (!target) continue;
          updatePage(target.key, { image: panel.path, preview: undefined, uploadError: undefined });
          done += 1;
        }
        if (outcome.isMock) mock = true;
        warnings.push(...outcome.warnings);
      }
      const credit = done > 0 && !mock ? await afterPictures() : "";
      const extra = (warnings.length > 0 ? ` ${warnings.join(" ")}` : "") + (credit ? ` ${credit}` : "");
      setNotice({
        tone: done > 0 ? "success" : "info",
        text: done > 0 ? `אוירו ${done} עמודים. אם איור לא מתאים, אפשר ליצור לעמוד איור חדש.${extra}` : `לא נוצרו איורים.${extra}`,
        mock: mock ? "image" : undefined,
      });
    } catch (err) {
      const prefix = done > 0 ? `אוירו ${done} עמודים, ואז ` : "";
      setNotice({ tone: "error", text: `${prefix}${errorMessage(err, "יצירת האיורים נכשלה")}`, mock: mock ? "image" : undefined });
    } finally {
      setBusy(null);
    }
  };

  const illustrateMissing = (options: { layout?: GridLayout; notes?: string } = {}) => {
    const keys = pagesRef.current
      .filter((page) => !page.image && !page.preview && page.text.trim().length > 0)
      .map((page) => page.key);
    if (keys.length > 0) void illustrateGrids(keys, { layout: options.layout ?? "3x3", notes: options.notes });
  };

  // ---- Book details that fill themselves --------------------------------------

  /** What the last automatic fill wrote, so a detail nobody touched can be refreshed later. */
  const autoFilledRef = useRef<AutoFilled>({});

  /** Credit lines for the parts AI made; only into empty fields. Returns the sentence for the notice. */
  const fillCredits = (made: { aiWrote?: boolean; aiIllustrated?: boolean }): { patch: Partial<EditorMeta>; filled: FilledField[] } => {
    const credits = mergeCredits({ meta: metaRef.current, ...made });
    return credits;
  };

  /**
   * Asks for the details from the saved story and merges them into the empty
   * fields. Never throws: a failure here must not spoil the step that called it.
   * Returns a sentence for the notice ("" when nothing was filled).
   */
  const fillDetails = async (options: { replace?: boolean; aiWrote?: boolean } = {}): Promise<string> => {
    try {
      if (!(await flush())) return "";
      const outcome = await suggestBookDetails(bookId);
      if (outcome.isMock) return "פרטי הספר לא מולאו, כי שירות הכתיבה לא מחובר.";
      const merged = mergeDetails({
        meta: metaRef.current,
        suggestions: outcome.suggestions,
        autoFilled: autoFilledRef.current,
        replaceAll: options.replace,
      });
      const credits = options.aiWrote ? fillCredits({ aiWrote: true }) : { patch: {}, filled: [] as FilledField[] };
      const patch: Partial<EditorMeta> = { ...merged.patch, ...credits.patch };
      const filled = [...merged.filled, ...credits.filled];
      autoFilledRef.current = merged.autoFilled;
      if (filled.length === 0) return options.replace || !options.aiWrote ? "כל פרטי הספר כבר מלאים, ולא שינינו אותם." : "";
      updateMeta(patch);
      return describeFilled(filled, patch);
    } catch (err) {
      return `פרטי הספר לא מולאו: ${errorMessage(err, "השירות לא זמין")} אפשר להשלים אותם בלשונית פרטי הספר.`;
    }
  };

  /** Explicit button of stage 8. */
  const runAutoDetails = async (options: { replace: boolean }) => {
    setBusy({ label: "קוראים את הסיפור וממלאים את פרטי הספר…", expectedSeconds: EXPECTED_SECONDS.details });
    try {
      const text = await fillDetails({ replace: options.replace });
      setNotice({ tone: text ? "success" : "info", text: text || "אין פרטים חדשים למלא." });
    } finally {
      setBusy(null);
    }
  };

  /** After pictures: the illustrator credit (empty field only) and the cover the server chose. Returns a notice sentence. */
  const afterPictures = async (): Promise<string> => {
    const credits = fillCredits({ aiIllustrated: true });
    if (credits.filled.length > 0) updateMeta(credits.patch);
    try {
      if (await flush()) applyServerBook(await fetchBook(bookId));
    } catch {
      // The cover is picked up on the next save or reload.
    }
    return credits.filled.length > 0 ? describeFilled(credits.filled, credits.patch) : "";
  };

  /** A pasted story with no summary and no tags yet gets its details too. */
  const detailsAfterPaste = async () => {
    const current = metaRef.current;
    if (current.summary.trim().length > 0 || current.tags.length > 0) return;
    setBusy({ label: "ממלאים את פרטי הספר לפי הסיפור…", expectedSeconds: EXPECTED_SECONDS.details });
    try {
      const text = await fillDetails();
      if (text) setNotice({ tone: "success", text });
    } finally {
      setBusy(null);
    }
  };

  // ---- Writing the story with AI ---------------------------------------------

  /** The story is written from the idea alone; the pages that exist keep their pictures but get the new text. */
  const runWriteStory = async (options: { idea: string; heroName: string; heroGender: "boy" | "girl" }) => {
    setBusy({ label: "כותבים את הסיפור…", expectedSeconds: EXPECTED_SECONDS.story });
    try {
      if (!(await flush())) {
        setNotice({ tone: "error", text: "אי אפשר לכתוב לפני שהשינויים נשמרים. בדקו את החיבור ונסו שוב." });
        return;
      }
      const outcome = await writeStoryPages(bookId, {
        idea: options.idea,
        ...(options.heroName.trim() ? { heroName: options.heroName.trim() } : {}),
        heroGender: options.heroGender,
      });
      const current = pagesRef.current;
      const fresh = (page: EditorPage): EditorPage => ({
        ...page,
        textNikud: undefined,
        audio: undefined,
        audioSource: undefined,
        wordTimings: undefined,
        imageAlt: undefined,
        originalText: undefined,
      });
      const next: EditorPage[] = outcome.pages.map((written, index) => {
        const old = current[index];
        return old ? { ...fresh(old), text: written.text } : { key: newPageKey(), text: written.text };
      });
      // Old pages beyond the new story survive only when they carry a picture.
      for (const old of current.slice(outcome.pages.length)) {
        if (old.image || old.preview) next.push({ ...fresh(old), text: "" });
      }
      commitPages(next.slice(0, MAX_PAGES));
      setSelectedKey(null);
      // Sample text is never catalogued: the details wait for a real writer.
      const filledText = outcome.isMock ? "" : await fillDetails({ aiWrote: true });
      setNotice({
        tone: "success",
        text: `נכתב סיפור של ${outcome.pages.length} עמודים. קראו אותו בקול, תקנו מה שצריך, ואז המשיכו לשלב הבא.${filledText ? ` ${filledText}` : ""}`,
        mock: outcome.isMock ? "text" : undefined,
      });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "כתיבת הסיפור נכשלה") });
    } finally {
      setBusy(null);
    }
  };

  const requestWriteStory = (options: { idea: string; heroName: string; heroGender: "boy" | "girl" }) => {
    if (!pagesRef.current.some((page) => page.text.trim().length > 0)) {
      void runWriteStory(options);
      return;
    }
    setConfirm({
      title: "להחליף את הטקסט של הספר?",
      description: "הסיפור החדש יחליף את הטקסט בכל העמודים, וגם את הניקוד וההקראה שלהם. התמונות נשארות.",
      confirmLabel: "כתיבת סיפור חדש",
      danger: true,
      run: () => void runWriteStory(options),
    });
  };

  const pickImages = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMAGE_ACCEPT;
    input.multiple = true;
    input.hidden = true;
    // Attached to the page while it is open: some mobile browsers drop the change event of a detached input.
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      if (files.length > 0) void addImagesAsPages(files);
    };
    document.body.appendChild(input);
    input.click();
  };

  // ---- Book actions -----------------------------------------------------------

  const runBookAction = async (label: string, action: () => Promise<BookWithPages>, success: string) => {
    setBusy({ label, expectedSeconds: EXPECTED_SECONDS.bookAction });
    try {
      if (!locked && !(await flush())) {
        setNotice({ tone: "error", text: "השינויים האחרונים לא נשמרו, ולכן הפעולה לא בוצעה. נסו שוב." });
        return;
      }
      applyServerBook(await action());
      setNotice({ tone: "success", text: success });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "הפעולה נכשלה") });
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = (status: BookStatus) => {
    const success: Record<BookStatus, string> = {
      draft: "הספר חזר לטיוטה.",
      private: "הספר פרטי. רק אתם ומי שקיבל קישור רואים אותו.",
      pending: "הספר הוגש לפרסום. עורך יעבור עליו ויאשר.",
      published: "הספר פורסם בספרייה.",
    };
    void runBookAction("מעדכן…", () => setBookStatus(bookId, status), success[status]);
  };

  const removeBook = async () => {
    setBusy({ label: "מוחק את הספר…", expectedSeconds: EXPECTED_SECONDS.bookAction });
    try {
      await flush();
      await deleteBook(bookId);
      router.push(routes.studio());
      router.refresh();
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "מחיקת הספר נכשלה") });
      setBusy(null);
    }
  };

  const uploadCover = async (file: File) => {
    try {
      const upload = await uploadMedia(bookId, "cover", await shrinkImage(file), file.name);
      updateMeta({ coverImage: upload.path });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "העלאת השער נכשלה") });
    }
  };

  // ---- Derived ----------------------------------------------------------------

  const liveBook = useMemo(() => composeBook(book, meta, info, pages), [book, meta, info, pages]);
  const previewBook = useDeferredValue(liveBook);
  const problems = useMemo(() => publishProblems(liveBook), [liveBook]);
  const readingMinutes = useMemo(() => estimateReadingMinutes(pages.map((page) => page.text)), [pages]);
  const firstPageImage = pages.find((page) => page.image)?.image;
  const uploadingCount = pages.filter((page) => page.uploading).length;
  const missingImages = pages.filter((page) => !page.image && !page.preview && page.text.trim().length > 0).length;
  const hasHero = !!(meta.hero && (meta.hero.description.trim() || meta.hero.image));

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDropActive(false);
    if (locked || busy) return;
    void addImagesAsPages(Array.from(event.dataTransfer.files));
  };

  return (
    <main className="container-page flex flex-col gap-5 py-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink variant="ghost" size="sm" href={routes.studio()}>
            <ArrowRight aria-hidden="true" className="size-4" />
            הספרים שלי
          </ButtonLink>
          <SaveIndicator
            state={autosave.state}
            error={autosave.error}
            onRetry={() => void flush()}
            className="ms-auto"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold">{meta.title.trim() || book.title}</h1>
          <Chip tone={STATUS_TONES[info.status]}>{STATUS_LABELS[info.status]}</Chip>
          <span className="inline-flex items-center gap-1 text-muted">
            <Clock aria-hidden="true" className="size-4" />
            {pages.length} עמודים, {readingTimeLabel(readingMinutes)} קריאה
          </span>
        </div>
        {locked ? (
          <p role="note" className="flex items-start gap-2 rounded-md bg-warning-soft p-4">
            <Lock aria-hidden="true" className="mt-1 size-5 shrink-0" />
            <span>
              {info.status === "pending"
                ? "הספר הוגש לפרסום וממתין לאישור, ולכן הוא נעול לעריכה. כדי לערוך, עברו ללשונית \"שיתוף ופרסום\" ובטלו את ההגשה."
                : "הספר מפורסם בספרייה ולכן נעול לעריכה. כדי לערוך, עברו ללשונית \"שיתוף ופרסום\" והחזירו אותו למצב פרטי."}
            </span>
          </p>
        ) : null}
        {autosave.conflict ? (
          <div role="alert" className="flex flex-col gap-3 rounded-md bg-danger-soft p-4">
            <p className="font-medium">
              הספר השתנה במקום אחר (בלשונית אחרת, במכשיר אחר או על ידי עורך), ולכן השינויים האחרונים בלשונית הזאת
              לא נשמרו ולא יישמרו. טענו את העמוד מחדש כדי לראות את הגרסה העדכנית ולהמשיך לערוך.
            </p>
            <div>
              <Button
                variant="danger"
                onClick={() => {
                  discard();
                  window.location.reload();
                }}
              >
                טעינה מחדש
              </Button>
            </div>
          </div>
        ) : null}
        {info.reviewNote && tab !== "publish" ? (
          <p role="note" className="rounded-md bg-warning-soft p-4">
            <strong>הערת העורך: </strong>
            {info.reviewNote}
          </p>
        ) : null}
        <div role="tablist" aria-label="חלקי העורך" className="flex gap-1 overflow-x-auto border-b-2 border-border">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`studio-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls="studio-tabpanel"
              onClick={() => setTab(item.id)}
              className={cn(
                "-mb-0.5 min-h-touch whitespace-nowrap border-b-4 px-4 text-lg font-semibold",
                tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div id="studio-tabpanel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`} inert={busy !== null}>
        {tab === "stages" ? (
          <div inert={locked} className={cn(locked && "opacity-60")}>
            <StagesPanel
              bookId={bookId}
              version={info.updatedAt}
              hero={meta.hero}
              costs={costs}
              counts={{
                textChars: pages.reduce((sum, page) => sum + stripNikud(page.text).length, 0),
                audioMissingChars: pages.reduce(
                  (sum, page) => sum + (page.text.trim().length > 0 && !hasFreshAudio(page) ? stripNikud(page.text).length : 0),
                  0,
                ),
                pages: pages.length,
                withText: pages.filter((page) => page.text.trim().length > 0).length,
                withImage: pages.filter((page) => page.image || page.preview).length,
                withNikud: pages.filter((page) => page.text.trim().length > 0 && page.textNikud && hasNikud(page.textNikud)).length,
                withAudio: pages.filter((page) => page.text.trim().length > 0 && page.audio).length,
                withFreshAudio: pages.filter((page) => page.text.trim().length > 0 && hasFreshAudio(page)).length,
              }}
              disabled={locked}
              illustratedPages={pages.flatMap((page, index) => (page.image && !page.uploading ? [index] : []))}
              onHeroChange={setHero}
              onHeroGenerate={(description, style) => void generateHero(description, style)}
              onHeroUpload={(file) => void uploadHero(file)}
              onWriteStory={requestWriteStory}
              onPasteStory={() => setPasteOpen(true)}
              onGoToPages={() => setTab("pages")}
              onGoToPage={(index) => {
                const target = pagesRef.current[index];
                if (target) setSelectedKey(target.key);
                setTab("pages");
              }}
              created={{
                title: meta.title,
                summary: meta.summary,
                tags: meta.tags,
                categories: meta.categories,
                pages: pages.map((page, index) => ({
                  index,
                  text: page.text,
                  textNikud: page.textNikud,
                  image: page.image || page.preview || undefined,
                  audio: page.audio,
                  video: page.video,
                })),
              }}
              onGoToDetails={() => setTab("details")}
              details={detailsCompleteness(meta)}
              onAutoDetails={(options) => void runAutoDetails(options)}
              onUploadImages={pickImages}
              onIllustrateGrid={(options) => illustrateMissing(options)}
              onNikudAll={() =>
                void autoNikud(
                  pagesRef.current.map((page) => page.key),
                  false,
                )
              }
              onNarrateAll={narrateAll}
              narrationInfo={narrationInfo}
              onSampleVoice={narrationInfo && !narrationInfo.ttsMock ? sampleVoice : undefined}
              onFlush={flush}
              onNotice={setNotice}
              onBusy={setBusy}
              onConfirm={(request) => setConfirm(request)}
            />
          </div>
        ) : null}

        {tab === "pages" ? (
          <div
            inert={locked}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                setDropActive(true);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
            }}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col gap-4 rounded-lg",
              locked && "opacity-60",
              dropActive && "outline-4 outline-dashed outline-offset-4 outline-primary",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => filesInput.current?.click()}>
                <Images aria-hidden="true" className="size-5" />
                העלאת תמונות
              </Button>
              <Button variant="outline" onClick={addPage}>
                <Plus aria-hidden="true" className="size-5" />
                עמוד חדש
              </Button>
              <Button variant="outline" onClick={() => setPasteOpen(true)}>
                <ClipboardPaste aria-hidden="true" className="size-5" />
                הדבקת סיפור שלם
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void autoNikud(
                    pagesRef.current.map((page) => page.key),
                    false,
                  )
                }
              >
                <Wand2 aria-hidden="true" className="size-5" />
                ניקוד לכל העמודים
              </Button>
              <Button variant="outline" onClick={() => void autoNarrate(undefined, false)} disabled={uploadingCount > 0}>
                <Sparkles aria-hidden="true" className="size-5" />
                הקראה לכל הספר
              </Button>
              <input
                ref={filesInput}
                type="file"
                accept={IMAGE_ACCEPT}
                multiple
                hidden
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length > 0) void addImagesAsPages(files);
                }}
              />
            </div>
            <HeroPanel
              hero={meta.hero}
              version={info.updatedAt}
              missingImages={missingImages}
              onChange={setHero}
              onGenerate={(description, style) => void generateHero(description, style)}
              onUpload={(file) => void uploadHero(file)}
              onIllustrateMissing={() => illustrateMissing()}
            />
            <p className="text-muted">
              אפשר לגרור לכאן כמה תמונות בבת אחת: כל תמונה תהפוך לעמוד, לפי סדר שמות הקבצים.
              {uploadingCount > 0 ? ` מעלה עוד ${uploadingCount} תמונות…` : ""}
            </p>

            <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
              <PageList
                pages={pages}
                selectedKey={selected?.key ?? null}
                onSelect={setSelectedKey}
                onReorder={reorderPages}
                version={info.updatedAt}
                disabled={locked}
              />
              {selected ? (
                <PageEditor
                  key={selected.key}
                  page={selected}
                  index={selectedIndex}
                  total={pages.length}
                  ageGroup={meta.ageGroup}
                  version={info.updatedAt}
                  onChange={(patch) => updatePage(selected.key, patch)}
                  onMove={(delta) => movePage(selected.key, delta)}
                  onDuplicate={() => duplicatePage(selected.key)}
                  onDelete={() => requestRemovePage(selected.key)}
                  onImageFile={(file) => setPageImage(selected.key, file)}
                  onAudioBlob={(audio, fileName) => setPageAudio(selected.key, audio, fileName)}
                  onAutoNikud={() => void autoNikud([selected.key], true)}
                  onAutoNarrate={() => narratePage(selected.key)}
                  hasHero={hasHero}
                  onIllustrate={(note) => illustrateOne(selected.key, note)}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "translate" && translatable ? (
          <div inert={locked} className={cn(locked && "opacity-60")}>
            <TranslationPanel
              pages={pages}
              meta={meta}
              language={info.language ?? "he"}
              originalLanguage={originalLanguage}
              version={info.updatedAt}
              mockTranslation={mockTranslation}
              flaggedPages={untranslatedPages}
              onChangePage={updatePage}
              onChangeMeta={updateMeta}
              onTranslate={requestTranslation}
              onAccept={(translator) => void runTranslation("accept", translator)}
            />
          </div>
        ) : null}

        {tab === "details" ? (
          <div inert={locked} className={cn(locked && "opacity-60")}>
            <MetaForm
              meta={meta}
              onChange={updateMeta}
              onCoverFile={uploadCover}
              firstPageImage={firstPageImage}
              version={info.updatedAt}
            />
          </div>
        ) : null}

        {tab === "preview" ? (
          <div className="flex flex-col gap-3">
            <p className="text-muted">כך הספר ייראה לקוראים. התצוגה מתעדכנת עם כל שינוי, גם לפני השמירה.</p>
            <PreviewPane book={previewBook} initialPage={Math.max(0, selectedIndex)} />
          </div>
        ) : null}

        {tab === "publish" ? (
          <PublishPanel
            info={info}
            problems={problems}
            canPublish={canPublish}
            onStatus={changeStatus}
            onCreateShare={() => void runBookAction("יוצר קישור…", () => createShareLink(bookId), "נוצר קישור שיתוף.")}
            onRemoveShare={() =>
              setConfirm({
                title: "לבטל את קישור השיתוף?",
                description: "מי שקיבל את הקישור לא יוכל יותר לפתוח את הספר.",
                confirmLabel: "ביטול הקישור",
                danger: true,
                run: () => void runBookAction("מבטל קישור…", () => removeShareLink(bookId), "קישור השיתוף בוטל."),
              })
            }
            onDelete={() =>
              setConfirm({
                title: "למחוק את הספר?",
                description: "הספר, התמונות וההקלטות יימחקו לצמיתות. אי אפשר לבטל את הפעולה.",
                confirmLabel: "מחיקת הספר",
                danger: true,
                run: () => void removeBook(),
              })
            }
            onGoToPage={(pageIndex) => {
              const target = pagesRef.current[pageIndex];
              if (target) setSelectedKey(target.key);
              setTab("pages");
            }}
          />
        ) : null}
      </div>

      {busy ? <BusyOverlay busy={busy} /> : null}

      {notice ? <NoticeToast notice={notice} onClose={() => setNotice(null)} /> : null}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              ביטול
            </Button>
            {confirm?.alt ? (
              <Button
                variant="danger"
                onClick={() => {
                  const request = confirm;
                  setConfirm(null);
                  request?.alt?.run();
                }}
              >
                {confirm.alt.label}
              </Button>
            ) : null}
            <Button
              variant={confirm?.danger ? "danger" : "primary"}
              onClick={() => {
                const request = confirm;
                setConfirm(null);
                request?.run();
              }}
            >
              {confirm?.confirmLabel}
            </Button>
          </>
        }
      />

      <Dialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="הדבקת סיפור שלם"
        description="הדביקו את כל הטקסט. כל פסקה (שורה ריקה בין קטעים) תהפוך לעמוד. הטקסט ימלא קודם עמודים ריקים מטקסט, ולא יחליף טקסט קיים."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setPasteOpen(false)}>
              ביטול
            </Button>
            <Button onClick={applyPastedStory} disabled={pasteText.trim().length === 0}>
              חלוקה ל-{splitStoryIntoPages(pasteText).length} עמודים
            </Button>
          </>
        }
      >
        <Textarea
          aria-label="הטקסט של הסיפור"
          dir="rtl"
          rows={12}
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          className="font-story text-lg"
        />
      </Dialog>
    </main>
  );
}

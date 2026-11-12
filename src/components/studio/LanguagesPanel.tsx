"use client";

import { Languages, Mic, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { MACHINE_TRANSLATOR_CREDIT } from "@/lib/credits";
import { STUDIO_LANGUAGE_NAMES } from "@/lib/i18n/studio";
import { LANGUAGES_PANEL_MESSAGES } from "@/lib/i18n/studio-panels";
import {
  fetchBook,
  narrateLanguagePage,
  removeLanguageVersion,
  saveLanguageVersion,
  StudioApiError,
  translateBookToLanguage,
} from "@/lib/studio/client";
import {
  BOOK_LANGUAGES,
  bookLanguage,
  bookVersions,
  pageVersion,
  textDirection,
  type BookLanguage,
  type BookWithPages,
} from "@/lib/types";

export interface LanguagesPanelProps {
  bookId: string;
  /** Saves the editor's pending changes first; false when that failed. */
  ensureSaved: () => Promise<boolean>;
  /** The server changed the book: the editor must base its next save on this version. */
  onServerBook: (book: BookWithPages) => void;
  onNotice: (tone: "success" | "error" | "info", text: string) => void;
  onConfirm: (request: { title: string; description: string; confirmLabel: string; danger?: boolean; run: () => void }) => void;
}

type Busy = { kind: "translate" | "save" | "remove"; language: BookLanguage } | { kind: "narrate"; language: BookLanguage; done: number; total: number };

function narratedCount(book: BookWithPages, language: BookLanguage): { done: number; total: number } {
  const pages = book.pages.filter((page) => pageVersion(book, page, language)?.text);
  return { done: pages.filter((page) => pageVersion(book, page, language)?.audio).length, total: pages.length };
}

/**
 * "Add a language": translate the book into another language, fix the words,
 * and narrate it. The book's own text, nikud and narration are never touched.
 */
export function LanguagesPanel({ bookId, ensureSaved, onServerBook, onNotice, onConfirm }: LanguagesPanelProps) {
  const locale = useLocale();
  const t = LANGUAGES_PANEL_MESSAGES[locale];
  const names = STUDIO_LANGUAGE_NAMES[locale];
  const [book, setBook] = useState<BookWithPages | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [translator, setTranslator] = useState("");
  const [editing, setEditing] = useState<BookLanguage | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBook(bookId).then(
      (fresh) => !cancelled && setBook(fresh),
      () => !cancelled && setLoadFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const fail = (err: unknown, fallback: string) =>
    onNotice("error", err instanceof StudioApiError && err.message ? err.message : fallback);

  const take = (fresh: BookWithPages) => {
    setBook(fresh);
    onServerBook(fresh);
  };

  if (!book) {
    return <p className="text-muted">{loadFailed ? t.loadFailed : t.loading}</p>;
  }

  const own = bookLanguage(book);
  const versions = bookVersions(book);
  const addable = BOOK_LANGUAGES.filter((language) => language !== own && !versions.some((v) => v.language === language));
  const working = busy !== null;

  const translate = async (language: BookLanguage) => {
    setBusy({ kind: "translate", language });
    try {
      if (!(await ensureSaved())) return onNotice("error", t.saveFirst);
      const outcome = await translateBookToLanguage(bookId, language, translator.trim());
      if (outcome.status === "mock" || outcome.isMock) return onNotice("info", t.mock);
      take(outcome.book);
      setEditing(language);
      onNotice("success", t.translated);
    } catch (err) {
      fail(err, t.failed);
    } finally {
      setBusy(null);
    }
  };

  const narrate = async (language: BookLanguage, force: boolean) => {
    const pages = book.pages.map((page, index) => ({ page, index })).filter(({ page }) => pageVersion(book, page, language)?.text);
    let sawMock = false;
    let latest = book;
    for (const [n, { index }] of pages.entries()) {
      setBusy({ kind: "narrate", language, done: n, total: pages.length });
      try {
        const outcome = await narrateLanguagePage(bookId, language, index, force);
        latest = outcome.book;
        sawMock ||= outcome.isMock;
        setBook(outcome.book);
      } catch (err) {
        fail(err, t.narrateFailed(index + 1));
        onServerBook(latest);
        setBusy(null);
        return;
      }
    }
    onServerBook(latest);
    setBusy(null);
    onNotice(sawMock ? "info" : "success", sawMock ? t.narrateMock : t.narrateDone);
  };

  const remove = (language: BookLanguage) =>
    onConfirm({
      title: t.remove,
      description: t.removeConfirm(names[language]),
      confirmLabel: t.remove,
      danger: true,
      run: () => {
        void (async () => {
          setBusy({ kind: "remove", language });
          try {
            if (!(await ensureSaved())) return onNotice("error", t.saveFirst);
            take((await removeLanguageVersion(bookId, language)).book);
            setEditing((current) => (current === language ? null : current));
            onNotice("success", t.removed);
          } catch (err) {
            fail(err, t.failed);
          } finally {
            setBusy(null);
          }
        })();
      },
    });

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="me-auto text-2xl font-bold">{t.heading}</h2>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold">{t.bookLanguage(names[own])}</span>
        </div>
        <p className="max-w-3xl text-muted">{t.lead}</p>

        <h3 className="text-xl font-bold">{t.addHeading}</h3>
        <Field label={t.translator} htmlFor="languages-translator" hint={t.translatorHint(MACHINE_TRANSLATOR_CREDIT)} className="max-w-md">
          <Input id="languages-translator" value={translator} maxLength={200} onChange={(event) => setTranslator(event.target.value)} />
        </Field>
        {addable.length === 0 ? (
          <p className="text-muted">{t.noneLeft}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {addable.map((language) => (
              <Button key={language} onClick={() => void translate(language)} disabled={working}>
                <Languages aria-hidden="true" className="size-5" />
                {busy?.kind === "translate" && busy.language === language ? t.translating(names[language]) : t.add(names[language])}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {versions.map((version) => {
        const language = version.language;
        const count = narratedCount(book, language);
        const isNarrating = busy?.kind === "narrate" && busy.language === language;
        return (
          <Card key={language} as="section" className="flex flex-col gap-4" aria-label={names[language]}>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="me-auto text-xl font-bold">
                {names[language]}: <span dir={textDirection(language)} lang={language}>{version.title}</span>
              </h3>
              <span className="text-muted" aria-live="polite">
                {isNarrating ? t.narrating(busy.done, busy.total) : t.narratedCount(count.done, count.total)}
              </span>
            </div>
            {version.translator ? <p className="text-sm text-muted">{t.credit(version.translator)}</p> : null}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void narrate(language, false)} disabled={working || count.total === 0}>
                <Mic aria-hidden="true" className="size-5" />
                {t.narrate}
              </Button>
              {count.done > 0 ? (
                <Button variant="outline" onClick={() => void narrate(language, true)} disabled={working}>
                  {t.narrateAgain}
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setEditing(editing === language ? null : language)} disabled={working}>
                <Pencil aria-hidden="true" className="size-5" />
                {editing === language ? t.closeTexts : t.editTexts}
              </Button>
              <Button variant="outline" onClick={() => remove(language)} disabled={working}>
                <Trash2 aria-hidden="true" className="size-5" />
                {t.remove}
              </Button>
            </div>
            <p className="text-sm text-muted">{t.voiceNote}</p>
            {editing === language ? (
              <VersionEditor
                key={`${language}-${book.updatedAt}`}
                book={book}
                language={language}
                disabled={working}
                onSave={async (input) => {
                  setBusy({ kind: "save", language });
                  try {
                    if (!(await ensureSaved())) return onNotice("error", t.saveFirst);
                    take((await saveLanguageVersion(bookId, language, { ...input, translator: version.translator })).book);
                    onNotice("success", t.textsSaved);
                  } catch (err) {
                    fail(err, t.saveFailed);
                  } finally {
                    setBusy(null);
                  }
                }}
              />
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function VersionEditor({
  book,
  language,
  disabled,
  onSave,
}: {
  book: BookWithPages;
  language: BookLanguage;
  disabled: boolean;
  onSave: (input: { title: string; summary: string; pages: string[] }) => void;
}) {
  const locale = useLocale();
  const t = LANGUAGES_PANEL_MESSAGES[locale];
  const version = bookVersions(book).find((v) => v.language === language);
  const dir = textDirection(language);
  const [title, setTitle] = useState(version?.title ?? "");
  const [summary, setSummary] = useState(version?.summary ?? "");
  const [texts, setTexts] = useState(() => book.pages.map((page) => pageVersion(book, page, language)?.text ?? ""));
  const own = textDirection(bookLanguage(book));

  return (
    <div className="flex flex-col gap-4">
      <Field label={t.titleLabel} htmlFor={`version-title-${language}`}>
        <Input id={`version-title-${language}`} dir={dir} lang={language} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t.summaryLabel} htmlFor={`version-summary-${language}`}>
        <Textarea id={`version-summary-${language}`} dir={dir} lang={language} rows={3} maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <ol className="flex flex-col gap-3">
        {book.pages.map((page, i) => (
          <li key={page.index} className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`version-${language}-${i}`} className="text-sm font-semibold text-muted">
                {t.page(i + 1)}
              </label>
              <Textarea
                id={`version-${language}-${i}`}
                dir={dir}
                lang={language}
                rows={Math.max(3, texts[i].split("\n").length + 1)}
                maxLength={5000}
                value={texts[i]}
                onChange={(e) => setTexts((all) => all.map((value, n) => (n === i ? e.target.value : value)))}
                className="font-story text-xl leading-loose"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-muted">{t.source}</p>
              <p dir={own} className="min-h-16 whitespace-pre-line rounded-md bg-surface-2 px-4 py-3 text-lg leading-relaxed">
                {page.text || "—"}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <Button disabled={disabled || !title.trim()} onClick={() => onSave({ title, summary, pages: texts })}>
          {t.saveTexts}
        </Button>
      </div>
    </div>
  );
}

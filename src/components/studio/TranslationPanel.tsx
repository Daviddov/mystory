"use client";

import { Check, Languages } from "lucide-react";
import { useState } from "react";
import { MockNotice } from "@/components/MockNotice";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { MACHINE_TRANSLATOR_CREDIT, missingCreditRoles } from "@/lib/credits";
import { STUDIO_CREDIT_ROLE_LABELS, STUDIO_LANGUAGE_NAMES } from "@/lib/i18n/studio";
import { TRANSLATION_PANEL_MESSAGES } from "@/lib/i18n/studio-panels";
import { mediaUrl } from "@/lib/media/url";
import { MAX_PAGE_TEXT } from "@/lib/studio/shared";
import type { BookLanguage } from "@/lib/types";
import type { EditorMeta, EditorPage } from "./types";

const HEBREW_LETTER = /[א-ת]/;

export interface TranslationPanelProps {
  pages: EditorPage[];
  meta: EditorMeta;
  /** Language the texts are in right now; 'he' once a translation was stored. */
  language: BookLanguage;
  originalLanguage: BookLanguage;
  /** Cache-busting version for media URLs. */
  version?: string;
  /** True after the server answered that no translation service is configured. */
  mockTranslation: boolean;
  /** Zero-based pages the server refused as "not Hebrew yet". */
  flaggedPages: number[];
  onChangePage: (key: string, patch: Partial<EditorPage>) => void;
  onChangeMeta: (patch: Partial<EditorMeta>) => void;
  /** Asks the server to translate the whole book; `translator` may be empty. */
  onTranslate: (translator: string) => void;
  /** Marks a hand-made translation as finished. */
  onAccept: (translator: string) => void;
}

/** The Hebrew a person sees in the right-hand box: empty while the page still holds the original. */
function hebrewValue(page: EditorPage): string {
  if (page.originalText !== undefined && page.text === page.originalText && !HEBREW_LETTER.test(page.text)) return "";
  return page.text;
}

/**
 * Translation workspace of an imported book: one button translates the whole
 * book, and every page shows the original (left, read only) next to the
 * Hebrew (right, editable).
 */
export function TranslationPanel({
  pages,
  meta,
  language,
  originalLanguage,
  version,
  mockTranslation,
  flaggedPages,
  onChangePage,
  onChangeMeta,
  onTranslate,
  onAccept,
}: TranslationPanelProps) {
  const locale = useLocale();
  const t = TRANSLATION_PANEL_MESSAGES[locale];
  const [translator, setTranslator] = useState(meta.credits?.translator ?? "");
  const translated = language === "he";
  const originalName = STUDIO_LANGUAGE_NAMES[locale][originalLanguage];
  const sourcePages = pages.filter((page) => (page.originalText ?? "").trim().length > 0);
  const done = sourcePages.filter((page) => hebrewValue(page).trim().length > 0).length;
  const missingRoles = missingCreditRoles({ author: meta.author, illustrator: meta.illustrator, credits: meta.credits });
  const originalTitle = meta.credits?.originalTitle;

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="me-auto text-2xl font-bold">{t.heading}</h2>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold">
            {translated ? t.markedHebrew : t.stillIn(originalName)}
          </span>
        </div>
        <p className="max-w-3xl text-muted">
          {translated ? t.translatedLead : t.importedLead(originalName)}
        </p>

        <Field
          label={t.translator}
          htmlFor="translation-translator"
          hint={t.translatorHint(MACHINE_TRANSLATOR_CREDIT)}
          className="max-w-md"
        >
          <Input
            id="translation-translator"
            value={translator}
            maxLength={200}
            onChange={(event) => setTranslator(event.target.value)}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => onTranslate(translator.trim())} disabled={sourcePages.length === 0}>
            <Languages aria-hidden="true" className="size-5" />
            {translated ? t.retranslate : t.translate}
          </Button>
          {!translated ? (
            <Button
              variant="outline"
              onClick={() => onAccept(translator.trim())}
              disabled={sourcePages.length === 0 || done < sourcePages.length || translator.trim().length === 0}
            >
              <Check aria-hidden="true" className="size-5" />
              {t.accept}
            </Button>
          ) : null}
          <span className="text-muted" aria-live="polite">
            {t.progress(done, sourcePages.length)}
          </span>
        </div>
        {!translated && sourcePages.length > 0 && (done < sourcePages.length || translator.trim().length === 0) ? (
          <p className="text-sm text-muted">{t.acceptNeeds}</p>
        ) : null}
        {mockTranslation ? <MockNotice kind="translation" /> : null}
        {missingRoles.length > 0 ? (
          <p role="note" className="rounded-md bg-warning-soft px-4 py-3">
            {t.missingCredits(missingRoles.map((role) => STUDIO_CREDIT_ROLE_LABELS[locale][role]).join(", "))}
            {meta.credits?.creators ? (
              <>
                {" "}
                (<bdi dir="ltr">{meta.credits.creators}</bdi>)
              </>
            ) : null}
            {t.missingCreditsEnd}
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="text-xl font-bold">{t.titleAndSummary}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field label={t.hebrewTitle} htmlFor="translation-title">
              <Input
                id="translation-title"
                dir="rtl"
                value={meta.title}
                maxLength={200}
                onChange={(event) => onChangeMeta({ title: event.target.value })}
              />
            </Field>
            <Field label={t.hebrewSummary} htmlFor="translation-summary">
              <Textarea
                id="translation-summary"
                dir="rtl"
                rows={3}
                maxLength={2000}
                value={meta.summary}
                onChange={(event) => onChangeMeta({ summary: event.target.value })}
              />
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-muted">{t.originalTitle}</p>
            <p dir="ltr" lang={originalLanguage} className="rounded-md bg-surface-2 px-4 py-3 text-start text-lg">
              {originalTitle || t.notSaved}
            </p>
          </div>
        </div>
      </Card>

      <ol className="flex flex-col gap-4" aria-label={t.pagesList}>
        {pages.map((page, index) => {
          const image = page.preview ?? mediaUrl(page.image, version);
          const original = page.originalText ?? "";
          const flagged = flaggedPages.includes(index);
          const id = `translation-page-${page.key}`;
          return (
            <li key={page.key}>
              <Card as="article" className="flex flex-col gap-3" aria-labelledby={`${id}-title`}>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 id={`${id}-title`} className="text-lg font-bold">
                    {t.page(index + 1)}
                  </h3>
                  {flagged ? <span className="text-sm font-semibold text-danger">{t.notTranslated}</span> : null}
                </div>
                <div className="flex flex-col gap-4 md:flex-row">
                  {image ? (
                    <figure className="flex w-full shrink-0 flex-col gap-1 md:w-48">
                      <img
                        src={image}
                        alt={page.imageAlt ?? t.pictureAlt(index + 1)}
                        loading="lazy"
                        className="aspect-[4/3] w-full rounded-md border border-border bg-surface-2 object-contain"
                      />
                      {page.imageAlt ? (
                        <figcaption dir="auto" className="text-sm text-muted">
                          {page.imageAlt}
                        </figcaption>
                      ) : null}
                    </figure>
                  ) : null}
                  {/* In a right-to-left row the first box sits on the right: Hebrew right, original left. */}
                  <div className="grid min-w-0 flex-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${id}-he`} className="text-sm font-semibold text-muted">
                        {t.hebrew}
                      </label>
                      <Textarea
                        id={`${id}-he`}
                        dir="rtl"
                        lang="he"
                        rows={Math.max(4, original.split("\n").length + 1)}
                        maxLength={MAX_PAGE_TEXT}
                        value={hebrewValue(page)}
                        placeholder={original ? t.translationPlaceholder : t.noSourceText}
                        aria-invalid={flagged || undefined}
                        // Clearing the box puts the original back, so the page is never stored empty.
                        onChange={(event) => onChangePage(page.key, { text: event.target.value || original })}
                        className="font-story text-xl leading-loose"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p id={`${id}-src-label`} className="text-sm font-semibold text-muted">
                        {t.source(originalName)}
                      </p>
                      <p
                        dir="ltr"
                        lang={originalLanguage}
                        aria-labelledby={`${id}-src-label`}
                        className="min-h-24 flex-1 whitespace-pre-line rounded-md bg-surface-2 px-4 py-3 text-start text-lg leading-relaxed"
                      >
                        {original || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

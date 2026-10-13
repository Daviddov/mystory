"use client";

import { Check, Languages } from "lucide-react";
import { useState } from "react";
import { MockNotice } from "@/components/MockNotice";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { CREDIT_ROLE_LABELS, LANGUAGE_NAMES_HE, MACHINE_TRANSLATOR_CREDIT, missingCreditRoles } from "@/lib/credits";
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
  const [translator, setTranslator] = useState(meta.credits?.translator ?? "");
  const translated = language === "he";
  const originalName = LANGUAGE_NAMES_HE[originalLanguage];
  const sourcePages = pages.filter((page) => (page.originalText ?? "").trim().length > 0);
  const done = sourcePages.filter((page) => hebrewValue(page).trim().length > 0).length;
  const missingRoles = missingCreditRoles({ author: meta.author, illustrator: meta.illustrator, credits: meta.credits });
  const originalTitle = meta.credits?.originalTitle;

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="me-auto text-2xl font-bold">תרגום לעברית</h2>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold">
            {translated ? "הספר מסומן כספר בעברית" : `הספר עדיין ב${originalName}`}
          </span>
        </div>
        <p className="max-w-3xl text-muted">
          {translated
            ? "התרגום נשמר. עברו על כל עמוד מול המקור ותקנו מה שצריך. אחרי שהטקסט סופי, נקדו והקריאו את הספר בלשונית העמודים."
            : `הספר יובא ב${originalName}. אפשר לתרגם את כולו בלחיצה אחת, או לכתוב את התרגום בעצמכם ליד כל עמוד. ספר שלא תורגם לא יכול להתפרסם בספרייה.`}
        </p>

        <Field
          label="שם המתרגם או המתרגמת"
          htmlFor="translation-translator"
          hint={`יופיע בקרדיט של הספר. בלי שם, תרגום אוטומטי ייחתם: ${MACHINE_TRANSLATOR_CREDIT}.`}
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
            {translated ? "תרגם מחדש את כל הספר" : "תרגם לעברית"}
          </Button>
          {!translated ? (
            <Button
              variant="outline"
              onClick={() => onAccept(translator.trim())}
              disabled={sourcePages.length === 0 || done < sourcePages.length || translator.trim().length === 0}
            >
              <Check aria-hidden="true" className="size-5" />
              תרגמתי בעצמי, הספר בעברית
            </Button>
          ) : null}
          <span className="text-muted" aria-live="polite">
            {done} מתוך {sourcePages.length} עמודים בעברית
          </span>
        </div>
        {!translated && sourcePages.length > 0 && (done < sourcePages.length || translator.trim().length === 0) ? (
          <p className="text-sm text-muted">
            כדי לאשר תרגום ידני צריך טקסט בעברית בכל עמוד, שם ספר בעברית ושם מתרגם.
          </p>
        ) : null}
        {mockTranslation ? <MockNotice kind="translation" /> : null}
        {missingRoles.length > 0 ? (
          <p role="note" className="rounded-md bg-warning-soft px-4 py-3">
            חסרים בקרדיט: {missingRoles.map((role) => CREDIT_ROLE_LABELS[role]).join(", ")}. המקור מונה את יוצרי הספר בלי
            לציין מי עשה מה
            {meta.credits?.creators ? (
              <>
                {" "}
                (<bdi dir="ltr">{meta.credits.creators}</bdi>)
              </>
            ) : null}
            . בדקו בעמוד הספר באתר המוציא לאור והשלימו בלשונית &quot;פרטי הספר&quot;.
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="text-xl font-bold">שם הספר ותקציר</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field label="שם הספר בעברית" htmlFor="translation-title">
              <Input
                id="translation-title"
                dir="rtl"
                value={meta.title}
                maxLength={200}
                onChange={(event) => onChangeMeta({ title: event.target.value })}
              />
            </Field>
            <Field label="תקציר בעברית" htmlFor="translation-summary">
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
            <p className="text-sm font-semibold text-muted">השם המקורי של הספר</p>
            <p dir="ltr" lang={originalLanguage} className="rounded-md bg-surface-2 px-4 py-3 text-start text-lg">
              {originalTitle || "לא נשמר"}
            </p>
          </div>
        </div>
      </Card>

      <ol className="flex flex-col gap-4" aria-label="עמודי הספר: מקור מול תרגום">
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
                    עמוד {index + 1}
                  </h3>
                  {flagged ? <span className="text-sm font-semibold text-danger">עדיין לא תורגם</span> : null}
                </div>
                <div className="flex flex-col gap-4 md:flex-row">
                  {image ? (
                    <figure className="flex w-full shrink-0 flex-col gap-1 md:w-48">
                      <img
                        src={image}
                        alt={page.imageAlt ?? `האיור של עמוד ${index + 1}`}
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
                        עברית
                      </label>
                      <Textarea
                        id={`${id}-he`}
                        dir="rtl"
                        lang="he"
                        rows={Math.max(4, original.split("\n").length + 1)}
                        maxLength={MAX_PAGE_TEXT}
                        value={hebrewValue(page)}
                        placeholder={original ? "התרגום של העמוד" : "בעמוד הזה אין טקסט במקור"}
                        aria-invalid={flagged || undefined}
                        // Clearing the box puts the original back, so the page is never stored empty.
                        onChange={(event) => onChangePage(page.key, { text: event.target.value || original })}
                        className="font-story text-xl leading-loose"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p id={`${id}-src-label`} className="text-sm font-semibold text-muted">
                        מקור ({originalName})
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

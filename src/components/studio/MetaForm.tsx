"use client";

import { Plus, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card, Chip, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { mediaUrl } from "@/lib/media/url";
import {
  IMAGE_ACCEPT,
  MAX_CATEGORIES,
  MAX_QUESTION_LENGTH,
  MAX_QUESTIONS,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  MAX_THEMES,
} from "@/lib/studio/shared";
import { AGE_GROUP_INFO, CATEGORIES, STARTER_TAGS, THEMES } from "@/lib/taxonomy";
import type { AgeGroup, BookCredits } from "@/lib/types";
import type { EditorMeta } from "./types";

const LICENSE_SUGGESTIONS = ["כל הזכויות שמורות", "CC BY 4.0", "CC BY-SA 4.0", "CC BY-NC 4.0", "CC0 (נחלת הכלל)"];

export interface MetaFormProps {
  meta: EditorMeta;
  onChange: (patch: Partial<EditorMeta>) => void;
  /** Uploads a cover picture; resolves when it is stored. */
  onCoverFile: (file: File) => Promise<void>;
  /** Media path of the first page picture, offered as a cover. */
  firstPageImage?: string;
  /** Cache-busting version for media URLs. */
  version?: string;
}

/** Credit fields beyond author and illustrator, in the order they are shown. */
const CREDIT_FIELDS: { key: Exclude<keyof BookCredits, "publisherLogo">; label: string; hint?: string; ltr?: boolean; wide?: boolean }[] = [
  { key: "designer", label: "עיצוב" },
  { key: "editor", label: "עריכה" },
  { key: "translator", label: "תרגום לעברית", hint: "מי תרגם את הספר. חובה בספר מתורגם." },
  { key: "creators", label: "יוצרי הספר (בלי חלוקה לתפקידים)", hint: "כשהמקור מונה את היוצרים ברשימה אחת." },
  { key: "originalTitle", label: "השם המקורי של הספר", ltr: true },
  { key: "publisher", label: "המוציא לאור המקורי", hint: "למשל Book Dash.", ltr: true },
  { key: "publisherUrl", label: "אתר המוציא לאור", ltr: true },
  { key: "attributionLine", label: "שורת הייחוס שהרישיון דורש", ltr: true, wide: true },
  { key: "adaptation", label: "מה שונה מהמקור", hint: 'למשל: "Translation into Hebrew by ...".', ltr: true, wide: true },
];

function toggle(list: string[], value: string, max: number): string[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  return list.length >= max ? list : [...list, value];
}

/** Book details: everything a reader sees on the book page and uses to find the book. */
export function MetaForm({ meta, onChange, onCoverFile, firstPageImage, version }: MetaFormProps) {
  const coverInput = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const cover = mediaUrl(meta.coverImage, version);
  const titleMissing = meta.title.trim().length === 0;

  const addTag = (raw: string) => {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    setTagDraft("");
    if (!tag || meta.tags.includes(tag) || meta.tags.length >= MAX_TAGS) return;
    onChange({ tags: [...meta.tags, tag] });
  };

  const setQuestion = (index: number, value: string) => {
    onChange({ discussionQuestions: meta.discussionQuestions.map((q, i) => (i === index ? value : q)) });
  };

  const suggestedTags = STARTER_TAGS.filter((tag) => !meta.tags.includes(tag)).slice(0, 14);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">פרטי הספר</h2>
          <Field
            label="שם הספר"
            htmlFor="meta-title"
            required
            error={titleMissing ? "חסר שם לספר. השם הקודם נשאר שמור עד שתכתבו שם חדש." : undefined}
          >
            <Input
              id="meta-title"
              value={meta.title}
              maxLength={200}
              aria-invalid={titleMissing || undefined}
              onChange={(event) => onChange({ title: event.target.value })}
            />
          </Field>
          <Field label="תקציר" htmlFor="meta-summary" hint="שניים או שלושה משפטים שמספרים על מה הספר.">
            <Textarea
              id="meta-summary"
              rows={3}
              maxLength={2000}
              value={meta.summary}
              onChange={(event) => onChange({ summary: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="כתיבה" htmlFor="meta-author">
              <Input
                id="meta-author"
                value={meta.author}
                maxLength={200}
                onChange={(event) => onChange({ author: event.target.value })}
              />
            </Field>
            <Field label="איור" htmlFor="meta-illustrator">
              <Input
                id="meta-illustrator"
                value={meta.illustrator}
                maxLength={200}
                onChange={(event) => onChange({ illustrator: event.target.value })}
              />
            </Field>
            <Field label="רישיון" htmlFor="meta-license" hint="מי רשאי להשתמש בספר. נדרש לפני הגשה לפרסום.">
              <Input
                id="meta-license"
                list="meta-license-options"
                value={meta.license}
                maxLength={200}
                onChange={(event) => onChange({ license: event.target.value })}
              />
              <datalist id="meta-license-options">
                {LICENSE_SUGGESTIONS.map((license) => (
                  <option key={license} value={license} />
                ))}
              </datalist>
            </Field>
            <Field label="מקור" htmlFor="meta-source" hint="קישור או תיאור, אם הספר מבוסס על מקור אחר.">
              <Input
                id="meta-source"
                value={meta.source}
                maxLength={500}
                onChange={(event) => onChange({ source: event.target.value })}
              />
            </Field>
            <Field label="גיל" htmlFor="meta-age">
              <Select
                id="meta-age"
                value={meta.ageGroup}
                onChange={(event) => onChange({ ageGroup: event.target.value as AgeGroup })}
              >
                {AGE_GROUP_INFO.map((age) => (
                  <option key={age.slug} value={age.slug}>
                    {age.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card as="section" aria-labelledby="meta-credits-title" className="flex flex-col gap-4">
          <div>
            <h2 id="meta-credits-title" className="text-lg font-bold">
              קרדיטים נוספים
            </h2>
            <p className="text-muted">
              לספרים ברישיון Creative Commons ולספרים מתורגמים. מה שממולא כאן מוצג בעמוד הספר, בסוף הקריאה ובהדפסה.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {CREDIT_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                htmlFor={`meta-credit-${field.key}`}
                hint={field.hint}
                className={field.wide ? "sm:col-span-2" : undefined}
              >
                <Input
                  id={`meta-credit-${field.key}`}
                  dir={field.ltr ? "ltr" : "auto"}
                  type={field.key === "publisherUrl" ? "url" : "text"}
                  value={meta.credits?.[field.key] ?? ""}
                  maxLength={field.key === "attributionLine" || field.key === "adaptation" || field.key === "publisherUrl" ? 500 : 200}
                  onChange={(event) => onChange({ credits: { ...meta.credits, [field.key]: event.target.value } })}
                />
              </Field>
            ))}
          </div>
          {meta.credits?.publisherLogo ? (
            <p className="flex items-center gap-3 text-sm text-muted">
              <img
                src={mediaUrl(meta.credits.publisherLogo, version)}
                alt={`הלוגו של ${meta.credits.publisher ?? "המוציא לאור"}`}
                className="h-10 w-auto rounded-sm bg-white p-1"
              />
              הלוגו של המוציא לאור נשמר עם הספר ומוצג בקרדיט.
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-lg font-bold">
              קטגוריות <span className="text-sm font-normal text-muted">(עד {MAX_CATEGORIES})</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <Chip
                  key={category.slug}
                  icon={category.emoji}
                  selected={meta.categories.includes(category.slug)}
                  onClick={() => onChange({ categories: toggle(meta.categories, category.slug, MAX_CATEGORIES) })}
                >
                  {category.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-lg font-bold">
              נושאים לשיחה <span className="text-sm font-normal text-muted">(עד {MAX_THEMES})</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((theme) => (
                <Chip
                  key={theme.slug}
                  icon={theme.emoji}
                  selected={meta.themes.includes(theme.slug)}
                  onClick={() => onChange({ themes: toggle(meta.themes, theme.slug, MAX_THEMES) })}
                >
                  {theme.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Field label="תגיות" htmlFor="meta-tag" hint={`כתבו תגית ולחצו Enter. עד ${MAX_TAGS} תגיות.`}>
              <div className="flex gap-2">
                <Input
                  id="meta-tag"
                  value={tagDraft}
                  maxLength={MAX_TAG_LENGTH}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addTag(tagDraft);
                    }
                  }}
                  aria-describedby="meta-tag-hint"
                />
                <Button variant="outline" onClick={() => addTag(tagDraft)} disabled={tagDraft.trim().length === 0}>
                  הוספה
                </Button>
              </div>
            </Field>
            {meta.tags.length > 0 ? (
              <ul aria-label="התגיות של הספר" className="flex flex-wrap gap-2">
                {meta.tags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => onChange({ tags: meta.tags.filter((item) => item !== tag) })}
                      aria-label={`הסרת התגית ${tag}`}
                      className="inline-flex min-h-10 items-center gap-1 rounded-full bg-primary-soft px-3 font-medium"
                    >
                      {tag}
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {suggestedTags.length > 0 && meta.tags.length < MAX_TAGS ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-muted">הצעות:</span>
                {suggestedTags.map((tag) => (
                  <Chip key={tag} size="sm" onClick={() => addTag(tag)}>
                    {tag}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">שאלות לשיחה אחרי הקריאה</h2>
          {meta.discussionQuestions.length === 0 ? (
            <p className="text-muted">שאלות קצרות שהורה יכול לשאול בסוף הסיפור.</p>
          ) : null}
          <ol className="flex flex-col gap-2">
            {meta.discussionQuestions.map((question, index) => (
              <li key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`שאלה ${index + 1}`}
                  value={question}
                  maxLength={MAX_QUESTION_LENGTH}
                  onChange={(event) => setQuestion(index, event.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`מחיקת שאלה ${index + 1}`}
                  onClick={() =>
                    onChange({ discussionQuestions: meta.discussionQuestions.filter((_q, i) => i !== index) })
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
          {meta.discussionQuestions.length < MAX_QUESTIONS ? (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onChange({ discussionQuestions: [...meta.discussionQuestions, ""] })}
              >
                <Plus aria-hidden="true" className="size-4" />
                הוספת שאלה
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <Card as="aside" className="flex h-fit flex-col gap-3">
        <h2 className="text-lg font-bold">תמונת השער</h2>
        <div className="relative mx-auto aspect-[3/4] w-full max-w-56 overflow-hidden rounded-md border border-border bg-surface-2">
          {cover ? (
            <img src={cover} alt="תמונת השער" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-6xl" aria-hidden="true">
              📖
            </div>
          )}
          {coverBusy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-overlay">
              <Spinner label="מעלה…" />
            </div>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => coverInput.current?.click()} disabled={coverBusy}>
          <Upload aria-hidden="true" className="size-4" />
          {cover ? "החלפת השער" : "העלאת שער"}
        </Button>
        {firstPageImage && firstPageImage !== meta.coverImage ? (
          <Button variant="ghost" size="sm" onClick={() => onChange({ coverImage: firstPageImage })}>
            שימוש באיור של העמוד הראשון
          </Button>
        ) : null}
        {cover ? (
          <Button variant="ghost" size="sm" onClick={() => onChange({ coverImage: "" })}>
            הסרת השער
          </Button>
        ) : (
          <p className="text-sm text-muted">בלי שער, בהגשה לפרסום ייבחר האיור הראשון בספר.</p>
        )}
        <input
          ref={coverInput}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setCoverBusy(true);
            void onCoverFile(file).finally(() => setCoverBusy(false));
          }}
        />
      </Card>
    </div>
  );
}

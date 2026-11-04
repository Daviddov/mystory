"use client";

import { Plus, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Card, Chip, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { taxonomyText } from "@/lib/i18n/messages";
import { META_FORM_MESSAGES } from "@/lib/i18n/studio-panels";
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

/** Credit fields beyond author and illustrator, in the order they are shown. Labels: META_FORM_MESSAGES.credit. */
const CREDIT_FIELDS: { key: Exclude<keyof BookCredits, "publisherLogo">; ltr?: boolean; wide?: boolean }[] = [
  { key: "designer" },
  { key: "editor" },
  { key: "translator" },
  { key: "creators" },
  { key: "originalTitle", ltr: true },
  { key: "publisher", ltr: true },
  { key: "publisherUrl", ltr: true },
  { key: "attributionLine", ltr: true, wide: true },
  { key: "adaptation", ltr: true, wide: true },
];

function toggle(list: string[], value: string, max: number): string[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  return list.length >= max ? list : [...list, value];
}

/** Book details: everything a reader sees on the book page and uses to find the book. */
export function MetaForm({ meta, onChange, onCoverFile, firstPageImage, version }: MetaFormProps) {
  const locale = useLocale();
  const t = META_FORM_MESSAGES[locale];
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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">{t.details}</h2>
          <Field
            label={t.title}
            htmlFor="meta-title"
            required
            error={titleMissing ? t.titleMissing : undefined}
          >
            <Input
              id="meta-title"
              value={meta.title}
              maxLength={200}
              aria-invalid={titleMissing || undefined}
              onChange={(event) => onChange({ title: event.target.value })}
            />
          </Field>
          <Field label={t.summary} htmlFor="meta-summary" hint={t.summaryHint}>
            <Textarea
              id="meta-summary"
              rows={3}
              maxLength={2000}
              value={meta.summary}
              onChange={(event) => onChange({ summary: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.author} htmlFor="meta-author">
              <Input
                id="meta-author"
                value={meta.author}
                maxLength={200}
                onChange={(event) => onChange({ author: event.target.value })}
              />
            </Field>
            <Field label={t.illustrator} htmlFor="meta-illustrator">
              <Input
                id="meta-illustrator"
                value={meta.illustrator}
                maxLength={200}
                onChange={(event) => onChange({ illustrator: event.target.value })}
              />
            </Field>
            <Field label={t.license} htmlFor="meta-license" hint={t.licenseHint}>
              <Input
                id="meta-license"
                list="meta-license-options"
                value={meta.license}
                maxLength={200}
                onChange={(event) => onChange({ license: event.target.value })}
              />
              <datalist id="meta-license-options">
                {t.licenseSuggestions.map((license) => (
                  <option key={license} value={license} />
                ))}
              </datalist>
            </Field>
            <Field label={t.source} htmlFor="meta-source" hint={t.sourceHint}>
              <Input
                id="meta-source"
                value={meta.source}
                maxLength={500}
                onChange={(event) => onChange({ source: event.target.value })}
              />
            </Field>
            <Field label={t.age} htmlFor="meta-age">
              <Select
                id="meta-age"
                value={meta.ageGroup}
                onChange={(event) => onChange({ ageGroup: event.target.value as AgeGroup })}
              >
                {AGE_GROUP_INFO.map((age) => (
                  <option key={age.slug} value={age.slug}>
                    {taxonomyText(locale, "age", age.slug, age).label}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="font-semibold">
                {t.extraAges} <span className="text-sm font-normal text-muted">{t.extraAgesNote}</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {AGE_GROUP_INFO.filter((age) => age.slug !== meta.ageGroup).map((age) => {
                  const extra = meta.extraAgeGroups ?? [];
                  return (
                    <Chip
                      key={age.slug}
                      icon={age.emoji}
                      selected={extra.includes(age.slug)}
                      onClick={() =>
                        onChange({
                          extraAgeGroups: extra.includes(age.slug)
                            ? extra.filter((slug) => slug !== age.slug)
                            : [...extra, age.slug],
                        })
                      }
                    >
                      {taxonomyText(locale, "age", age.slug, age).label}
                    </Chip>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </Card>

        <Card as="section" aria-labelledby="meta-credits-title" className="flex flex-col gap-4">
          <div>
            <h2 id="meta-credits-title" className="text-lg font-bold">
              {t.moreCredits}
            </h2>
            <p className="text-muted">{t.moreCreditsLead}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {CREDIT_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={t.credit[field.key]?.label}
                htmlFor={`meta-credit-${field.key}`}
                hint={t.credit[field.key]?.hint}
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
                alt={t.publisherLogoAlt(meta.credits.publisher)}
                className="h-10 w-auto rounded-sm bg-white p-1"
              />
              {t.publisherLogoNote}
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-lg font-bold">
              {t.categories} <span className="text-sm font-normal text-muted">{t.upTo(MAX_CATEGORIES)}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <Chip
                  key={category.slug}
                  icon={category.emoji}
                  selected={meta.categories.includes(category.slug)}
                  onClick={() => onChange({ categories: toggle(meta.categories, category.slug, MAX_CATEGORIES) })}
                >
                  {taxonomyText(locale, "category", category.slug, category).label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-lg font-bold">
              {t.themes} <span className="text-sm font-normal text-muted">{t.upTo(MAX_THEMES)}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((theme) => (
                <Chip
                  key={theme.slug}
                  icon={theme.emoji}
                  selected={meta.themes.includes(theme.slug)}
                  onClick={() => onChange({ themes: toggle(meta.themes, theme.slug, MAX_THEMES) })}
                >
                  {taxonomyText(locale, "theme", theme.slug, theme).label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Field label={t.tags} htmlFor="meta-tag" hint={t.tagsHint(MAX_TAGS)}>
              <div className="flex gap-2">
                <Input
                  className="min-w-0"
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
                  {t.add}
                </Button>
              </div>
            </Field>
            {meta.tags.length > 0 ? (
              <ul aria-label={t.bookTags} className="flex flex-wrap gap-2">
                {meta.tags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => onChange({ tags: meta.tags.filter((item) => item !== tag) })}
                      aria-label={t.removeTag(tag)}
                      className="inline-flex min-h-10 items-center gap-1 rounded-full bg-primary-soft px-3 font-medium"
                    >
                      {taxonomyText(locale, "tag", tag, { label: tag }).label}
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {suggestedTags.length > 0 && meta.tags.length < MAX_TAGS ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm text-muted">{t.suggestions}</span>
                {suggestedTags.map((tag) => (
                  <Chip key={tag} size="sm" onClick={() => addTag(tag)}>
                    {taxonomyText(locale, "tag", tag, { label: tag }).label}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{t.questions}</h2>
          {meta.discussionQuestions.length === 0 ? (
            <p className="text-muted">{t.questionsLead}</p>
          ) : null}
          <ol className="flex flex-col gap-2">
            {meta.discussionQuestions.map((question, index) => (
              <li key={index} className="flex items-center gap-2">
                <Input
                  aria-label={t.question(index + 1)}
                  value={question}
                  maxLength={MAX_QUESTION_LENGTH}
                  onChange={(event) => setQuestion(index, event.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t.deleteQuestion(index + 1)}
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
                {t.addQuestion}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <Card as="aside" className="flex h-fit flex-col gap-3">
        <h2 className="text-lg font-bold">{t.cover}</h2>
        <div className="relative mx-auto aspect-[3/4] w-full max-w-56 overflow-hidden rounded-md border border-border bg-surface-2">
          {cover ? (
            <img src={cover} alt={t.cover} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-6xl" aria-hidden="true">
              📖
            </div>
          )}
          {coverBusy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-overlay">
              <Spinner label={t.uploading} />
            </div>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => coverInput.current?.click()} disabled={coverBusy}>
          <Upload aria-hidden="true" className="size-4" />
          {cover ? t.replaceCover : t.uploadCover}
        </Button>
        {firstPageImage && firstPageImage !== meta.coverImage ? (
          <Button variant="ghost" size="sm" onClick={() => onChange({ coverImage: firstPageImage })}>
            {t.useFirstPage}
          </Button>
        ) : null}
        {cover ? (
          <Button variant="ghost" size="sm" onClick={() => onChange({ coverImage: "" })}>
            {t.removeCover}
          </Button>
        ) : (
          <p className="text-sm text-muted">{t.noCoverNote}</p>
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

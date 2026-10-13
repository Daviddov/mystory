"use client";

import { Field, Input, Select } from "@/components/ui";
import { CC_LICENSES, getCcLicense } from "@/lib/importers/cc";

export interface CreditValues {
  license: string;
  sourceUrl: string;
  author: string;
  illustrator: string;
  designer: string;
  editor: string;
  translator: string;
  originalTitle: string;
  publisher: string;
  publisherUrl: string;
  attributionLine: string;
  adaptation: string;
  /** Language of the text being uploaded. */
  language: "he" | "en";
}

export const EMPTY_CREDIT: CreditValues = {
  license: "",
  sourceUrl: "",
  author: "",
  illustrator: "",
  designer: "",
  editor: "",
  translator: "",
  originalTitle: "",
  publisher: "",
  publisherUrl: "",
  attributionLine: "",
  adaptation: "",
  language: "he",
};

/** Optional text fields, in the order they are shown. */
const EXTRA_FIELDS: {
  key: "designer" | "editor" | "translator" | "originalTitle" | "publisher" | "publisherUrl" | "attributionLine" | "adaptation";
  label: string;
  hint?: string;
  ltr?: boolean;
  wide?: boolean;
  max: number;
}[] = [
  { key: "designer", label: "מי עיצב", max: 200 },
  { key: "editor", label: "מי ערך", max: 200 },
  { key: "translator", label: "מי תרגם", hint: "אם הטקסט שמעלים הוא תרגום.", max: 200 },
  { key: "originalTitle", label: "השם המקורי של הספר", ltr: true, max: 200 },
  { key: "publisher", label: "המוציא לאור המקורי", hint: "למשל StoryWeaver, Pratham Books או Book Dash.", ltr: true, max: 200 },
  { key: "publisherUrl", label: "אתר המוציא לאור", ltr: true, max: 500 },
  {
    key: "attributionLine",
    label: "שורת הייחוס שהמוציא לאור מבקש",
    hint: "בנוסח המקורי, כפי שהוא מופיע בספר או באתר המקור.",
    ltr: true,
    wide: true,
    max: 500,
  },
  {
    key: "adaptation",
    label: "מה שונה מהמקור",
    hint: 'למשל: "Translation into Hebrew by ...". הרישיונות דורשים לציין שינויים.',
    ltr: true,
    wide: true,
    max: 500,
  },
];

export type CreditErrors = Partial<Record<keyof CreditValues, string>>;

export interface CreditFieldsProps {
  value: CreditValues;
  onChange: (next: CreditValues) => void;
  errors?: CreditErrors;
  disabled?: boolean;
}

/**
 * License, source link and attribution of a Creative Commons book. License,
 * source and author are required; the other credits are optional but should
 * be filled in whenever the source names them.
 */
export function CreditFields({ value, onChange, errors = {}, disabled }: CreditFieldsProps) {
  const set = (key: keyof CreditValues, next: string) => onChange({ ...value, [key]: next });
  const untranslated = value.language !== "he";
  const license = getCcLicense(value.license);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="רישיון" htmlFor="cc-license" required error={errors.license}>
        <Select
          id="cc-license"
          value={value.license}
          disabled={disabled}
          aria-invalid={errors.license ? true : undefined}
          onChange={(event) => set("license", event.target.value)}
        >
          <option value="">בחרו רישיון…</option>
          {CC_LICENSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="קישור למקור"
        htmlFor="cc-source"
        required
        error={errors.sourceUrl}
        hint="כתובת העמוד שממנו נלקח הספר."
      >
        <Input
          id="cc-source"
          type="url"
          dir="ltr"
          inputMode="url"
          placeholder="https://"
          value={value.sourceUrl}
          disabled={disabled}
          maxLength={500}
          aria-invalid={errors.sourceUrl ? true : undefined}
          onChange={(event) => set("sourceUrl", event.target.value)}
        />
      </Field>
      <Field
        label="קרדיט: מי כתב את הספר"
        htmlFor="cc-author"
        required
        error={errors.author}
        hint="השם כפי שהוא מופיע במקור."
      >
        <Input
          id="cc-author"
          dir="auto"
          value={value.author}
          disabled={disabled}
          maxLength={200}
          aria-invalid={errors.author ? true : undefined}
          onChange={(event) => set("author", event.target.value)}
        />
      </Field>
      <Field label="מי אייר" htmlFor="cc-illustrator" error={errors.illustrator}>
        <Input
          id="cc-illustrator"
          dir="auto"
          value={value.illustrator}
          disabled={disabled}
          maxLength={200}
          onChange={(event) => set("illustrator", event.target.value)}
        />
      </Field>
      {EXTRA_FIELDS.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          htmlFor={`cc-${field.key}`}
          hint={field.hint}
          error={errors[field.key]}
          className={field.wide ? "sm:col-span-2" : undefined}
        >
          <Input
            id={`cc-${field.key}`}
            dir={field.ltr ? "ltr" : "auto"}
            type={field.key === "publisherUrl" ? "url" : "text"}
            inputMode={field.key === "publisherUrl" ? "url" : undefined}
            placeholder={field.key === "publisherUrl" ? "https://" : undefined}
            value={value[field.key]}
            disabled={disabled}
            maxLength={field.max}
            aria-invalid={errors[field.key] ? true : undefined}
            onChange={(event) => set(field.key, event.target.value)}
          />
        </Field>
      ))}
      <Field
        label="שפת הטקסט שמעלים"
        htmlFor="cc-language"
        hint="ספר שאינו בעברית נשמר כטיוטה, ומתרגמים אותו בעורך לפני שאפשר לפרסם."
      >
        <Select
          id="cc-language"
          value={value.language}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, language: event.target.value === "en" ? "en" : "he" })}
        >
          <option value="he">עברית</option>
          <option value="en">אנגלית (יתורגם בעורך)</option>
        </Select>
      </Field>
      {untranslated && license && !license.allowsAdaptation ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-base sm:col-span-2">
          הרישיון שנבחר אוסר יצירות נגזרות, ותרגום הוא יצירה נגזרת. ספר כזה באנגלית לא יוכל להתפרסם בספרייה.
        </p>
      ) : null}
      {license && !license.allowsAdaptation ? (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3 text-base sm:col-span-2">
          הרישיון הזה לא מתיר יצירות נגזרות. מותר להציג את הספר כמו שהוא, אבל אסור לתרגם או לשנות אותו.
        </p>
      ) : null}
    </div>
  );
}

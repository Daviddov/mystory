"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { Field, Input, Select } from "@/components/ui";
import { CC_LICENSE_LABELS_EN, STUDIO_CREDIT_FIELDS } from "@/lib/i18n/studio-import";
import { CC_LICENSES, getCcLicense } from "@/lib/importers/cc";
import { BookLanguageSchema, type BookLanguage } from "@/lib/types";

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
  language: BookLanguage;
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
  ltr?: boolean;
  wide?: boolean;
  max: number;
}[] = [
  { key: "designer", max: 200 },
  { key: "editor", max: 200 },
  { key: "translator", max: 200 },
  { key: "originalTitle", ltr: true, max: 200 },
  { key: "publisher", ltr: true, max: 200 },
  { key: "publisherUrl", ltr: true, max: 500 },
  {
    key: "attributionLine",
    ltr: true,
    wide: true,
    max: 500,
  },
  {
    key: "adaptation",
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
  const locale = useLocale();
  const t = STUDIO_CREDIT_FIELDS[locale];
  const set = (key: keyof CreditValues, next: string) => onChange({ ...value, [key]: next });
  const untranslated = value.language === "en";
  const license = getCcLicense(value.license);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.license} htmlFor="cc-license" required error={errors.license}>
        <Select
          id="cc-license"
          value={value.license}
          disabled={disabled}
          aria-invalid={errors.license ? true : undefined}
          onChange={(event) => set("license", event.target.value)}
        >
          <option value="">{t.chooseLicense}</option>
          {CC_LICENSES.map((item) => (
            <option key={item.value} value={item.value}>
              {locale === "en" ? (CC_LICENSE_LABELS_EN[item.value] ?? item.value) : item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t.sourceUrl}
        htmlFor="cc-source"
        required
        error={errors.sourceUrl}
        hint={t.sourceHint}
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
        label={t.author}
        htmlFor="cc-author"
        required
        error={errors.author}
        hint={t.authorHint}
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
      <Field label={t.illustrator} htmlFor="cc-illustrator" error={errors.illustrator}>
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
          label={t.extra[field.key].label}
          htmlFor={`cc-${field.key}`}
          hint={t.extra[field.key].hint}
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
        label={t.language}
        htmlFor="cc-language"
        hint={t.languageHint}
      >
        <Select
          id="cc-language"
          value={value.language}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, language: BookLanguageSchema.catch("he").parse(event.target.value) })}
        >
          <option value="he">{t.langHe}</option>
          <option value="en">{t.langEn}</option>
          <option value="ar">{t.langAr}</option>
        </Select>
      </Field>
      {untranslated && license && !license.allowsAdaptation ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-base sm:col-span-2">
          {t.noDerivativesEnglish}
        </p>
      ) : null}
      {license && !license.allowsAdaptation ? (
        <p role="note" className="rounded-md bg-warning-soft px-4 py-3 text-base sm:col-span-2">
          {t.noDerivatives}
        </p>
      ) : null}
    </div>
  );
}

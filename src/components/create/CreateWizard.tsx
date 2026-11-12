"use client";

/**
 * The AI creation wizard: (1) the child, (2) the story idea, (3) age group,
 * category and illustration style, (4) live progress and the finished book.
 *
 * The optional photo lives only in this component's state until it is posted;
 * it is dropped from state as soon as the request has been sent.
 */
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { BookOpen, Camera, Check, Pencil, Sparkles, Trash2 } from "lucide-react";
import { MockNotice } from "@/components/MockNotice";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, ButtonLink, Card, Chip, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { INPUT_LIMITS, PHOTO_LIMITS, type ChildGender, type WizardInputDraft } from "@/lib/generation/input";
import {
  HOBBY_SUGGESTIONS,
  IDEA_SUGGESTIONS,
  STORY_MOODS,
  STORY_STYLES,
  type StoryMood,
  type StoryStyle,
} from "@/lib/generation/options";
import {
  accountMessages,
  hobbyLabel,
  ideaSuggestion,
  jobStepLabel,
  moodText,
  styleLabel,
  type AccountMessages,
} from "@/lib/i18n/account";
import type { Locale } from "@/lib/i18n/locale";
import { taxonomyText } from "@/lib/i18n/messages";
import { STUDIO_LANGUAGE_NAMES } from "@/lib/i18n/studio";
import { findServerMessage, hasHebrew, showServerMessage } from "@/lib/i18n/server-errors";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import { AGE_GROUP_INFO, CATEGORIES } from "@/lib/taxonomy";
import { BOOK_LANGUAGES, type AgeGroup, type BookLanguage, type JobStatus } from "@/lib/types";

export interface WizardMockFlags {
  text: boolean;
  image: boolean;
  tts: boolean;
}

export interface WizardStepInfo {
  step: string;
  label: string;
}

export interface CreateWizardProps {
  /** A job of this user that is still running: the wizard opens on the progress screen. */
  activeJobId?: string;
  /** Line about the weekly quota in the interface language, shown under the title. */
  quotaLine: string;
  mock: WizardMockFlags;
  /** Pipeline steps in order, for the progress list (labels in the interface language). */
  steps: WizardStepInfo[];
}

/** Mirror of JobView in src/lib/generation/server.ts (a server-only module). */
interface JobView {
  id: string;
  status: JobStatus;
  step: string;
  progress: number;
  message: string;
  error?: string;
  usedMock: boolean;
  mock: { text: boolean; image: boolean; tts: boolean; nikud: boolean };
  book?: { id: string; slug: string; title: string; coverImage: string; updatedAt: string; pageCount: number };
}

const POLL_MS = 1500;

function ageGroupForAge(age: number | undefined): AgeGroup {
  if (age === undefined) return "3-5";
  if (age <= 2) return "0-2";
  if (age <= 5) return "3-5";
  return "6-8";
}

type WizardMessages = AccountMessages["wizard"];

function Stepper({ current, t }: { current: number; t: WizardMessages }) {
  return (
    <ol className="flex items-center justify-between gap-2" aria-label={t.stepsAria}>
      {t.steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
          >
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-full text-base font-bold",
                done && "bg-success-soft text-foreground",
                active && "bg-primary text-primary-foreground shadow-card",
                !done && !active && "bg-surface-2 text-muted",
              )}
            >
              {done ? <Check aria-hidden="true" className="size-5" /> : index + 1}
            </span>
            <span className={cn("truncate text-sm", active ? "font-semibold text-foreground" : "text-muted")}>
              {label}
              {done ? <span className="sr-only">{t.completed}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The message shown when /api/generate refuses. The API answers in Hebrew, so
 * in English the message is chosen by status.
 */
function submitErrorText(locale: Locale, t: WizardMessages, status: number, error: string | undefined): string {
  if (locale === "he") return error ?? t.somethingWrong;
  const translated = error ? findServerMessage(locale, error) : undefined;
  if (translated) return translated;
  if (error && !hasHebrew(error)) return error;
  if (status === 413) return t.photoSize;
  if (status === 400) return t.badInput;
  if (status === 429) return t.quotaReached;
  return t.somethingWrong;
}

function ChoiceCard({
  selected,
  onSelect,
  emoji,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  emoji: string;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-touch-lg flex-col items-center gap-1 rounded-lg border-2 bg-surface p-4 text-center transition-colors",
        selected ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2",
      )}
    >
      <span aria-hidden="true" className="text-3xl">
        {emoji}
      </span>
      <span className="text-base font-semibold text-foreground">{title}</span>
      {description ? <span className="text-sm text-muted">{description}</span> : null}
    </button>
  );
}

export function CreateWizard({ activeJobId, quotaLine, mock, steps }: CreateWizardProps) {
  const locale = useLocale();
  const t = accountMessages(locale).wizard;
  const [step, setStep] = useState(activeJobId ? 3 : 0);

  // Step 1
  const [childName, setChildName] = useState("");
  const [childGender, setChildGender] = useState<ChildGender | null>(null);
  const [childAge, setChildAge] = useState("");
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [hobbyDraft, setHobbyDraft] = useState("");
  const [appearance, setAppearance] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  // Step 2
  const [idea, setIdea] = useState("");
  const [mood, setMood] = useState<StoryMood | null>(null);
  const [dedication, setDedication] = useState("");
  // Step 3
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [language, setLanguage] = useState<BookLanguage>("he");
  const [category, setCategory] = useState<string>("adventures");
  const [style, setStyle] = useState<StoryStyle>("storybook-cartoon");
  // Step 4
  const [jobId, setJobId] = useState<string | null>(activeJobId ?? null);
  const [job, setJob] = useState<JobView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [connectionLost, setConnectionLost] = useState(false);

  const [showErrors, setShowErrors] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  // Move focus to the step heading when the step changes (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  // The preview is a local object URL; the photo itself goes nowhere until submit.
  const previewUrlRef = useRef<string | null>(null);
  const replacePreview = (file: File | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = file ? URL.createObjectURL(file) : null;
    setPhotoPreview(previewUrlRef.current);
  };
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  // Poll the job while it is running.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/generate/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401) {
          window.location.assign(routes.login(routes.create()));
          return;
        }
        if (response.status === 404) {
          setJob(null);
          setJobId(null);
          setSubmitError(t.jobNotFound);
          setStep(2);
          return;
        }
        if (!response.ok) throw new Error(`status ${response.status}`);
        const view = (await response.json()) as JobView;
        if (cancelled) return;
        failures = 0;
        setConnectionLost(false);
        setJob(view);
        if (view.status === "done" || view.status === "failed") return;
      } catch {
        if (cancelled) return;
        failures++;
        if (failures >= 3) setConnectionLost(true);
      }
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, t.jobNotFound]);

  const age = childAge === "" ? undefined : Number(childAge);
  const effectiveAgeGroup = ageGroup ?? ageGroupForAge(age);

  const nameError = childName.trim() === "" ? t.nameError : "";
  const genderError = childGender === null ? t.genderError : "";
  const ideaError = idea.trim().length < INPUT_LIMITS.ideaMin ? t.ideaError : "";

  const toggleHobby = (hobby: string) => {
    setHobbies((current) =>
      current.includes(hobby)
        ? current.filter((item) => item !== hobby)
        : current.length >= INPUT_LIMITS.hobbies
          ? current
          : [...current, hobby],
    );
  };

  const addHobbyDraft = () => {
    const value = hobbyDraft.trim().slice(0, INPUT_LIMITS.hobby);
    if (value && !hobbies.includes(value) && hobbies.length < INPUT_LIMITS.hobbies) {
      setHobbies((current) => [...current, value]);
    }
    setHobbyDraft("");
  };

  const choosePhoto = (file: File | undefined) => {
    setPhotoError("");
    if (!file) return;
    if (!(PHOTO_LIMITS.contentTypes as readonly string[]).includes(file.type)) {
      setPhotoError(t.photoType);
      return;
    }
    if (file.size > PHOTO_LIMITS.maxBytes) {
      setPhotoError(t.photoSize);
      return;
    }
    setPhoto(file);
    replacePreview(file);
  };

  const removePhoto = () => {
    setPhoto(null);
    replacePreview(null);
    setPhotoError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const goNext = () => {
    const invalid = (step === 0 && (nameError || genderError)) || (step === 1 && ideaError);
    if (invalid) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((current) => Math.min(current + 1, 2));
  };

  const submit = async () => {
    if (!childGender) return;
    setSubmitting(true);
    setSubmitError("");
    const input: WizardInputDraft = {
      childName,
      childGender,
      ...(age !== undefined ? { childAge: age } : {}),
      hobbies,
      appearance: photo ? "" : appearance,
      idea,
      ...(mood ? { mood } : {}),
      ...(dedication.trim() ? { dedication } : {}),
      ageGroup: effectiveAgeGroup,
      ...(language !== "he" ? { language } : {}),
      category,
      style,
    };
    const body = new FormData();
    body.set("input", JSON.stringify(input));
    if (photo) body.set("photo", photo);
    try {
      const response = await fetch("/api/generate", { method: "POST", body });
      const data = (await response.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
        details?: { jobId?: string };
      };
      if (response.status === 401) {
        window.location.assign(routes.login(routes.create()));
        return;
      }
      const startedJobId = response.ok ? data.jobId : response.status === 409 ? data.details?.jobId : undefined;
      if (startedJobId) {
        // The photo has been sent; do not keep it in the browser either.
        removePhoto();
        setJob(null);
        setJobId(startedJobId);
        setStep(3);
        return;
      }
      setSubmitError(submitErrorText(locale, t, response.status, data.error));
    } catch {
      setSubmitError(t.noServer);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitForm = (event: FormEvent) => {
    event.preventDefault();
    if (step < 2) goNext();
    else void submit();
  };

  const tryAgain = () => {
    setJob(null);
    setJobId(null);
    setSubmitError("");
    setStep(2);
  };

  const demoMode = mock.text || mock.image;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{t.title}</h1>
        <p className="text-lg text-muted">{t.intro}</p>
        {quotaLine ? <p className="text-sm text-muted">{quotaLine}</p> : null}
      </header>

      {demoMode ? (
        <MockNotice>
          {mock.text && mock.image ? t.mockBoth : mock.text ? t.mockText : t.mockImage}
        </MockNotice>
      ) : null}

      <Stepper current={step} t={t} />

      {step < 3 ? (
        <form onSubmit={onSubmitForm} noValidate>
        <Card padding="lg" className="flex flex-col gap-6">
          {step === 0 ? (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
                {t.whoTitle}
              </h2>
              <Field
                label={t.firstName}
                htmlFor="child-name"
                required
                error={showErrors ? nameError : undefined}
                hint={t.firstNameHint}
              >
                <Input
                  id="child-name"
                  dir="auto"
                  value={childName}
                  onChange={(event) => setChildName(event.target.value)}
                  maxLength={INPUT_LIMITS.childName}
                  autoComplete="off"
                  aria-invalid={showErrors && nameError ? true : undefined}
                  aria-describedby={showErrors && nameError ? "child-name-error" : "child-name-hint"}
                />
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">
                  {t.writtenAbout}
                  <span className="text-danger" aria-hidden="true">
                    {" *"}
                  </span>
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <ChoiceCard selected={childGender === "boy"} onSelect={() => setChildGender("boy")} emoji="👦" title={t.boy} />
                  <ChoiceCard selected={childGender === "girl"} onSelect={() => setChildGender("girl")} emoji="👧" title={t.girl} />
                </div>
                {showErrors && genderError ? (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {genderError}
                  </p>
                ) : null}
              </fieldset>

              <Field label={t.age} htmlFor="child-age" hint={t.ageHint}>
                <Select
                  id="child-age"
                  value={childAge}
                  onChange={(event) => {
                    setChildAge(event.target.value);
                    setAgeGroup(null);
                  }}
                  aria-describedby="child-age-hint"
                >
                  <option value="">{t.anyAge}</option>
                  <option value="0">{t.underOne}</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">
                  {t.hobbies} <span className="font-normal text-muted">{t.upTo(INPUT_LIMITS.hobbies)}</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set([...HOBBY_SUGGESTIONS, ...hobbies])).map((hobby) => (
                    <Chip key={hobby} onClick={() => toggleHobby(hobby)} selected={hobbies.includes(hobby)}>
                      <bdi dir="auto">{hobbyLabel(locale, hobby)}</bdi>
                    </Chip>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    className="min-w-0"
                    dir="auto"
                    aria-label={t.otherHobbyAria}
                    placeholder={t.otherHobby}
                    value={hobbyDraft}
                    maxLength={INPUT_LIMITS.hobby}
                    onChange={(event) => setHobbyDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addHobbyDraft();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={addHobbyDraft}
                    disabled={hobbyDraft.trim() === "" || hobbies.length >= INPUT_LIMITS.hobbies}
                  >
                    {t.add}
                  </Button>
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1.5 text-base font-semibold text-foreground">
                  {t.looks} <span className="font-normal text-muted">{t.optional}</span>
                </legend>
                {photoPreview ? (
                  <div className="flex items-center gap-4 rounded-lg bg-surface-2 p-3">
                    <img src={photoPreview} alt={t.chosenPhoto} className="size-20 rounded-md object-cover" />
                    <p className="flex-1 text-sm text-muted">{t.photoSentOnSubmit}</p>
                    <Button variant="ghost" size="icon" aria-label={t.removePhoto} onClick={removePhoto}>
                      <Trash2 aria-hidden="true" className="size-5" />
                    </Button>
                  </div>
                ) : (
                  <Textarea
                    aria-label={t.appearanceAria}
                    dir="auto"
                    rows={2}
                    placeholder={t.appearancePlaceholder}
                    value={appearance}
                    maxLength={INPUT_LIMITS.appearance}
                    onChange={(event) => setAppearance(event.target.value)}
                  />
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    id="child-photo"
                    type="file"
                    accept={PHOTO_LIMITS.contentTypes.join(",")}
                    className="sr-only"
                    onChange={(event) => choosePhoto(event.target.files?.[0])}
                  />
                  {!photoPreview ? (
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                      <Camera aria-hidden="true" className="size-5" />
                      {t.uploadPhoto}
                    </Button>
                  ) : null}
                </div>
                {photoError ? (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {photoError}
                  </p>
                ) : null}
                <p className="text-sm text-muted">
                  {mock.text ? t.photoMock : t.photoPrivacy}
                </p>
              </fieldset>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
                {t.whatTitle}
              </h2>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">{t.mood}</legend>
                <div className="flex flex-wrap gap-2">
                  {STORY_MOODS.map((item) => {
                    const text = moodText(locale, item.slug, item);
                    return (
                      <Chip
                        key={item.slug}
                        tone="accent"
                        selected={mood === item.slug}
                        onClick={() => {
                          if (mood === item.slug) {
                            setMood(null);
                            return;
                          }
                          const previous = STORY_MOODS.find((m) => m.slug === mood);
                          const previousIdea = previous ? moodText(locale, previous.slug, previous).idea : undefined;
                          setMood(item.slug);
                          // Seeds the idea box, but never overwrites something the parent wrote.
                          if (idea.trim() === "" || idea === previousIdea) setIdea(text.idea);
                        }}
                      >
                        <span aria-hidden="true">{item.emoji}</span> {text.label}
                      </Chip>
                    );
                  })}
                </div>
              </fieldset>
              <Field
                label={t.idea}
                htmlFor="story-idea"
                required
                error={showErrors ? ideaError : undefined}
                hint={t.ideaCount(idea.length, INPUT_LIMITS.idea)}
              >
                <Textarea
                  id="story-idea"
                  dir="auto"
                  rows={3}
                  value={idea}
                  maxLength={INPUT_LIMITS.idea}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder={t.ideaPlaceholder}
                  aria-invalid={showErrors && ideaError ? true : undefined}
                  aria-describedby={showErrors && ideaError ? "story-idea-error" : "story-idea-hint"}
                />
              </Field>
              <div className="flex flex-col gap-2">
                <p className="text-base font-semibold text-foreground">{t.needIdea}</p>
                <div className="flex flex-wrap gap-2">
                  {IDEA_SUGGESTIONS.map((hebrew) => {
                    const suggestion = ideaSuggestion(locale, hebrew);
                    return (
                      <Chip
                        key={hebrew}
                        tone="accent"
                        selected={idea === suggestion}
                        onClick={() => setIdea(suggestion)}
                        className="whitespace-normal py-2 text-start"
                      >
                        {suggestion}
                      </Chip>
                    );
                  })}
                </div>
              </div>
              <Field
                label={t.dedication}
                htmlFor="book-dedication"
                hint={t.dedicationHint}
              >
                <Input
                  id="book-dedication"
                  dir="auto"
                  value={dedication}
                  onChange={(event) => setDedication(event.target.value)}
                  maxLength={INPUT_LIMITS.dedication}
                  autoComplete="off"
                />
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
                {t.lookTitle}
              </h2>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">{t.forWhom}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {AGE_GROUP_INFO.map((group) => {
                    const text = taxonomyText(locale, "age", group.slug, group);
                    return (
                      <ChoiceCard
                        key={group.slug}
                        selected={effectiveAgeGroup === group.slug}
                        onSelect={() => setAgeGroup(group.slug)}
                        emoji={group.emoji}
                        title={text.label}
                        description={text.description}
                      />
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">{t.languageLegend}</legend>
                <div className="flex flex-wrap gap-2">
                  {BOOK_LANGUAGES.map((item) => (
                    <Chip key={item} selected={language === item} onClick={() => setLanguage(item)}>
                      {STUDIO_LANGUAGE_NAMES[locale][item]}
                    </Chip>
                  ))}
                </div>
                <p className="text-sm text-muted">{t.languageHint}</p>
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">{t.kind}</legend>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((item) => (
                    <Chip
                      key={item.slug}
                      icon={item.emoji}
                      selected={category === item.slug}
                      onClick={() => setCategory(item.slug)}
                    >
                      {taxonomyText(locale, "category", item.slug, item).label}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">{t.style}</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {STORY_STYLES.map((item) => (
                    <ChoiceCard
                      key={item.slug}
                      selected={style === item.slug}
                      onSelect={() => setStyle(item.slug)}
                      emoji={item.emoji}
                      title={styleLabel(locale, item.slug, item.label)}
                    />
                  ))}
                </div>
              </fieldset>
              {submitError ? (
                <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-base text-foreground">
                  {submitError}
                </p>
              ) : null}
            </>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep((current) => current - 1)} disabled={submitting}>
                {t.previous}
              </Button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              <Button type="submit" size="lg">
                {t.next}
              </Button>
            ) : (
              <Button type="submit" size="lg" loading={submitting}>
                <Sparkles aria-hidden="true" className="size-5" />
                {t.create}
              </Button>
            )}
          </div>
        </Card>
        </form>
      ) : (
        <ProgressPanel
          job={job}
          steps={steps}
          connectionLost={connectionLost}
          headingRef={headingRef}
          onTryAgain={tryAgain}
          locale={locale}
          t={t}
        />
      )}
    </div>
  );
}

function ProgressPanel({
  job,
  steps,
  connectionLost,
  headingRef,
  onTryAgain,
  locale,
  t,
}: {
  job: JobView | null;
  steps: WizardStepInfo[];
  connectionLost: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onTryAgain: () => void;
  locale: Locale;
  t: WizardMessages;
}) {
  if (job?.status === "failed") {
    return (
      <Card padding="lg" className="flex flex-col items-center gap-4 text-center">
        <span aria-hidden="true" className="text-5xl">
          🌧️
        </span>
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
          {t.failedTitle}
        </h2>
        <p role="alert" className="text-lg text-muted">
          {locale === "he" ? (job.error ?? t.somethingWrong) : showServerMessage(locale, job.error, t.somethingWrong)}
        </p>
        <Button size="lg" onClick={onTryAgain}>
          {t.tryAgain}
        </Button>
      </Card>
    );
  }

  if (job?.status === "done" && job.book) {
    const book = job.book;
    const cover = mediaUrl(book.coverImage, book.updatedAt);
    const notes = (job.message ?? "").replace(/^הספר מוכן!\s*/, "");
    const readyNotes = notes ? (locale === "he" ? notes : findServerMessage(locale, notes)) : undefined;
    return (
      <Card padding="lg" className="flex flex-col items-center gap-5 text-center">
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
          {t.readyTitle}
        </h2>
        {cover ? (
          <img
            src={cover}
            alt={t.coverAlt(book.title)}
            className="aspect-[3/4] w-48 rounded-lg object-cover shadow-pop"
          />
        ) : null}
        <p className="font-story text-2xl text-foreground" dir="auto">
          {book.title}
        </p>
        <p className="text-base text-muted">
          {t.readyText(book.pageCount)}
        </p>
        {/* The server's extra notes, written in Hebrew; English shows them only when they are known. */}
        {readyNotes ? <p className="text-sm text-muted">{readyNotes}</p> : null}
        {job.usedMock ? (
          <div className="flex w-full flex-col gap-2 text-start">
            {job.mock.text ? <MockNotice kind="text" /> : null}
            {job.mock.image ? <MockNotice kind="image" /> : null}
          </div>
        ) : null}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <ButtonLink href={routes.read(book.slug)} size="lg">
            <BookOpen aria-hidden="true" className="size-6" />
            {t.read}
          </ButtonLink>
          <ButtonLink href={routes.studioBook(book.id)} variant="outline">
            <Pencil aria-hidden="true" className="size-5" />
            {t.editInStudio}
          </ButtonLink>
        </div>
      </Card>
    );
  }

  if (job?.status === "done") {
    return (
      <Card padding="lg" className="flex flex-col items-center gap-4 text-center">
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
          {t.lostTitle}
        </h2>
        <p className="text-lg text-muted">{t.lostText}</p>
        <ButtonLink href={routes.studio()} variant="outline">
          {t.toStudio}
        </ButtonLink>
      </Card>
    );
  }

  const progress = Math.round(job?.progress ?? 0);
  const currentIndex = job ? steps.findIndex((item) => item.step === job.step) : -1;
  // "revise" is not in the list; it happens between review and character.
  const reviewIndex = steps.findIndex((item) => item.step === "review");
  const activeIndex = job?.step === "revise" ? reviewIndex : currentIndex;

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <h2 ref={headingRef} tabIndex={-1} className="text-center text-2xl font-bold text-foreground outline-none">
        {t.preparing}
      </h2>
      <div
        role="progressbar"
        aria-label={t.progressAria}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-4 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${Math.max(3, progress)}%` }}
        />
      </div>
      <p aria-live="polite" className="flex items-center justify-center gap-2 text-center text-lg text-foreground">
        <Spinner size="sm" label="" />
        <span>
          {(job
            ? locale === "he"
              ? job.message
              : (findServerMessage(locale, job.message) ?? jobStepLabel(locale, job.step, ""))
            : "") || t.starting}
        </span>
      </p>
      <ol className="flex flex-col gap-2">
        {steps.map((item, index) => {
          const done = activeIndex > index;
          const active = activeIndex === index;
          return (
            <li
              key={item.step}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-base",
                active ? "bg-primary-soft font-semibold text-foreground" : done ? "text-foreground" : "text-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                  done ? "bg-success-soft" : "bg-surface-2",
                )}
              >
                {done ? <Check className="size-4" /> : index + 1}
              </span>
              <span>
                {item.label}
                {done ? <span className="sr-only">{t.completed}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-sm text-muted">
        {t.takesMinutes}
      </p>
      {connectionLost ? (
        <p role="status" className="rounded-md bg-warning-soft px-4 py-3 text-center text-base text-foreground">
          {t.connectionLost}
        </p>
      ) : null}
    </Card>
  );
}

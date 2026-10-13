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
import { Button, ButtonLink, Card, Chip, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { INPUT_LIMITS, PHOTO_LIMITS, type ChildGender, type WizardInputDraft } from "@/lib/generation/input";
import { HOBBY_SUGGESTIONS, IDEA_SUGGESTIONS, STORY_STYLES, type StoryStyle } from "@/lib/generation/options";
import { mediaUrl } from "@/lib/media/url";
import { routes } from "@/lib/routes";
import { AGE_GROUP_INFO, CATEGORIES } from "@/lib/taxonomy";
import type { AgeGroup, JobStatus } from "@/lib/types";

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
  /** Hebrew line about the weekly quota, shown under the title. */
  quotaLine: string;
  mock: WizardMockFlags;
  /** Pipeline steps in order, for the progress list. */
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

const WIZARD_STEPS = ["הילד או הילדה", "הרעיון", "הסגנון", "הספר"] as const;
const POLL_MS = 1500;

function ageGroupForAge(age: number | undefined): AgeGroup {
  if (age === undefined) return "3-5";
  if (age <= 2) return "0-2";
  if (age <= 5) return "3-5";
  return "6-8";
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center justify-between gap-2" aria-label="שלבי היצירה">
      {WIZARD_STEPS.map((label, index) => {
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
              {done ? <span className="sr-only"> (הושלם)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
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
  // Step 3
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [category, setCategory] = useState<string>("adventures");
  const [style, setStyle] = useState<StoryStyle>("watercolor");
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
          setSubmitError("לא מצאנו את הספר שבהכנה. אפשר להתחיל מחדש.");
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
  }, [jobId]);

  const age = childAge === "" ? undefined : Number(childAge);
  const effectiveAgeGroup = ageGroup ?? ageGroupForAge(age);

  const nameError = childName.trim() === "" ? "איך קוראים לגיבור או לגיבורה של הסיפור?" : "";
  const genderError = childGender === null ? "בחרו בן או בת, כדי שהסיפור ייכתב בלשון הנכונה." : "";
  const ideaError = idea.trim().length < INPUT_LIMITS.ideaMin ? "כתבו כמה מילים על הסיפור, או בחרו רעיון מהרשימה." : "";

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
      setPhotoError("אפשר להעלות רק תמונה מסוג JPEG, PNG או WebP.");
      return;
    }
    if (file.size > PHOTO_LIMITS.maxBytes) {
      setPhotoError("התמונה גדולה מדי. אפשר להעלות תמונה עד 5 מ״ב.");
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
      ageGroup: effectiveAgeGroup,
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
      setSubmitError(data.error ?? "משהו השתבש. נסו שוב בעוד רגע.");
    } catch {
      setSubmitError("אין חיבור לשרת. בדקו את החיבור ונסו שוב.");
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
        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">יוצרים ספר אישי</h1>
        <p className="text-lg text-muted">ארבעה צעדים קצרים, והילד או הילדה שלכם הופכים לגיבורי סיפור מאויר.</p>
        {quotaLine ? <p className="text-sm text-muted">{quotaLine}</p> : null}
      </header>

      {demoMode ? (
        <MockNotice>
          {mock.text && mock.image
            ? "מצב הדגמה: שירותי הכתיבה והאיור לא מחוברים. ייווצר סיפור קבוע לדוגמה עם השם שתבחרו ועם איורים זמניים, והרעיון שתכתבו לא ישולב בו. גם ספר לדוגמה נספר במכסה השבועית."
            : mock.text
              ? "מצב הדגמה: שירות הכתיבה לא מחובר. ייווצר סיפור קבוע לדוגמה עם השם שתבחרו, והרעיון שתכתבו לא ישולב בו. גם ספר לדוגמה נספר במכסה השבועית."
              : "מצב הדגמה: שירות האיור לא מחובר. הסיפור ייכתב במיוחד בשבילכם, אבל האיורים יהיו איורים זמניים לדוגמה."}
        </MockNotice>
      ) : null}

      <Stepper current={step} />

      {step < 3 ? (
        <form onSubmit={onSubmitForm} noValidate>
        <Card padding="lg" className="flex flex-col gap-6">
          {step === 0 ? (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
                על מי הסיפור?
              </h2>
              <Field
                label="שם פרטי"
                htmlFor="child-name"
                required
                error={showErrors ? nameError : undefined}
                hint="רק שם פרטי. הוא יופיע בסיפור."
              >
                <Input
                  id="child-name"
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
                  הסיפור ייכתב על
                  <span className="text-danger" aria-hidden="true">
                    {" *"}
                  </span>
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <ChoiceCard selected={childGender === "boy"} onSelect={() => setChildGender("boy")} emoji="👦" title="בן" />
                  <ChoiceCard selected={childGender === "girl"} onSelect={() => setChildGender("girl")} emoji="👧" title="בת" />
                </div>
                {showErrors && genderError ? (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {genderError}
                  </p>
                ) : null}
              </fieldset>

              <Field label="גיל" htmlFor="child-age" hint="לא חובה. עוזר לנו להתאים את אורך הסיפור.">
                <Select
                  id="child-age"
                  value={childAge}
                  onChange={(event) => {
                    setChildAge(event.target.value);
                    setAgeGroup(null);
                  }}
                  aria-describedby="child-age-hint"
                >
                  <option value="">לא משנה</option>
                  <option value="0">פחות משנה</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">
                  מה אוהבים לעשות? <span className="font-normal text-muted">(עד {INPUT_LIMITS.hobbies})</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set([...HOBBY_SUGGESTIONS, ...hobbies])).map((hobby) => (
                    <Chip key={hobby} onClick={() => toggleHobby(hobby)} selected={hobbies.includes(hobby)}>
                      {hobby}
                    </Chip>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    aria-label="תחביב אחר"
                    placeholder="משהו אחר?"
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
                    הוספה
                  </Button>
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1.5 text-base font-semibold text-foreground">
                  איך הגיבור נראה? <span className="font-normal text-muted">(לא חובה)</span>
                </legend>
                {photoPreview ? (
                  <div className="flex items-center gap-4 rounded-lg bg-surface-2 p-3">
                    <img src={photoPreview} alt="התמונה שנבחרה" className="size-20 rounded-md object-cover" />
                    <p className="flex-1 text-sm text-muted">התמונה תישלח רק כשתלחצו על ״יוצרים את הספר״.</p>
                    <Button variant="ghost" size="icon" aria-label="הסרת התמונה" onClick={removePhoto}>
                      <Trash2 aria-hidden="true" className="size-5" />
                    </Button>
                  </div>
                ) : (
                  <Textarea
                    aria-label="תיאור המראה במילים"
                    rows={2}
                    placeholder="למשל: תלתלים חומים, משקפיים אדומים, תמיד עם כובע"
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
                      או העלו תמונה
                    </Button>
                  ) : null}
                </div>
                {photoError ? (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {photoError}
                  </p>
                ) : null}
                <p className="text-sm text-muted">
                  {mock.text
                    ? "במצב הדגמה אין שימוש בתמונה, והיא לא נשמרת."
                    : "התמונה משמשת רק כדי לתאר במילים איך לצייר את הגיבור. היא לא נשמרת אצלנו ונמחקת מהזיכרון מיד אחר כך."}
                </p>
              </fieldset>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
                על מה הסיפור?
              </h2>
              <Field
                label="הרעיון בכמה מילים"
                htmlFor="story-idea"
                required
                error={showErrors ? ideaError : undefined}
                hint={`${idea.length} מתוך ${INPUT_LIMITS.idea} תווים`}
              >
                <Textarea
                  id="story-idea"
                  rows={3}
                  value={idea}
                  maxLength={INPUT_LIMITS.idea}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder="למשל: מסע לירח בחללית מקרטון"
                  aria-invalid={showErrors && ideaError ? true : undefined}
                  aria-describedby={showErrors && ideaError ? "story-idea-error" : "story-idea-hint"}
                />
              </Field>
              <div className="flex flex-col gap-2">
                <p className="text-base font-semibold text-foreground">צריכים רעיון?</p>
                <div className="flex flex-wrap gap-2">
                  {IDEA_SUGGESTIONS.map((suggestion) => (
                    <Chip
                      key={suggestion}
                      tone="accent"
                      selected={idea === suggestion}
                      onClick={() => setIdea(suggestion)}
                      className="whitespace-normal py-2 text-start"
                    >
                      {suggestion}
                    </Chip>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
                איך הספר ייראה?
              </h2>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">למי הספר מתאים?</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {AGE_GROUP_INFO.map((group) => (
                    <ChoiceCard
                      key={group.slug}
                      selected={effectiveAgeGroup === group.slug}
                      onSelect={() => setAgeGroup(group.slug)}
                      emoji={group.emoji}
                      title={group.label}
                      description={group.description}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">איזה סוג סיפור?</legend>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((item) => (
                    <Chip
                      key={item.slug}
                      icon={item.emoji}
                      selected={category === item.slug}
                      onClick={() => setCategory(item.slug)}
                    >
                      {item.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-base font-semibold text-foreground">סגנון האיור</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {STORY_STYLES.map((item) => (
                    <ChoiceCard
                      key={item.slug}
                      selected={style === item.slug}
                      onSelect={() => setStyle(item.slug)}
                      emoji={item.emoji}
                      title={item.label}
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
                הקודם
              </Button>
            ) : (
              <span />
            )}
            {step < 2 ? (
              <Button type="submit" size="lg">
                הבא
              </Button>
            ) : (
              <Button type="submit" size="lg" loading={submitting}>
                <Sparkles aria-hidden="true" className="size-5" />
                יוצרים את הספר
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
}: {
  job: JobView | null;
  steps: WizardStepInfo[];
  connectionLost: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onTryAgain: () => void;
}) {
  if (job?.status === "failed") {
    return (
      <Card padding="lg" className="flex flex-col items-center gap-4 text-center">
        <span aria-hidden="true" className="text-5xl">
          🌧️
        </span>
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
          הספר לא נוצר
        </h2>
        <p role="alert" className="text-lg text-muted">
          {job.error ?? "משהו השתבש. נסו שוב בעוד רגע."}
        </p>
        <Button size="lg" onClick={onTryAgain}>
          לנסות שוב
        </Button>
      </Card>
    );
  }

  if (job?.status === "done" && job.book) {
    const book = job.book;
    const cover = mediaUrl(book.coverImage, book.updatedAt);
    return (
      <Card padding="lg" className="flex flex-col items-center gap-5 text-center">
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
          הספר מוכן! 🎉
        </h2>
        {cover ? (
          <img
            src={cover}
            alt={`כריכת הספר ${book.title}`}
            className="aspect-[3/4] w-48 rounded-lg object-cover shadow-pop"
          />
        ) : null}
        <p className="font-story text-2xl text-foreground">{book.title}</p>
        <p className="text-base text-muted">
          {book.pageCount} עמודים. הספר פרטי: רק אתם רואים אותו, עד שתחליטו לשתף.
        </p>
        {job.message && job.message !== "הספר מוכן!" ? (
          <p className="text-sm text-muted">{job.message.replace(/^הספר מוכן!\s*/, "")}</p>
        ) : null}
        {job.usedMock ? (
          <div className="flex w-full flex-col gap-2 text-start">
            {job.mock.text ? <MockNotice kind="text" /> : null}
            {job.mock.image ? <MockNotice kind="image" /> : null}
          </div>
        ) : null}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <ButtonLink href={routes.read(book.slug)} size="lg">
            <BookOpen aria-hidden="true" className="size-6" />
            בואו נקרא
          </ButtonLink>
          <ButtonLink href={routes.studioBook(book.id)} variant="outline">
            <Pencil aria-hidden="true" className="size-5" />
            עריכה בסטודיו
          </ButtonLink>
        </div>
      </Card>
    );
  }

  if (job?.status === "done") {
    return (
      <Card padding="lg" className="flex flex-col items-center gap-4 text-center">
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-foreground outline-none">
          הספר נוצר, אבל לא מצאנו אותו
        </h2>
        <p className="text-lg text-muted">ייתכן שהוא נמחק. אפשר לחפש אותו בסטודיו.</p>
        <ButtonLink href={routes.studio()} variant="outline">
          לסטודיו
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
        הספר בהכנה
      </h2>
      <div
        role="progressbar"
        aria-label="התקדמות יצירת הספר"
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
        <span>{job?.message || "מתחילים…"}</span>
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
                {done ? <span className="sr-only"> (הושלם)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-sm text-muted">
        זה לוקח כמה דקות. אפשר לסגור את העמוד ולחזור אליו: הספר ימשיך להיווצר.
      </p>
      {connectionLost ? (
        <p role="status" className="rounded-md bg-warning-soft px-4 py-3 text-center text-base text-foreground">
          אין כרגע חיבור לשרת. ממשיכים לנסות.
        </p>
      ) : null}
    </Card>
  );
}

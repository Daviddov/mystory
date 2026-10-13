"use client";

import { FileArchive, ScanText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, CardDescription, CardTitle, Field, Input, Spinner } from "@/components/ui";
import { CcCreditSchema, type CcCredit } from "@/lib/importers/cc";
import {
  prepareImageForUpload,
  rasterizeImage,
  sortPickedFiles,
  type PickedFile,
} from "@/lib/importers/client-files";
import {
  IMPORT_LIMITS,
  fileExtension,
  formatMegabytes,
  isImageFileName,
  isPdfFileName,
  isZipFileName,
} from "@/lib/importers/limits";
import { routes } from "@/lib/routes";
import { CreditFields, EMPTY_CREDIT, type CreditErrors, type CreditValues } from "./CreditFields";
import { DropZone } from "./DropZone";
import { PageDraftList, type DraftPage } from "./PageDraftList";

export interface ImportStudioProps {
  /** True when a Claude key is configured on the server; shows the text recognition buttons. */
  ocrEnabled: boolean;
}

type Busy = null | { kind: "reading" | "uploading" | "ocr-all"; message: string };

interface ApiSuccess {
  id: string;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function postForm<T>(url: string, form: FormData): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    return { ok: false, status: 0, message: "אין חיבור לשרת. בדקו את החיבור ונסו שוב." };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (for example a proxy error page); handled below.
  }
  if (response.ok && body) return { ok: true, data: body as T };
  const message = (body as { error?: unknown } | null)?.error;
  return {
    ok: false,
    status: response.status,
    message: typeof message === "string" ? message : "משהו השתבש. נסו שוב בעוד רגע.",
  };
}

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `p${keyCounter}`;
}

function baseName(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? name;
  const dot = file.lastIndexOf(".");
  return (dot > 0 ? file.slice(0, dot) : file).replace(/[_-]+/g, " ").trim();
}

function folderName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts[0].replace(/[_-]+/g, " ").trim() : "";
}

const IMAGE_FILE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/** The whole import flow: pick a source, review the pages, add credit, create the draft. */
export function ImportStudio({ ocrEnabled }: ImportStudioProps) {
  const router = useRouter();
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [pages, setPages] = useState<DraftPage[]>([]);
  const [kind, setKind] = useState<"images" | "pdf">("images");
  const [title, setTitle] = useState("");
  const [isCc, setIsCc] = useState(false);
  const [credit, setCredit] = useState<CreditValues>(EMPTY_CREDIT);
  const [creditErrors, setCreditErrors] = useState<CreditErrors>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  // Mirror of `pages` for async work (text recognition) and for cleanup on unmount.
  const pagesRef = useRef<DraftPage[]>([]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(
    () => () => {
      for (const page of pagesRef.current) URL.revokeObjectURL(page.previewUrl);
    },
    [],
  );

  const replacePages = useCallback((next: DraftPage[]) => {
    for (const page of pagesRef.current) URL.revokeObjectURL(page.previewUrl);
    setPages(next);
  }, []);

  const reset = useCallback(() => {
    setPackageFile(null);
    replacePages([]);
    setError(null);
    setNotices([]);
  }, [replacePages]);

  const failIfSignedOut = useCallback(
    (status: number): boolean => {
      if (status !== 401) return false;
      router.push(routes.login(routes.studioImport()));
      return true;
    },
    [router],
  );

  // --- Choosing the source ------------------------------------------------------

  const addImages = (picked: PickedFile[], skipped: number, append: boolean) => {
    const current = append ? pagesRef.current : [];
    const room = IMPORT_LIMITS.pages - current.length;
    const sorted = sortPickedFiles(picked);
    const accepted = sorted.slice(0, Math.max(0, room));
    const tooBig = accepted.filter((item) => item.file.size > IMPORT_LIMITS.imageBytes);
    const usable = accepted.filter((item) => item.file.size <= IMPORT_LIMITS.imageBytes);

    const added: DraftPage[] = usable.map((item) => ({
      key: nextKey(),
      name: item.file.name,
      image: item.file,
      previewUrl: URL.createObjectURL(item.file),
      text: "",
      ocr: "idle",
    }));

    const info: string[] = [];
    if (skipped > 0) info.push(`דילגנו על ${skipped} קבצים שאינם תמונות.`);
    if (tooBig.length > 0) {
      info.push(`דילגנו על ${tooBig.length} תמונות שגדולות מ-${formatMegabytes(IMPORT_LIMITS.imageBytes)}.`);
    }
    if (sorted.length > accepted.length) {
      info.push(`ספר יכול להכיל עד ${IMPORT_LIMITS.pages} עמודים; שאר התמונות לא נוספו.`);
    }
    setNotices(info);

    if (append) setPages([...current, ...added]);
    else replacePages(added);
    setKind("images");
    setPackageFile(null);
    if (!title.trim() && sorted[0]) setTitle(folderName(sorted[0].path));
  };

  const readPdf = async (file: File) => {
    if (file.size > IMPORT_LIMITS.pdfBytes) {
      setError(`קובץ ה-PDF גדול מ-${formatMegabytes(IMPORT_LIMITS.pdfBytes)}.`);
      return;
    }
    setBusy({ kind: "reading", message: "פותחים את ה-PDF…" });
    try {
      const { importPdf } = await import("@/lib/importers/pdf");
      const result = await importPdf(file, {
        maxPages: IMPORT_LIMITS.pages,
        onProgress: (done, total) => setBusy({ kind: "reading", message: `מכינים עמוד ${done} מתוך ${total}…` }),
      });
      const next: DraftPage[] = result.pages.map((page) => ({
        key: nextKey(),
        name: `עמוד ${page.pageNumber} ב-PDF`,
        image: page.image,
        previewUrl: URL.createObjectURL(page.image),
        text: page.text,
        ocr: "idle",
      }));
      const info: string[] = [];
      if (result.totalPages > result.pages.length) {
        info.push(`ב-PDF יש ${result.totalPages} עמודים; יובאו ${result.pages.length} הראשונים.`);
      }
      const withoutText = next.filter((page) => page.text === "").length;
      if (withoutText === next.length && next.length > 0) {
        info.push(
          ocrEnabled
            ? "ב-PDF הזה אין שכבת טקסט (כנראה שהוא סרוק). אפשר לזהות את הטקסט מהתמונות או להקליד אותו."
            : "ב-PDF הזה אין שכבת טקסט (כנראה שהוא סרוק). את הטקסט צריך להקליד.",
        );
      } else if (withoutText > 0) {
        info.push(`ב-${withoutText} עמודים לא נמצא טקסט.`);
      }
      setNotices(info);
      replacePages(next);
      setKind("pdf");
      setPackageFile(null);
      if (!title.trim()) setTitle(baseName(file.name));
    } catch (err) {
      console.error("[import] PDF import failed", err);
      setError("לא הצלחנו לפתוח את ה-PDF. ייתכן שהקובץ פגום או מוגן בסיסמה.");
    } finally {
      setBusy(null);
    }
  };

  const onFiles = (picked: PickedFile[]) => {
    setError(null);
    const zips = picked.filter((item) => isZipFileName(item.file.name));
    const pdfs = picked.filter((item) => isPdfFileName(item.file.name));
    const images = picked.filter((item) => isImageFileName(item.file.name));
    const appending = pages.length > 0 && kind === "images";

    if (images.length > 0) {
      addImages(images, picked.length - images.length, appending);
      return;
    }
    if (pdfs.length > 0) {
      if (pdfs.length > 1) setNotices(["נבחרו כמה קובצי PDF; מייבאים את הראשון."]);
      else setNotices([]);
      void readPdf(pdfs[0].file);
      return;
    }
    if (zips.length > 0) {
      const file = zips[0].file;
      if (file.size > IMPORT_LIMITS.packageBytes) {
        setError(`קובץ ה-zip גדול מ-${formatMegabytes(IMPORT_LIMITS.packageBytes)}.`);
        return;
      }
      replacePages([]);
      setNotices(zips.length > 1 ? ["נבחרו כמה קובצי zip; מייבאים את הראשון."] : []);
      setPackageFile(file);
      return;
    }
    setError("לא מצאנו קובץ מתאים. אפשר לייבא קובץ zip של ספר, קובץ PDF או תמונות.");
  };

  // --- Editing the page list ------------------------------------------------------

  const patchPage = (key: string, patch: Partial<DraftPage>) =>
    setPages((current) => current.map((page) => (page.key === key ? { ...page, ...patch } : page)));

  const movePage = (key: string, delta: -1 | 1) =>
    setPages((current) => {
      const from = current.findIndex((page) => page.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  const removePage = (key: string) =>
    setPages((current) => {
      const page = current.find((item) => item.key === key);
      if (page) URL.revokeObjectURL(page.previewUrl);
      return current.filter((item) => item.key !== key);
    });

  // --- Text recognition (only rendered when ocrEnabled) -----------------------------

  const recognise = async (key: string): Promise<void> => {
    const page = pagesRef.current.find((item) => item.key === key);
    if (!page) return;
    patchPage(key, { ocr: "busy", ocrMessage: undefined });

    let image = await rasterizeImage(page.image, 1568, 0.85);
    if (image && image.size > IMPORT_LIMITS.ocrImageBytes) image = await rasterizeImage(page.image, 1024, 0.8);
    if (!image || image.size > IMPORT_LIMITS.ocrImageBytes) {
      patchPage(key, { ocr: "error", ocrMessage: "אי אפשר לזהות טקסט בתמונה מהסוג הזה." });
      return;
    }

    const form = new FormData();
    form.append("image", image, "page.jpg");
    const result = await postForm<{ text: string; truncated: boolean }>("/api/import/ocr", form);
    if (!result.ok) {
      if (failIfSignedOut(result.status)) return;
      patchPage(key, { ocr: "error", ocrMessage: result.message });
      return;
    }
    const text = result.data.text.trim();
    if (text === "") {
      patchPage(key, { ocr: "idle", ocrMessage: "לא נמצא טקסט בעמוד הזה." });
      return;
    }
    patchPage(key, {
      ocr: "idle",
      text: text.slice(0, IMPORT_LIMITS.pageTextChars),
      ocrMessage: result.data.truncated
        ? "הטקסט זוהה אוטומטית ונקטע באמצע. כדאי להשלים ולבדוק אותו."
        : "הטקסט זוהה אוטומטית. כדאי לבדוק אותו.",
    });
  };

  const recogniseAll = async () => {
    const targets = pagesRef.current.filter((page) => page.text.trim() === "").map((page) => page.key);
    for (const [i, key] of targets.entries()) {
      setBusy({ kind: "ocr-all", message: `מזהים טקסט בעמוד ${i + 1} מתוך ${targets.length}…` });
      await recognise(key);
    }
    setBusy(null);
  };

  // --- Creating the draft ------------------------------------------------------------

  const importPackage = async () => {
    if (!packageFile) return;
    setError(null);
    setBusy({ kind: "uploading", message: "מייבאים את הספר…" });
    const form = new FormData();
    form.append("file", packageFile, "book.zip");
    const result = await postForm<ApiSuccess>("/api/import/package", form);
    if (!result.ok) {
      setBusy(null);
      if (!failIfSignedOut(result.status)) setError(result.message);
      return;
    }
    router.push(routes.studioBook(result.data.id));
  };

  const validateCredit = (): CcCredit | null | undefined => {
    if (!isCc) return undefined;
    const parsed = CcCreditSchema.safeParse(credit);
    if (parsed.success) {
      setCreditErrors({});
      return parsed.data;
    }
    const errors: CreditErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "license") errors.license = "בחרו רישיון.";
      if (field === "sourceUrl") errors.sourceUrl = "הזינו קישור מלא שמתחיל ב-https://.";
      if (field === "author") errors.author = "הזינו את שם הכותב או הכותבת.";
      if (field === "illustrator") errors.illustrator = "השם ארוך מדי.";
      if (field === "publisherUrl") errors.publisherUrl = "הזינו קישור מלא שמתחיל ב-https://, או השאירו ריק.";
    }
    setCreditErrors(errors);
    return null;
  };

  const createDraft = async () => {
    setError(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("תנו שם לספר.");
      return;
    }
    const validCredit = validateCredit();
    if (validCredit === null) {
      setError("חסרים פרטי קרדיט לספר Creative Commons.");
      return;
    }

    setBusy({ kind: "uploading", message: "מכינים את התמונות…" });
    try {
      const snapshot = pagesRef.current;
      const form = new FormData();
      let total = 0;
      const images: Blob[] = [];
      for (const page of snapshot) {
        // PDF pages were rendered at upload size already; photos may need shrinking.
        const image = kind === "pdf" ? page.image : await prepareImageForUpload(page.image);
        total += image.size;
        images.push(image);
      }
      if (total > IMPORT_LIMITS.pagesRequestBytes - 1024 * 1024) {
        setError("התמונות גדולות מדי יחד. נסו לייבא פחות עמודים בכל פעם, או להקטין את התמונות.");
        return;
      }
      form.append(
        "meta",
        JSON.stringify({
          title: cleanTitle,
          kind: snapshot.length === 0 ? "cc" : kind,
          pages: snapshot.map((page) => ({ text: page.text, hasImage: true })),
          credit: validCredit,
        }),
      );
      for (const [i, image] of images.entries()) {
        const ext = IMAGE_FILE_EXT[image.type] ?? (fileExtension(snapshot[i].name) || "jpg");
        form.append("images", image, `page-${i + 1}.${ext}`);
      }

      setBusy({ kind: "uploading", message: "יוצרים את הטיוטה…" });
      const result = await postForm<ApiSuccess>("/api/import/pages", form);
      if (!result.ok) {
        if (!failIfSignedOut(result.status)) setError(result.message);
        return;
      }
      router.push(routes.studioBook(result.data.id));
      // Keep the busy state until the navigation replaces this page.
      return "navigating";
    } catch (err) {
      console.error("[import] creating the draft failed", err);
      setError("משהו השתבש בהכנת הקבצים. נסו שוב.");
    }
  };

  const onCreateDraft = async () => {
    const outcome = await createDraft();
    if (outcome !== "navigating") setBusy(null);
  };

  const locked = busy !== null;
  const canCreate = title.trim() !== "" && (pages.length > 0 || isCc);
  const emptyTextPages = pages.filter((page) => page.text.trim() === "").length;

  return (
    <div className="flex flex-col gap-6">
      {packageFile ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <FileArchive aria-hidden="true" className="mt-1 size-8 shrink-0 text-secondary" />
            <div className="min-w-0 flex-1">
              <CardTitle>ייבוא ספר מקובץ zip</CardTitle>
              <CardDescription className="truncate" dir="auto">
                {packageFile.name} ({(packageFile.size / (1024 * 1024)).toFixed(1)}MB)
              </CardDescription>
            </div>
          </div>
          <p className="text-muted">
            הספר ייווצר כטיוטה פרטית שלכם, עם הטקסט, התמונות, ההקראה ופרטי הרישיון שנשמרו בקובץ.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={importPackage} loading={busy?.kind === "uploading"} disabled={locked}>
              ייבוא הספר
            </Button>
            <Button variant="outline" onClick={reset} disabled={locked}>
              <X aria-hidden="true" className="size-5" />
              ביטול
            </Button>
          </div>
        </Card>
      ) : (
        <DropZone onFiles={onFiles} disabled={locked} compact={pages.length > 0 && kind === "images"} />
      )}

      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {busy ? <Spinner label={busy.message} /> : null}
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 font-medium text-foreground">
            {error}
          </p>
        ) : null}
        {notices.map((notice) => (
          <p key={notice} role="note" className="rounded-md bg-warning-soft px-4 py-3">
            {notice}
          </p>
        ))}
      </div>

      {packageFile ? null : (
        <>
          {pages.length > 0 ? (
            <Card as="section" className="flex flex-col gap-4" aria-labelledby="import-pages-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle id="import-pages-title">
                  {pages.length === 1 ? "עמוד אחד" : `${pages.length} עמודים`}
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  {ocrEnabled && emptyTextPages > 0 ? (
                    <Button variant="secondary" size="sm" disabled={locked} onClick={recogniseAll}>
                      <ScanText aria-hidden="true" className="size-4" />
                      זיהוי טקסט בכל העמודים הריקים ({emptyTextPages})
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" disabled={locked} onClick={reset}>
                    התחלה מחדש
                  </Button>
                </div>
              </div>
              <CardDescription>
                כל תמונה היא עמוד. אפשר לשנות את הסדר, להסיר עמודים ולהקליד את הטקסט כאן או אחר כך בעורך.
              </CardDescription>
              {ocrEnabled ? (
                <p className="text-sm text-muted">
                  זיהוי הטקסט שולח את תמונת העמוד לשירות בינה מלאכותית חיצוני (Claude). את התוצאה צריך לבדוק.
                </p>
              ) : null}
              <PageDraftList
                pages={pages}
                disabled={locked}
                ocrEnabled={ocrEnabled}
                onText={(key, text) => patchPage(key, { text })}
                onMove={movePage}
                onRemove={removePage}
                onOcr={(key) => void recognise(key)}
              />
            </Card>
          ) : null}

          <Card as="section" className="flex flex-col gap-5" aria-labelledby="import-details-title">
            <CardTitle id="import-details-title">פרטי הספר</CardTitle>
            <Field label="שם הספר" htmlFor="import-title" required>
              <Input
                id="import-title"
                dir="auto"
                value={title}
                maxLength={200}
                disabled={locked}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <label className="flex min-h-touch cursor-pointer items-center gap-3 text-lg font-semibold">
              <input
                type="checkbox"
                className="size-6 accent-primary"
                checked={isCc}
                disabled={locked}
                onChange={(event) => {
                  setIsCc(event.target.checked);
                  setCreditErrors({});
                }}
              />
              זה ספר ברישיון Creative Commons
            </label>
            {isCc ? (
              <>
                <p className="text-muted">
                  ספר חופשי מותר להעלות רק עם הרישיון, הקישור למקור והקרדיט ליוצרים. הפרטים נשמרים בספר ומוצגים
                  לקוראים. אפשר ליצור את הטיוטה גם בלי קבצים, ולהוסיף את העמודים בעורך.
                </p>
                <CreditFields value={credit} onChange={setCredit} errors={creditErrors} disabled={locked} />
              </>
            ) : null}

            <div className="flex flex-wrap items-center gap-4">
              <Button
                size="lg"
                onClick={onCreateDraft}
                disabled={locked || !canCreate}
                loading={busy?.kind === "uploading"}
              >
                יצירת טיוטה
              </Button>
              {!canCreate ? (
                <p className="text-muted">
                  {pages.length === 0 && !isCc
                    ? "כדי להמשיך, הוסיפו תמונות או PDF, או סמנו שזה ספר Creative Commons."
                    : "כדי להמשיך, תנו שם לספר."}
                </p>
              ) : (
                <p className="text-muted">הספר ייווצר כטיוטה פרטית וייפתח בעורך.</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

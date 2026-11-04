"use client";

import { FileArchive, ScanText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, Card, CardDescription, CardTitle, Field, Input, Spinner } from "@/components/ui";
import { STUDIO_IMPORT } from "@/lib/i18n/studio-import";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
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

async function postForm<T>(url: string, form: FormData, locale: Locale = DEFAULT_LOCALE): Promise<ApiResult<T>> {
  const t = STUDIO_IMPORT[locale];
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    return { ok: false, status: 0, message: t.offline };
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
    message: typeof message === "string" ? message : t.genericError,
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
  const locale = useLocale();
  const t = STUDIO_IMPORT[locale];
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
    if (skipped > 0) info.push(t.skippedNonImages(skipped));
    if (tooBig.length > 0) {
      info.push(t.skippedTooBig(tooBig.length, formatMegabytes(IMPORT_LIMITS.imageBytes)));
    }
    if (sorted.length > accepted.length) {
      info.push(t.tooManyPages(IMPORT_LIMITS.pages));
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
      setError(t.pdfTooBig(formatMegabytes(IMPORT_LIMITS.pdfBytes)));
      return;
    }
    setBusy({ kind: "reading", message: t.openingPdf });
    try {
      const { importPdf } = await import("@/lib/importers/pdf");
      const result = await importPdf(file, {
        maxPages: IMPORT_LIMITS.pages,
        onProgress: (done, total) => setBusy({ kind: "reading", message: t.preparingPage(done, total) }),
      });
      const next: DraftPage[] = result.pages.map((page) => ({
        key: nextKey(),
        name: t.pdfPageName(page.pageNumber),
        image: page.image,
        previewUrl: URL.createObjectURL(page.image),
        text: page.text,
        ocr: "idle",
      }));
      const info: string[] = [];
      if (result.totalPages > result.pages.length) {
        info.push(t.pdfTruncated(result.totalPages, result.pages.length));
      }
      const withoutText = next.filter((page) => page.text === "").length;
      if (withoutText === next.length && next.length > 0) {
        info.push(
          ocrEnabled
            ? t.pdfNoTextOcr
            : t.pdfNoText,
        );
      } else if (withoutText > 0) {
        info.push(t.pagesWithoutText(withoutText));
      }
      setNotices(info);
      replacePages(next);
      setKind("pdf");
      setPackageFile(null);
      if (!title.trim()) setTitle(baseName(file.name));
    } catch (err) {
      console.error("[import] PDF import failed", err);
      setError(t.pdfFailed);
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
      if (pdfs.length > 1) setNotices([t.severalPdfs]);
      else setNotices([]);
      void readPdf(pdfs[0].file);
      return;
    }
    if (zips.length > 0) {
      const file = zips[0].file;
      if (file.size > IMPORT_LIMITS.packageBytes) {
        setError(t.zipTooBig(formatMegabytes(IMPORT_LIMITS.packageBytes)));
        return;
      }
      replacePages([]);
      setNotices(zips.length > 1 ? [t.severalZips] : []);
      setPackageFile(file);
      return;
    }
    setError(t.noSuitableFile);
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
      patchPage(key, { ocr: "error", ocrMessage: t.ocrUnsupported });
      return;
    }

    const form = new FormData();
    form.append("image", image, "page.jpg");
    const result = await postForm<{ text: string; truncated: boolean }>("/api/import/ocr", form, locale);
    if (!result.ok) {
      if (failIfSignedOut(result.status)) return;
      patchPage(key, { ocr: "error", ocrMessage: result.message });
      return;
    }
    const text = result.data.text.trim();
    if (text === "") {
      patchPage(key, { ocr: "idle", ocrMessage: t.ocrNoText });
      return;
    }
    patchPage(key, {
      ocr: "idle",
      text: text.slice(0, IMPORT_LIMITS.pageTextChars),
      ocrMessage: result.data.truncated
        ? t.ocrTruncated
        : t.ocrDone,
    });
  };

  const recogniseAll = async () => {
    const targets = pagesRef.current.filter((page) => page.text.trim() === "").map((page) => page.key);
    for (const [i, key] of targets.entries()) {
      setBusy({ kind: "ocr-all", message: t.ocrPage(i + 1, targets.length) });
      await recognise(key);
    }
    setBusy(null);
  };

  // --- Creating the draft ------------------------------------------------------------

  const importPackage = async () => {
    if (!packageFile) return;
    setError(null);
    setBusy({ kind: "uploading", message: t.importingBook });
    const form = new FormData();
    form.append("file", packageFile, "book.zip");
    const result = await postForm<ApiSuccess>("/api/import/package", form, locale);
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
      if (field === "license") errors.license = t.errLicense;
      if (field === "sourceUrl") errors.sourceUrl = t.errSourceUrl;
      if (field === "author") errors.author = t.errAuthor;
      if (field === "illustrator") errors.illustrator = t.errIllustrator;
      if (field === "publisherUrl") errors.publisherUrl = t.errPublisherUrl;
    }
    setCreditErrors(errors);
    return null;
  };

  const createDraft = async () => {
    setError(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(t.missingTitle);
      return;
    }
    const validCredit = validateCredit();
    if (validCredit === null) {
      setError(t.missingCredit);
      return;
    }

    setBusy({ kind: "uploading", message: t.preparingImages });
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
        setError(t.imagesTooBig);
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

      setBusy({ kind: "uploading", message: t.creatingDraft });
      const result = await postForm<ApiSuccess>("/api/import/pages", form, locale);
      if (!result.ok) {
        if (!failIfSignedOut(result.status)) setError(result.message);
        return;
      }
      router.push(routes.studioBook(result.data.id));
      // Keep the busy state until the navigation replaces this page.
      return "navigating";
    } catch (err) {
      console.error("[import] creating the draft failed", err);
      setError(t.prepareFailed);
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
              <CardTitle>{t.zipTitle}</CardTitle>
              <CardDescription className="truncate" dir="auto">
                {packageFile.name} ({(packageFile.size / (1024 * 1024)).toFixed(1)}MB)
              </CardDescription>
            </div>
          </div>
          <p className="text-muted">{t.zipText}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={importPackage} loading={busy?.kind === "uploading"} disabled={locked}>
              {t.importBook}
            </Button>
            <Button variant="outline" onClick={reset} disabled={locked}>
              <X aria-hidden="true" className="size-5" />
              {t.cancel}
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
                  {t.pageCount(pages.length)}
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  {ocrEnabled && emptyTextPages > 0 ? (
                    <Button variant="secondary" size="sm" disabled={locked} onClick={recogniseAll}>
                      <ScanText aria-hidden="true" className="size-4" />
                      {t.ocrAll(emptyTextPages)}
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" disabled={locked} onClick={reset}>
                    {t.startOver}
                  </Button>
                </div>
              </div>
              <CardDescription>{t.pagesHelp}</CardDescription>
              {ocrEnabled ? (
                <p className="text-sm text-muted">{t.ocrPrivacy}</p>
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
            <CardTitle id="import-details-title">{t.detailsTitle}</CardTitle>
            <Field label={t.titleLabel} htmlFor="import-title" required>
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
              {t.isCc}
            </label>
            {isCc ? (
              <>
                <p className="text-muted">{t.ccHelp}</p>
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
                {t.createDraft}
              </Button>
              {!canCreate ? (
                <p className="text-muted">
                  {pages.length === 0 && !isCc
                    ? t.needFiles
                    : t.needTitle}
                </p>
              ) : (
                <p className="text-muted">{t.willCreate}</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

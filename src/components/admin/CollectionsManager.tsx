"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SEASONS, seasonLabel, STATUS_LABELS } from "@/app/admin/_lib/labels";
import { adminApi } from "@/app/admin/_lib/paths";
import { Button, Card, CardTitle, Chip, Dialog, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { routes } from "@/lib/routes";
import { SLUG_PATTERN, type BookStatus, type Collection } from "@/lib/types";
import { adminRequest } from "./request";

export interface CollectionBookOption {
  id: string;
  title: string;
  status: BookStatus;
}

export interface CollectionsManagerProps {
  collections: Collection[];
  /** Every book (any status), so existing members that are not published can still be shown. */
  books: CollectionBookOption[];
}

interface Draft {
  /** null = a new collection. */
  id: string | null;
  title: string;
  description: string;
  slug: string;
  season: string;
  bookIds: string[];
}

function emptyDraft(): Draft {
  return {
    id: null,
    title: "",
    description: "",
    slug: "",
    season: "",
    bookIds: [],
  };
}

function toDraft(collection: Collection): Draft {
  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    slug: collection.slug,
    season: collection.season ?? "",
    bookIds: [...collection.bookIds],
  };
}

/** Collections list with create, edit (including book order and season) and delete. */
export function CollectionsManager({ collections, books }: CollectionsManagerProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookToAdd, setBookToAdd] = useState("");

  const bookById = new Map(books.map((b) => [b.id, b]));

  function open(next: Draft) {
    setError(null);
    setBookToAdd("");
    setDraft(next);
  }

  function patch(change: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...change } : current));
  }

  function move(index: number, delta: -1 | 1) {
    if (!draft) return;
    const target = index + delta;
    if (target < 0 || target >= draft.bookIds.length) return;
    const next = [...draft.bookIds];
    [next[index], next[target]] = [next[target], next[index]];
    patch({ bookIds: next });
  }

  async function save() {
    if (!draft) return;
    const title = draft.title.trim();
    const slug = draft.slug.trim();
    if (!title) {
      setError("צריך לתת לאוסף שם.");
      return;
    }
    if (slug && !SLUG_PATTERN.test(slug)) {
      setError("הכתובת יכולה להכיל רק אותיות אנגליות קטנות, ספרות ומקפים.");
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      title,
      description: draft.description.trim(),
      season: draft.season || null,
      bookIds: draft.bookIds,
      ...(slug ? { slug } : {}),
    };
    const result = draft.id
      ? await adminRequest(adminApi.collection(draft.id), "PATCH", body)
      : await adminRequest(adminApi.collections(), "POST", body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(null);
    router.refresh();
  }

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    setError(null);
    const result = await adminRequest(adminApi.collection(toDelete.id), "DELETE");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setToDelete(null);
    router.refresh();
  }

  const available = draft ? books.filter((b) => b.status === "published" && !draft.bookIds.includes(b.id)) : [];
  const seasonOptions =
    draft && draft.season && !SEASONS.some((s) => s.key === draft.season)
      ? [...SEASONS, { key: draft.season, label: draft.season }]
      : SEASONS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">אוספים</h2>
        <Button onClick={() => open(emptyDraft())}>
          <Plus aria-hidden="true" />
          אוסף חדש
        </Button>
      </div>

      {collections.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title="עדיין אין אוספים"
          description="אוסף הוא רשימה מסודרת של ספרים, למשל לעונה או לחג."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {collections.map((collection) => (
            <Card as="li" key={collection.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle>{collection.title}</CardTitle>
                  <p className="text-sm text-muted" dir="ltr">
                    <Link href={routes.collection(collection.slug)} className="underline">
                      {routes.collection(collection.slug)}
                    </Link>
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`עריכת האוסף ${collection.title}`}
                  title="עריכה"
                  onClick={() => open(toDraft(collection))}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-danger"
                  aria-label={`מחיקת האוסף ${collection.title}`}
                  title="מחיקה"
                  onClick={() => {
                    setError(null);
                    setToDelete(collection);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              {collection.description ? <p className="text-muted">{collection.description}</p> : null}
              <div className="flex flex-wrap gap-2">
                {collection.season ? <Chip tone="accent">{seasonLabel(collection.season)}</Chip> : null}
                <Chip>{collection.bookIds.length} ספרים</Chip>
              </div>
              {collection.bookIds.length > 0 ? (
                <ol className="list-inside list-decimal text-sm leading-relaxed">
                  {collection.bookIds.map((id) => {
                    const book = bookById.get(id);
                    return (
                      <li key={id}>
                        {book ? book.title : <span className="text-danger">ספר שנמחק ({id})</span>}
                        {book && book.status !== "published" ? (
                          <span className="text-warning"> ({STATUS_LABELS[book.status]}, לא מוצג לקוראים)</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </Card>
          ))}
        </ul>
      )}

      <Dialog
        open={draft !== null}
        onClose={() => (busy ? undefined : setDraft(null))}
        size="lg"
        title={draft?.id ? "עריכת אוסף" : "אוסף חדש"}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
              ביטול
            </Button>
            <Button loading={busy} onClick={save}>
              שמירה
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="flex flex-col gap-4">
            <Field label="שם האוסף" htmlFor="collection-title" required>
              <Input
                id="collection-title"
                value={draft.title}
                maxLength={200}
                onChange={(event) => patch({ title: event.target.value })}
              />
            </Field>
            <Field label="תיאור" htmlFor="collection-description">
              <Textarea
                id="collection-description"
                rows={2}
                value={draft.description}
                maxLength={2000}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="כתובת (באנגלית)"
                htmlFor="collection-slug"
                hint={draft.id ? "שינוי הכתובת שובר קישורים קיימים." : "אפשר להשאיר ריק, והכתובת תיווצר מהשם."}
              >
                <Input
                  id="collection-slug"
                  dir="ltr"
                  value={draft.slug}
                  maxLength={80}
                  placeholder="rainy-days"
                  onChange={(event) => patch({ slug: event.target.value.toLowerCase() })}
                  aria-describedby="collection-slug-hint"
                />
              </Field>
              <Field label="עונה או חג" htmlFor="collection-season">
                <Select
                  id="collection-season"
                  value={draft.season}
                  onChange={(event) => patch({ season: event.target.value })}
                >
                  <option value="">ללא (אוסף קבוע)</option>
                  {seasonOptions.map((season) => (
                    <option key={season.key} value={season.key}>
                      {season.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-base font-semibold">ספרים באוסף, לפי הסדר</legend>
              {draft.bookIds.length === 0 ? (
                <p className="text-muted">עדיין לא נוספו ספרים.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {draft.bookIds.map((id, index) => {
                    const book = bookById.get(id);
                    const name = book?.title ?? id;
                    return (
                      <li
                        key={id}
                        className="flex items-center gap-1 rounded-md border border-border bg-surface-2 py-1 pe-1 ps-3"
                      >
                        <span className="w-6 shrink-0 text-muted">{index + 1}.</span>
                        <span className="min-w-0 flex-1 truncate">
                          {book ? book.title : <span className="text-danger">ספר שנמחק</span>}
                          {book && book.status !== "published" ? (
                            <span className="text-sm text-warning"> ({STATUS_LABELS[book.status]})</span>
                          ) : null}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={index === 0}
                          aria-label={`הזזת ${name} למעלה`}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={index === draft.bookIds.length - 1}
                          aria-label={`הזזת ${name} למטה`}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`הסרת ${name} מהאוסף`}
                          onClick={() =>
                            patch({
                              bookIds: draft.bookIds.filter((b) => b !== id),
                            })
                          }
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="flex flex-wrap gap-2">
                <Select
                  aria-label="ספר להוספה"
                  value={bookToAdd}
                  onChange={(event) => setBookToAdd(event.target.value)}
                  className="min-w-56 flex-1"
                  disabled={available.length === 0}
                >
                  <option value="">
                    {available.length === 0 ? "אין עוד ספרים מפורסמים להוספה" : "בחרו ספר מפורסם…"}
                  </option>
                  {available.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="outline"
                  disabled={!bookToAdd}
                  onClick={() => {
                    patch({ bookIds: [...draft.bookIds, bookToAdd] });
                    setBookToAdd("");
                  }}
                >
                  <Plus aria-hidden="true" />
                  הוספה
                </Button>
              </div>
            </fieldset>

            {error ? (
              <p role="alert" className="font-medium text-danger">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={toDelete !== null}
        onClose={() => (busy ? undefined : setToDelete(null))}
        size="sm"
        title="למחוק את האוסף?"
        description={toDelete ? `האוסף "${toDelete.title}" יימחק. הספרים עצמם נשארים בספרייה.` : undefined}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setToDelete(null)}>
              ביטול
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              מחיקת האוסף
            </Button>
          </>
        }
      >
        {error && toDelete ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}

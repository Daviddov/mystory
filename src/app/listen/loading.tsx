import { Spinner } from "@/components/ui";

export default function ListenLoading() {
  return (
    <main className="container-page flex flex-col items-center gap-4 py-20 text-center">
      <Spinner size="lg" label="מכינים את רצף הסיפורים…" />
      <p className="text-lg text-muted" aria-hidden="true">
        מכינים את רצף הסיפורים…
      </p>
    </main>
  );
}

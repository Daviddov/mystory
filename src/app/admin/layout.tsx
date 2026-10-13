import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Chip } from "@/components/ui";
import { hasRole } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { requireAdminPage } from "./_lib/guard";
import { ROLE_LABELS } from "./_lib/labels";
import { adminPaths } from "./_lib/paths";

export const metadata: Metadata = {
  title: { default: "לוח ניהול", template: "%s | לוח ניהול | הסיפור שלי" },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Every page repeats this check, because layouts are not re-rendered on client navigation.
  const user = await requireAdminPage(adminPaths.home());
  const repo = await getRepo();
  const { total: pendingCount } = await repo.listBooks({
    status: "pending",
    limit: 1,
  });

  return (
    <main className="container-page flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold">לוח ניהול</h1>
          <Chip tone="secondary">
            {user.name} · {ROLE_LABELS[user.role]}
          </Chip>
        </div>
        <AdminNav pendingCount={pendingCount} showUsers={hasRole(user, "admin")} />
      </header>
      {children}
    </main>
  );
}

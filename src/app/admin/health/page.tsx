import type { Metadata } from "next";
import { KeyHealth } from "@/components/admin/KeyHealth";
import { requireAdminPage } from "../_lib/guard";
import { adminPaths } from "../_lib/paths";

export const metadata: Metadata = { title: "בדיקת מפתחות" };
export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  await requireAdminPage(adminPaths.health(), "admin");
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold">בדיקת מפתחות API</h2>
      <KeyHealth />
    </div>
  );
}

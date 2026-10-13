import type { Metadata } from "next";
import { UserRoleSelect } from "@/components/admin/UserRoleSelect";
import { MockNotice } from "@/components/MockNotice";
import { EmptyState } from "@/components/ui";
import { authMode } from "@/lib/auth";
import { adminEmails } from "@/lib/config";
import { getRepo } from "@/lib/repo";
import { USER_ROLES } from "@/lib/types";
import { requireAdminPage } from "../_lib/guard";
import { formatDate, ROLE_LABELS } from "../_lib/labels";
import { adminPaths } from "../_lib/paths";
import { isEnvAdmin } from "../_lib/service";

export const metadata: Metadata = { title: "משתמשים" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  // Admins only: editors are sent back to the admin home.
  const me = await requireAdminPage(adminPaths.users(), "admin");
  const repo = await getRepo();
  const [users, { books }] = await Promise.all([repo.listUsers(), repo.listBooks({ status: "any" })]);
  const envAdmins = adminEmails();

  const bookCounts = new Map<string, number>();
  for (const book of books) bookCounts.set(book.ownerId, (bookCounts.get(book.ownerId) ?? 0) + 1);

  const rows = users
    .map((user) => {
      const forcedAdmin = isEnvAdmin(user, envAdmins);
      return {
        user,
        forcedAdmin,
        role: forcedAdmin ? ("admin" as const) : user.role,
      };
    })
    .sort(
      (a, b) => USER_ROLES.indexOf(b.role) - USER_ROLES.indexOf(a.role) || a.user.name.localeCompare(b.user.name, "he"),
    );

  return (
    <section aria-labelledby="users-heading" className="flex flex-col gap-4">
      <h2 id="users-heading" className="text-2xl font-bold">
        משתמשים ({users.length})
      </h2>
      <p className="text-muted">
        {USER_ROLES.map((role) => `${ROLE_LABELS[role]}: ${rows.filter((r) => r.role === role).length}`).join(" · ")}.
        עורך מאשר ספרים ומנהל אוספים; מנהל יכול גם לשנות תפקידים.
      </p>
      {authMode() === "local" ? <MockNotice kind="login" /> : null}

      {rows.length === 0 ? (
        <EmptyState icon="👤" title="אין משתמשים רשומים" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead className="bg-surface-2 text-sm">
              <tr>
                <th scope="col" className="p-3 text-start font-semibold">
                  שם
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  אימייל
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  הצטרפות
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  ספרים
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  תפקיד
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ user, forcedAdmin, role }) => (
                <tr key={user.id} className="border-t border-border align-top">
                  <th scope="row" className="p-3 text-start font-semibold">
                    {user.name}
                    {user.id === me.id ? <span className="font-normal text-muted"> (אני)</span> : null}
                  </th>
                  <td className="p-3" dir="ltr">
                    {user.email ?? "—"}
                  </td>
                  <td className="whitespace-nowrap p-3">{formatDate(user.createdAt) || "—"}</td>
                  <td className="p-3 tabular-nums">{bookCounts.get(user.id) ?? 0}</td>
                  <td className="p-3">
                    <UserRoleSelect
                      userId={user.id}
                      name={user.name}
                      role={role}
                      lockedReason={
                        user.id === me.id
                          ? "אי אפשר לשנות את התפקיד של עצמך."
                          : forcedAdmin
                            ? "מנהל קבוע: האימייל מופיע ב-ADMIN_EMAILS בהגדרות השרת."
                            : undefined
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

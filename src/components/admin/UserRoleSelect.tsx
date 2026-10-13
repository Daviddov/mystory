"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS } from "@/app/admin/_lib/labels";
import { adminApi } from "@/app/admin/_lib/paths";
import { Select } from "@/components/ui";
import { USER_ROLES, type UserRole } from "@/lib/types";
import { adminRequest } from "./request";

export interface UserRoleSelectProps {
  userId: string;
  name: string;
  role: UserRole;
  /** When set the select is disabled and this explanation is shown. */
  lockedReason?: string;
}

export function UserRoleSelect({ userId, name, role, lockedReason }: UserRoleSelectProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: UserRole) {
    if (next === role) return;
    setBusy(true);
    setError(null);
    const result = await adminRequest(adminApi.user(userId), "PATCH", {
      role: next,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label={`התפקיד של ${name}`}
        value={role}
        disabled={busy || !!lockedReason}
        onChange={(event) => change(event.target.value as UserRole)}
        className="min-h-10 w-auto px-3 text-sm"
      >
        {USER_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
      {lockedReason ? <p className="max-w-xs text-sm text-muted">{lockedReason}</p> : null}
      {error ? (
        <p role="alert" className="max-w-xs text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

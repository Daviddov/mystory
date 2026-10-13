import { STATUS_LABELS, STATUS_TONES } from "@/app/admin/_lib/labels";
import { Chip } from "@/components/ui";
import type { BookStatus } from "@/lib/types";

export function StatusChip({ status }: { status: BookStatus }) {
  return <Chip tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Chip>;
}

import { Spinner } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner label="טוען את מסלול הפרסום…" />
    </div>
  );
}

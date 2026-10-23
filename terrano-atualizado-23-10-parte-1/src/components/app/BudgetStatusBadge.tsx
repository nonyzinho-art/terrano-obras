import type { BudgetStatus } from "@/lib/types";
import { BUDGET_STATUS_LABEL } from "@/lib/budget-status";
export function BudgetStatusBadge({ status }: { status: BudgetStatus }) {
  const style =
    status === "aprovado"
      ? "bg-success-soft text-primary"
      : status === "cotado"
        ? "bg-muted text-foreground"
        : "bg-warning-soft text-warning-foreground";
  return (
    <span
      className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium whitespace-nowrap ${style}`}
    >
      {BUDGET_STATUS_LABEL[status]}
    </span>
  );
}

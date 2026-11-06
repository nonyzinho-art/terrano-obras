import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Panel } from "./bits";
import { Button } from "@/components/ui/button";
import { getBudgetAlerts, useDataVersion } from "@/lib/repository";
import type { BudgetAlert } from "@/lib/budget-alerts";
import { cn } from "@/lib/utils";

/** Delays and measurements under review are urgent; missing data is a warning. */
const isUrgent = (alert: BudgetAlert) => !/^(pending|plan)-/.test(alert.id);

export function BudgetAlerts({ workId }: { workId?: string }) {
  useDataVersion();
  const [all, setAll] = useState(false);
  const alerts = getBudgetAlerts(workId);
  const shown = all ? alerts : alerts.slice(0, 5);
  return (
    <Panel
      title={`Precisa de atenção (${alerts.length})`}
      className="[&>div:last-child]:p-0"
      action={
        alerts.length > 5 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAll(!all)}>
            {all ? "Mostrar menos" : `Ver todos (${alerts.length})`}
          </Button>
        )
      }
    >
      {shown.length ? (
        <ul className="divide-y">
          {shown.map((alert) => (
            <li key={alert.id}>
              <Link
                className="group flex items-center gap-3 px-5 py-3 hover:bg-muted/50"
                to="/orcamentos/$obraId/$orcamentoId"
                params={{ obraId: alert.workId, orcamentoId: alert.budgetId }}
                search={{
                  aba: alert.tab,
                  medicao: alert.measurementId,
                  pendentes: alert.id.startsWith("pending-"),
                }}
              >
                <span
                  aria-label={isUrgent(alert) ? "Urgente" : "Pendência"}
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    isUrgent(alert) ? "bg-danger" : "bg-warning",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{alert.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {alert.detail}
                  </span>
                </span>
                <span className="hidden shrink-0 text-xs font-medium text-primary sm:inline">
                  {alert.action}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          Tudo em dia: nenhum alerta de orçamento ou medição.
        </p>
      )}
    </Panel>
  );
}

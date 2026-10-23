import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Panel } from "./bits";
import { Button } from "@/components/ui/button";
import { getBudgetAlerts, useDataVersion } from "@/lib/repository";
export function BudgetAlerts({ workId }: { workId?: string }) {
  useDataVersion();
  const [all, setAll] = useState(false);
  const alerts = getBudgetAlerts(workId);
  const shown = all ? alerts : alerts.slice(0, 6);
  return (
    <Panel title={`Alertas de acompanhamento (${alerts.length})`}>
      <p className="mb-3 text-xs text-muted-foreground">
        Pendências calculadas com os orçamentos e medições atuais. Abra cada alerta para conferir ou
        resolver.
      </p>
      {shown.length ? (
        <div className="divide-y">
          {shown.map((alert) => (
            <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{alert.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{alert.detail}</div>
              </div>
              <Link
                className="rounded-md border px-3 py-2 text-sm font-medium text-primary hover:bg-success-soft/40"
                to="/orcamentos/$obraId/$orcamentoId"
                params={{ obraId: alert.workId, orcamentoId: alert.budgetId }}
                search={{ aba: alert.tab, medicao: alert.measurementId }}
              >
                {alert.action}
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">
          Nenhum alerta de orçamento ou medição no momento.
        </p>
      )}
      {alerts.length > 6 && (
        <Button className="mt-3" variant="outline" size="sm" onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : `Ver todos os ${alerts.length} alertas`}
        </Button>
      )}
    </Panel>
  );
}

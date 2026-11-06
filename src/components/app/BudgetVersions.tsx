import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  getBudgetsByWork,
  getMeasurements,
  getItemsByBudget,
  getApprovedBudgetQuantities,
} from "@/lib/repository";
import { comparisonBudgetItems } from "@/lib/budget-comparison";
import { BudgetComparison } from "./BudgetComparison";
import { Button } from "@/components/ui/button";
import { budgetFamilyKey } from "@/lib/budget-revisions";
import { fmtDate } from "@/lib/format";
import type { Budget } from "@/lib/types";

export function BudgetVersions({ budget }: { budget: Budget }) {
  const [baseId, setBaseId] = useState("");
  const [comparing, setComparing] = useState(false);
  const versions = getBudgetsByWork(budget.work_id)
    .filter((b) => budgetFamilyKey(b) === budgetFamilyKey(budget))
    .sort(
      (a, b) => (b.revision ?? 1) - (a.revision ?? 1) || b.updated_at.localeCompare(a.updated_at),
    );
  if (versions.length < 2) return null;
  const earlier = versions.slice(versions.findIndex((b) => b.id === budget.id) + 1);
  const base = earlier.find((b) => b.id === baseId) ?? earlier[0];
  return (
    <section className="mb-5 rounded-md border bg-card p-4 text-sm">
      <h2 className="font-semibold">Versões deste orçamento</h2>
      <p className="mt-1 text-muted-foreground">
        Cada versão mantém seus itens e medições. Quantidades não são transferidas automaticamente.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {versions.map((b) => (
          <Link
            key={b.id}
            to="/orcamentos/$obraId/$orcamentoId"
            params={{ obraId: b.work_id, orcamentoId: b.id }}
            search={{ aba: "medicoes" }}
            className="rounded-md border px-3 py-2 text-primary hover:bg-muted"
            aria-current={b.id === budget.id ? "page" : undefined}
          >
            Revisão {b.revision ?? 1} · {fmtDate(b.updated_at)} · {getMeasurements(b.id).length}{" "}
            medições{b.id === budget.id ? " · aberta" : ""}
          </Link>
        ))}
      </div>
      {base && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <label>
              Comparar com a versão anterior{" "}
              <select
                aria-label="Versão base da comparação"
                className="ml-2 h-9 rounded-md border bg-background px-3"
                value={base.id}
                onChange={(e) => setBaseId(e.target.value)}
              >
                {earlier.map((b) => (
                  <option key={b.id} value={b.id}>
                    Revisão {b.revision ?? 1} · {fmtDate(b.updated_at)}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" variant="outline" onClick={() => setComparing(!comparing)}>
              {comparing ? "Fechar comparação" : "Comparar itens"}
            </Button>
          </div>
          {comparing && (
            <BudgetComparison
              key={`${base.id}-${budget.id}`}
              before={comparisonBudgetItems(getItemsByBudget(base.id))}
              after={comparisonBudgetItems(getItemsByBudget(budget.id))}
              executed={getApprovedBudgetQuantities(base.id)}
              beforeLabel={`Revisão ${base.revision ?? 1}`}
              afterLabel={`Revisão ${budget.revision ?? 1} aberta`}
            />
          )}
        </div>
      )}
    </section>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadCloudData } from "@/lib/cloud-data";
import { fmtDate } from "@/lib/format";
import { getBaselines, replaceData } from "@/lib/repository";
import { getSupabase } from "@/lib/supabase";
import type { Budget } from "@/lib/types";

/** Linha de base do cronograma do contrato: vigente, histórico e atualização pela coordenação. */
export function BaselineSection({
  budget,
  approver,
  busy,
  setBusy,
  setMessage,
}: {
  budget: Budget;
  approver: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setMessage: (m: string) => void;
}) {
  const [reason, setReason] = useState("");
  const list = getBaselines(budget.id);
  const current = list[0];
  const differs =
    !!current &&
    !!budget.planned_start &&
    !!budget.planned_end &&
    (current.planned_start !== budget.planned_start || current.planned_end !== budget.planned_end);
  async function update() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getSupabase().rpc("set_budget_baseline", {
        p_budget: budget.id,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      replaceData(await loadCloudData());
      setReason("");
      setMessage("Linha de base atualizada. A curva S e o atraso passam a usar as novas datas.");
    } catch (e) {
      setMessage(
        (e as { message?: string })?.message ?? "Não foi possível atualizar a linha de base.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5 space-y-3 border-t pt-4 text-sm">
      <div>
        <div className="font-medium">Linha de base</div>
        {current ? (
          <p className="text-muted-foreground">
            Vigente: <strong className="text-foreground">{fmtDate(current.planned_start)}</strong> a{" "}
            <strong className="text-foreground">{fmtDate(current.planned_end)}</strong>, congelada
            em {fmtDate(current.created_at)}. A curva S e o atraso são medidos contra ela, mesmo que
            as datas acima mudem.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Será criada automaticamente quando as datas planejadas forem salvas pela primeira vez.
          </p>
        )}
      </div>
      {differs && (
        <p className="rounded-md border border-warning/40 bg-warning-soft p-3">
          As datas planejadas atuais ({fmtDate(budget.planned_start!)} a{" "}
          {fmtDate(budget.planned_end!)}) diferem da linha de base. O gráfico mostra as duas.
        </p>
      )}
      {differs && approver && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1">
            Justificativa para nova linha de base
            <Input
              value={reason}
              maxLength={2000}
              placeholder="Ex.: aditivo de prazo aprovado, atraso na licença"
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={busy || reason.trim().length < 10}
            onClick={() => void update()}
          >
            Congelar datas atuais como linha de base
          </Button>
        </div>
      )}
      {list.length > 1 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-primary">
            Histórico de linhas de base ({list.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {list.map((b, i) => (
              <li key={b.id}>
                {fmtDate(b.planned_start)} a {fmtDate(b.planned_end)} · {fmtDate(b.created_at)}
                {i === 0 && " · vigente"}
                {b.reason && ` — ${b.reason}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

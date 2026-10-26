import { useState } from "react";
import { Panel } from "./bits";
import { MeasurementReportDialog } from "./MeasurementReportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getItemsByBudget,
  getMeasurements,
  getMeasurementItems,
  getMeasurementProgress,
  replaceData,
  TODAY,
} from "@/lib/repository";
import { loadCloudData } from "@/lib/cloud-data";
import { getSupabase } from "@/lib/supabase";
import { useAccess } from "@/lib/access";
import { fmtBRL, fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { parseAmount } from "@/lib/budget-import";
import { approvedQuantities } from "@/lib/measurement-progress";
import type { Budget, BudgetMeasurement } from "@/lib/types";

export function BudgetMeasurements({
  budget,
  initialMeasurementId,
}: {
  budget: Budget;
  initialMeasurementId?: string | undefined;
}) {
  const { profile, canWriteWork } = useAccess();
  const writable = canWriteWork(budget.work_id);
  const approver =
    !!profile && ["administrador", "diretor", "coordenador_obras"].includes(profile.role);
  const items = getItemsByBudget(budget.id);
  const history = [...getMeasurements(budget.id)].sort(
    (a, b) => b.period_end.localeCompare(a.period_end) || b.created_at.localeCompare(a.created_at),
  );
  const progress = getMeasurementProgress(budget.work_id).summaries.find(
    (s) => s.budget.id === budget.id,
  );
  const initial = history.find((m) => m.id === initialMeasurementId);
  const [editing, setEditing] = useState<string | null>(initial?.id ?? null);
  const current = history.find((m) => m.id === editing);
  const [start, setStart] = useState(initial?.period_start ?? TODAY);
  const [end, setEnd] = useState(initial?.period_end ?? TODAY);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initial
        ? getMeasurementItems(initial.id).map((line) => [
            line.budget_item_id,
            String(line.quantity),
          ])
        : [],
    ),
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [planStart, setPlanStart] = useState(budget.planned_start ?? "");
  const [planEnd, setPlanEnd] = useState(budget.planned_end ?? "");
  const frozen = !!current && current.status !== "rascunho";
  const previousQuantities = approvedQuantities(
    history.filter(
      (m) => m.period_end < start && m.id !== editing && m.id !== current?.replaces_id,
    ),
    history.flatMap((m) => getMeasurementItems(m.id)),
    end,
  );
  const savedQuantities = current
    ? Object.fromEntries(
        getMeasurementItems(current.id).map((line) => [line.budget_item_id, String(line.quantity)]),
      )
    : {};
  const dirty =
    !!current &&
    (start !== current.period_start ||
      end !== current.period_end ||
      notes !== current.notes ||
      JSON.stringify(Object.entries(quantities).sort()) !==
        JSON.stringify(Object.entries(savedQuantities).sort()));
  const mayEdit =
    writable && !frozen && (!current || current.created_by === profile?.user_id || approver);
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const shown = items.filter((i) =>
    normalize(`${i.code} ${i.description}`).includes(normalize(search)),
  );
  function open(measurement?: BudgetMeasurement) {
    setEditing(measurement?.id ?? crypto.randomUUID());
    setStart(measurement?.period_start ?? TODAY);
    setEnd(measurement?.period_end ?? TODAY);
    setNotes(measurement?.notes ?? "");
    setSearch("");
    setMessage("");
    setRevisionReason("");
    setQuantities(
      Object.fromEntries(
        measurement
          ? getMeasurementItems(measurement.id).map((line) => [
              line.budget_item_id,
              String(line.quantity),
            ])
          : [],
      ),
    );
  }
  async function action(name: string, payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getSupabase().rpc("budget_measurement_action", {
        p_action: name,
        p_payload: { budget_id: budget.id, ...payload },
      });
      if (error) throw error;
      replaceData(await loadCloudData());
      if (name === "revisar") {
        const revision = getMeasurements(budget.id).find((m) => m.id === payload["new_id"]);
        if (revision) open(revision);
        setMessage(
          "Revisão criada como rascunho. A medição original continua valendo até a nova aprovação.",
        );
        return;
      }
      if (name === "salvar") {
        setQuantities(
          Object.fromEntries(
            getMeasurementItems(String(payload["id"])).map((line) => [
              line.budget_item_id,
              String(line.quantity),
            ]),
          ),
        );
      } else if (name !== "planejar") setEditing(null);
      setMessage(
        name === "aprovar"
          ? "Medição aprovada. Executado, saldo e indicadores atualizados."
          : name === "salvar"
            ? "Medição salva. Você pode continuar editando ou aprovar após conferir."
            : name === "planejar"
              ? "Datas do cronograma atualizadas."
              : "Rascunho cancelado.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ((error as { message?: string })?.message ?? "Não foi possível salvar."),
      );
    } finally {
      setBusy(false);
    }
  }
  function save() {
    try {
      const lines = Object.entries(quantities)
        .map(([budget_item_id, text]) => ({ budget_item_id, quantity: parseAmount(text) ?? 0 }))
        .filter((line) => line.quantity > 0);
      if (!lines.length && !current?.replaces_id) {
        setMessage("Preencha ao menos uma quantidade do período.");
        return;
      }
      void action("salvar", {
        id: editing,
        revision: current?.revision,
        period_start: start,
        period_end: end,
        notes,
        items: lines,
      });
    } catch {
      setMessage("Confira as quantidades. Use números positivos com até quatro casas decimais.");
    }
  }
  return (
    <div className="space-y-5">
      {message && (
        <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
          {message}
        </p>
      )}
      <Panel title="Executado e saldo do orçamento">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="eyebrow">Orçado</div>
            <div className="num mt-1 text-lg font-semibold">{fmtBRL(progress?.total ?? 0)}</div>
          </div>
          <div>
            <div className="eyebrow">Executado aprovado</div>
            <div className="num mt-1 text-lg font-semibold text-primary">
              {fmtBRL(progress?.executed ?? 0)}
            </div>
          </div>
          <div>
            <div className="eyebrow">Saldo a executar</div>
            <div className="num mt-1 text-lg font-semibold">
              {fmtBRL((progress?.total ?? 0) - (progress?.executed ?? 0))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Avanço aprovado: {fmtPct(progress?.actual ?? 0)} · ponderado pelos preços do orçamento.
          Estes valores representam execução valorizada, não pagamentos nem custo real.
        </p>
        {items.some((i) => i.quantity_pending || i.unit_price_pending) && (
          <p className="mt-2 text-sm text-amber-700">
            Valores parciais: itens com quantidade ou preço pendente ficam fora da medição e dos
            indicadores.
          </p>
        )}
      </Panel>
      <Panel title="Datas planejadas deste orçamento">
        <p className="mb-4 text-sm text-muted-foreground">
          Defina o início e o término dentro das datas da obra. O cronograma compara a produção
          aprovada com uma distribuição linear nesse período.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action("planejar", { planned_start: planStart, planned_end: planEnd });
          }}
        >
          <label className="text-sm">
            Início
            <Input
              aria-label="Início planejado do orçamento"
              type="date"
              required
              value={planStart}
              disabled={!writable || busy}
              onChange={(e) => setPlanStart(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Término
            <Input
              aria-label="Término planejado do orçamento"
              type="date"
              required
              min={planStart}
              value={planEnd}
              disabled={!writable || busy}
              onChange={(e) => setPlanEnd(e.target.value)}
            />
          </label>
          {writable && (
            <Button type="submit" disabled={busy || budget.status !== "aprovado"}>
              Salvar planejamento
            </Button>
          )}
        </form>
      </Panel>
      <Panel title="Histórico de medições">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Lance a quantidade executada no período. Somente medições aprovadas alimentam o avanço.
            Períodos aprovados não podem se sobrepor.
          </p>
          {writable && (
            <Button
              disabled={
                busy || budget.status !== "aprovado" || budget.execution_status === "concluido"
              }
              onClick={() => open()}
            >
              Nova medição
            </Button>
          )}
        </div>
        {history.length ? (
          <div className="divide-y">
            {history.map((m) => {
              const value = getMeasurementItems(m.id).reduce(
                (sum, line) => sum + Math.round(line.quantity * line.unit_price * 100) / 100,
                0,
              );
              return (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-medium">
                      {fmtDate(m.period_start)} a {fmtDate(m.period_end)} ·{" "}
                      {m.status === "aprovada"
                        ? "Aprovada"
                        : m.status === "substituida"
                          ? "Substituída por revisão"
                          : m.status === "cancelada"
                            ? "Cancelada"
                            : "Rascunho"}
                    </div>
                    <div className="num text-sm text-muted-foreground">
                      {fmtBRL(value)}
                      {m.approved_at && ` · Aprovada em ${fmtDate(m.approved_at)}`}
                      {m.replaces_id && (
                        <span className="ml-2 text-primary">Revisão de medição anterior</span>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => open(m)}>
                    {m.status === "rascunho" &&
                    writable &&
                    (m.created_by === profile?.user_id || approver)
                      ? "Editar medição"
                      : "Ver medição"}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhuma medição cadastrada. Fotos e diários continuam disponíveis na aba ao lado para
            conferência.
          </p>
        )}
      </Panel>
      {editing && (
        <Panel
          title={
            current
              ? current.status === "rascunho"
                ? "Editar medição"
                : "Detalhes da medição"
              : "Nova medição"
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-4"
          >
            {current?.revision_reason && (
              <p className="rounded-md border bg-muted/30 p-3 text-sm">
                <strong>Justificativa da revisão:</strong> {current.revision_reason}
              </p>
            )}
            {current?.replaces_id && current.status === "rascunho" && (
              <p className="text-sm text-muted-foreground">
                Esta revisão substituirá a medição original somente após aprovação. Os indicadores
                continuam usando a versão original até lá.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Início do período
                <Input
                  type="date"
                  required
                  max={TODAY}
                  value={start}
                  disabled={!mayEdit || busy}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Fim do período
                <Input
                  type="date"
                  required
                  min={start}
                  max={TODAY}
                  value={end}
                  disabled={!mayEdit || busy}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <label className="block text-sm">
              Observações
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border bg-card p-3"
                maxLength={5000}
                value={notes}
                disabled={!mayEdit || busy}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <Input
              aria-label="Buscar item da medição"
              placeholder="Buscar código ou serviço"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <caption className="sr-only">Quantidades e saldo dos itens do orçamento</caption>
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b">
                    {[
                      "Código",
                      "Serviço",
                      "Un.",
                      "Orçado",
                      "Anterior ao período",
                      "Neste período",
                      "Acumulado do período",
                      "Saldo atual",
                    ].map((label, i) => (
                      <th
                        key={label}
                        scope="col"
                        className={`p-3 ${i >= 3 ? "text-right" : "text-left"}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((item) => {
                    const previous = previousQuantities.get(item.id) ?? 0;
                    let quantity = 0;
                    try {
                      quantity = parseAmount(quantities[item.id] ?? "") ?? 0;
                    } catch {
                      /* The editable field keeps invalid text until corrected. */
                    }
                    const pending = item.quantity_pending || item.unit_price_pending;
                    return (
                      <tr key={item.id} className="border-b">
                        <td className="p-3">{item.code}</td>
                        <td className="p-3">
                          {item.description}
                          {pending && (
                            <span className="block text-xs text-amber-700">
                              Quantidade ou preço pendente
                            </span>
                          )}
                        </td>
                        <td className="p-3">{item.unit}</td>
                        <td className="num p-3 text-right">{fmtNum(item.planned_quantity, 4)}</td>
                        <td className="num p-3 text-right">{fmtNum(previous, 4)}</td>
                        <td className="p-3">
                          <Input
                            aria-label={`Quantidade do período ${item.code}`}
                            inputMode="decimal"
                            className="min-w-28 text-right"
                            value={quantities[item.id] ?? ""}
                            disabled={!mayEdit || busy || !!pending}
                            onChange={(e) =>
                              setQuantities((q) => ({ ...q, [item.id]: e.target.value }))
                            }
                          />
                        </td>
                        <td className="num p-3 text-right">{fmtNum(previous + quantity, 4)}</td>
                        <td className="num p-3 text-right">
                          {fmtNum(Math.max(0, item.planned_quantity - item.executed_quantity), 4)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              {current && (
                <MeasurementReportDialog
                  key={current.id}
                  budget={budget}
                  measurement={current}
                  disabled={busy || dirty}
                />
              )}
              {current?.status === "aprovada" &&
                approver &&
                writable &&
                !history.some((m) => m.replaces_id === current.id && m.status === "rascunho") && (
                  <div className="w-full space-y-2 rounded-md border p-3">
                    <label className="block text-sm">
                      Justificativa da revisão
                      <Input
                        value={revisionReason}
                        maxLength={5000}
                        placeholder="Explique o que precisa ser corrigido"
                        onChange={(e) => setRevisionReason(e.target.value)}
                      />
                    </label>
                    <Button
                      type="button"
                      disabled={
                        busy ||
                        revisionReason.trim().length < 10 ||
                        budget.execution_status === "concluido"
                      }
                      onClick={() =>
                        void action("revisar", {
                          id: current.id,
                          new_id: crypto.randomUUID(),
                          reason: revisionReason.trim(),
                        })
                      }
                    >
                      Criar revisão
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      A versão aprovada será preservada. Corrija os dados no novo rascunho e
                      encaminhe para aprovação.
                    </p>
                  </div>
                )}
              {current?.status === "aprovada" &&
                history.some((m) => m.replaces_id === current.id && m.status === "rascunho") && (
                  <p className="w-full text-sm text-muted-foreground">
                    Já existe uma revisão em rascunho desta medição. Abra a revisão pelo histórico
                    para continuar.
                  </p>
                )}
              {mayEdit && (
                <Button type="submit" disabled={busy}>
                  {current ? "Salvar alterações" : "Salvar rascunho"}
                </Button>
              )}
              {current?.status === "rascunho" && approver && writable && (
                <Button
                  type="button"
                  disabled={busy || dirty}
                  onClick={() =>
                    void action("aprovar", { id: current.id, revision: current.revision })
                  }
                >
                  Aprovar versão salva
                </Button>
              )}
              {current?.status === "rascunho" && mayEdit && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void action("cancelar", { id: current.id, revision: current.revision })
                  }
                >
                  Cancelar rascunho
                </Button>
              )}
              {current && mayEdit && dirty && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => open(current)}
                >
                  Descartar alterações
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Fechar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {frozen
                ? "Esta medição está encerrada e disponível apenas para consulta. O histórico aprovado foi preservado."
                : "Você pode editar datas, observações e quantidades enquanto a medição estiver em rascunho. Salve as alterações antes de aprovar. Cancelar rascunho encerra a medição; Fechar apenas sai desta edição."}
            </p>
          </form>
        </Panel>
      )}
    </div>
  );
}

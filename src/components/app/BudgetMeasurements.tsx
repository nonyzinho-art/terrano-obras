import { useState } from "react";
import { useBackgroundPause } from "@/lib/background-refresh";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";
import { Panel } from "./bits";
import { MeasurementReportDialog } from "./MeasurementReportDialog";
import { BaselineSection } from "./BaselineSection";
import {
  MeasurementAdvances,
  advanceDraft,
  advancesSignature,
  type AdvanceDraft,
} from "./MeasurementAdvances";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getItemsByBudget,
  getMeasurements,
  getMeasurementItems,
  getMeasurementAdvances,
  getBudgetMeasurementData,
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
import { carriedInFor, settle, settlementFor } from "@/lib/measurement-advances";
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
  const items = [...getItemsByBudget(budget.id)].sort((a, b) =>
    a.code.localeCompare(b.code, "pt-BR", { numeric: true }),
  );
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
  const [advances, setAdvances] = useState<AdvanceDraft[]>(() =>
    initial ? getMeasurementAdvances(initial.id).map(advanceDraft) : [],
  );
  const [retention, setRetention] = useState(
    String(budget.retention_percent ?? 0).replace(".", ","),
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [planStart, setPlanStart] = useState(budget.planned_start ?? "");
  const [planEnd, setPlanEnd] = useState(budget.planned_end ?? "");
  const frozen = !!current && current.status !== "rascunho";
  useBackgroundPause(!!editing || busy);
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
  const savedAdvances = current ? getMeasurementAdvances(current.id).map(advanceDraft) : [];
  const dirty =
    !!editing &&
    !frozen &&
    (current
      ? advancesSignature(advances) !== advancesSignature(savedAdvances) ||
        start !== current.period_start ||
        end !== current.period_end ||
        notes !== current.notes ||
        JSON.stringify(Object.entries(quantities).sort()) !==
          JSON.stringify(Object.entries(savedQuantities).sort())
      : start !== TODAY ||
        end !== TODAY ||
        notes.trim() !== "" ||
        advances.length > 0 ||
        Object.values(quantities).some((value) => value.trim() !== ""));
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
    if (dirty && !window.confirm("Descartar as alterações não salvas desta medição?")) return;
    setEditing(measurement?.id ?? crypto.randomUUID());
    setStart(measurement?.period_start ?? TODAY);
    setEnd(measurement?.period_end ?? TODAY);
    setNotes(measurement?.notes ?? "");
    setSearch("");
    setMessage("");
    setRevisionReason("");
    setAdvances(measurement ? getMeasurementAdvances(measurement.id).map(advanceDraft) : []);
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
        setAdvances(getMeasurementAdvances(String(payload["id"])).map(advanceDraft));
        setQuantities(
          Object.fromEntries(
            getMeasurementItems(String(payload["id"])).map((line) => [
              line.budget_item_id,
              String(line.quantity),
            ]),
          ),
        );
      } else if (name !== "planejar" && name !== "retencao") setEditing(null);
      setMessage(
        name === "aprovar"
          ? "Medição aprovada. Executado, saldo e indicadores atualizados."
          : name === "salvar"
            ? "Medição salva. Você pode continuar editando ou aprovar após conferir."
            : name === "planejar"
              ? "Datas do cronograma atualizadas."
              : name === "retencao"
                ? "Retenção do contrato atualizada. Medições em rascunho usam o novo percentual ao serem salvas."
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
      const advancePayload = [];
      for (const [i, a] of advances.entries()) {
        let amount: number | null = null;
        try {
          amount = parseAmount(a.amount);
        } catch {
          /* tratado abaixo */
        }
        if (!amount || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
          setMessage(
            `Adiantamento ${i + 1}: informe um valor positivo com até duas casas decimais.`,
          );
          return;
        }
        if (!a.supplier.trim()) {
          setMessage(`Adiantamento ${i + 1}: informe o fornecedor.`);
          return;
        }
        advancePayload.push({
          supplier: a.supplier.trim(),
          invoice: a.invoice.trim(),
          uau_process: a.uau_process.trim(),
          paid_on: a.paid_on || null,
          description: a.description.trim(),
          amount,
          source: a.source,
        });
      }
      void action("salvar", {
        id: editing,
        revision: current?.revision,
        period_start: start,
        period_end: end,
        notes,
        items: lines,
        advances: advancePayload,
      });
    } catch {
      setMessage("Confira as quantidades. Use números positivos com até quatro casas decimais.");
    }
  }
  const budgetData = getBudgetMeasurementData(budget.id);
  const measuredNow = items.reduce((sum, item) => {
    let q = 0;
    try {
      q = parseAmount(quantities[item.id] ?? "") ?? 0;
    } catch {
      /* quantidade inválida ainda em edição */
    }
    return sum + Math.round(q * item.unit_price * 100) / 100;
  }, 0);
  const advancesNow = advances.reduce((sum, a) => {
    try {
      return sum + (parseAmount(a.amount) ?? 0);
    } catch {
      return sum;
    }
  }, 0);
  const settlement = settle(
    frozen && current
      ? settlementFor(current, budgetData.measurements, budgetData.lines, budgetData.advances)
          .measured
      : measuredNow,
    Number((frozen ? current?.retention_percent : budget.retention_percent) ?? 0),
    advancesNow,
    editing
      ? carriedInFor(
          { id: editing, period_start: start, replaces_id: current?.replaces_id ?? null },
          budgetData.measurements,
          budgetData.lines,
          budgetData.advances,
        )
      : 0,
  );
  const usedProcesses = new Map<string, string>();
  for (const a of budgetData.advances) {
    const m = budgetData.measurements.find((x) => x.id === a.measurement_id);
    if (
      a.uau_process &&
      m &&
      (m.status === "aprovada" || m.status === "rascunho") &&
      m.id !== editing &&
      m.id !== current?.replaces_id
    )
      usedProcesses.set(
        a.uau_process,
        `medição de ${fmtDate(m.period_start)} a ${fmtDate(m.period_end)}`,
      );
  }
  return (
    <div className="space-y-5">
      <UnsavedChangesGuard
        dirty={
          busy ||
          dirty ||
          planStart !== (budget.planned_start ?? "") ||
          planEnd !== (budget.planned_end ?? "")
        }
      />
      {message && (
        <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
          {message}
        </p>
      )}
      <Panel title="Executado e saldo do orçamento">
        {progress?.unreconciled && (
          <p role="alert" className="mb-3 rounded border bg-warning-soft p-3 text-sm">
            Existem medições aprovadas em versões anteriores. A execução consolidada depende de
            reconciliação; as quantidades não foram copiadas para esta revisão.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="eyebrow">
              {progress?.pendingCount ? "Orçado conhecido (parcial)" : "Orçado"}
            </div>
            <div className="num mt-1 text-lg font-semibold">
              {!progress
                ? "Fora da base atual"
                : !progress.itemCount
                  ? "Sem itens"
                  : progress.pendingCount === progress.itemCount
                    ? "Valores pendentes"
                    : fmtBRL(progress.total)}
            </div>
          </div>
          <div>
            <div className="eyebrow">Executado aprovado</div>
            <div className="num mt-1 text-lg font-semibold text-primary">
              {progress?.unreconciled
                ? "Revisão a conferir"
                : progress?.hasValue
                  ? fmtBRL(progress.executed)
                  : "Sem base de valor"}
            </div>
          </div>
          <div>
            <div className="eyebrow">Saldo a executar</div>
            <div className="num mt-1 text-lg font-semibold">
              {progress?.unreconciled
                ? "Revisão a conferir"
                : progress?.hasValue
                  ? fmtBRL(progress.total - progress.executed)
                  : "Sem base de valor"}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Avanço aprovado:{" "}
          {progress?.unreconciled
            ? "Revisão a conferir"
            : progress?.hasValue
              ? fmtPct(progress.actual)
              : "Sem base de valor"}{" "}
          · ponderado pelos preços do orçamento. Estes valores representam execução valorizada, não
          pagamentos nem custo real.
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
        <BaselineSection
          budget={budget}
          approver={approver && writable}
          busy={busy}
          setBusy={setBusy}
          setMessage={setMessage}
        />
      </Panel>
      <Panel title="Retenção contratual">
        <p className="mb-4 text-sm text-muted-foreground">
          Percentual retido de cada medição (caução). Deixe 0% nos contratos sem retenção. Somente a
          coordenação altera; vale para as medições salvas a partir da mudança.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            let pct: number | null = null;
            try {
              pct = parseAmount(retention.trim() || "0");
            } catch {
              /* tratado abaixo */
            }
            if (pct === null || pct > 100 || Math.round(pct * 100) !== pct * 100) {
              setMessage("Informe a retenção entre 0 e 100%, com até duas casas decimais.");
              return;
            }
            void action("retencao", { retention_percent: pct });
          }}
        >
          <label className="text-sm">
            Retenção (%)
            <Input
              aria-label="Percentual de retenção do contrato"
              inputMode="decimal"
              className="w-28 text-right"
              value={retention}
              disabled={!approver || !writable || busy}
              onChange={(e) => setRetention(e.target.value)}
            />
          </label>
          {approver && writable && (
            <Button type="submit" disabled={busy || budget.status !== "aprovado"}>
              Salvar retenção
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
              const money = settlementFor(
                m,
                budgetData.measurements,
                budgetData.lines,
                budgetData.advances,
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
                      {(money.deducted > 0 || money.retention > 0) &&
                        ` · NF ${fmtBRL(money.invoice)}`}
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
            <div className="relative max-h-[32rem] overflow-auto">
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
                      "Saldo aprovado",
                      "Saldo após este período",
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
                        <td className="num p-3 text-right">
                          {fmtNum(item.planned_quantity - previous - quantity, 4)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <MeasurementAdvances
              advances={advances}
              onChange={setAdvances}
              editable={mayEdit && !busy}
              settlement={settlement}
              used={usedProcesses}
              period={{ start, end }}
            />
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
                onClick={() => {
                  if (!dirty || window.confirm("Descartar as alterações não salvas desta medição?"))
                    setEditing(null);
                }}
              >
                Fechar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {frozen
                ? "Esta medição está encerrada e disponível apenas para consulta. O histórico aprovado foi preservado."
                : "Você pode editar datas, observações, quantidades e adiantamentos enquanto a medição estiver em rascunho. Salve as alterações antes de aprovar. Cancelar rascunho encerra a medição; Fechar apenas sai desta edição."}
            </p>
          </form>
        </Panel>
      )}
    </div>
  );
}

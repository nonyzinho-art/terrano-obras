import { NewWorkDialog } from "@/components/app/NewWorkDialog";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, FileSpreadsheet, ImageIcon, List, Plus } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ActivityList, Panel, StatusBadge } from "@/components/app/bits";
import { Gantt, SituationChip, SITUATION_STYLE } from "@/components/app/Gantt";
import { ReportCalendar } from "@/components/app/ReportCalendar";
import { ReportDetailDialog } from "@/components/app/ReportDetailDialog";
import { NewReportDialog } from "@/components/app/NewReportDialog";
import { PhotoLightbox } from "@/components/app/PhotoLightbox";
import { Button } from "@/components/ui/button";
import {
  getActivities,
  getBudgetsByWork,
  getBudgetSummary,
  getLastReportDate,
  getOpenIssues,
  getProgressCurve,
  getReportItems,
  getReportPhotos,
  getReportsByWork,
  getRunningServicesCount,
  getService,
  getServices,
  getWork,
  getWorkPhotos,
  serviceMetrics,
  useDataVersion,
} from "@/lib/repository";
import { fmtBRL, fmtDate, fmtNum, fmtPct } from "@/lib/format";
import type { DailyReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BudgetStatusBadge } from "@/components/app/BudgetStatusBadge";
import { WorkFronts } from "@/components/app/WorkFronts";
import { WorkDocuments } from "@/components/app/WorkDocuments";
import { useAccess, canWriteWork } from "@/lib/access";

const TABS = [
  { id: "geral", label: "Visão Geral" },
  { id: "evolucao", label: "Evolução Física" },
  { id: "orcamentos", label: "Orçamentos" },
  { id: "diario", label: "Diário de Obras" },
  { id: "fotos", label: "Fotos" },
  { id: "frentes", label: "Frentes de serviço" },
  { id: "documentos", label: "Documentos" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/obras/$id")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: TABS.some((t) => t.id === s["tab"]) ? (s["tab"] as Tab) : undefined,
  }),
  head: () => ({ meta: [{ title: "Obra — Terrano Obras" }] }),
  notFoundComponent: () => (
    <div className="panel p-10 text-center">
      <p className="font-medium">Obra não encontrada.</p>
      <Link to="/obras" className="mt-3 inline-block text-sm text-primary hover:underline">
        Voltar para obras
      </Link>
    </div>
  ),
  component: WorkDetail,
});

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "danger" | "warning" | "primary" | undefined;
}) {
  return (
    <div className="panel p-4">
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          "num mt-1.5 text-2xl font-semibold tracking-tight",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning-foreground",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function WorkDetail() {
  useDataVersion();
  const { id } = Route.useParams();
  const { tab = "geral" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [editing, setEditing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const { canWriteWork } = useAccess();
  const w = getWork(id);
  if (!w)
    return (
      <div className="panel p-8">
        <p>Obra não encontrada ou sem permissão de acesso.</p>
        <Link to="/obras" className="text-primary">
          Voltar para obras
        </Link>
      </div>
    );
  const dev = w.actual_progress - w.planned_progress;
  const last = getLastReportDate(w.id);
  const issues = getOpenIssues(w.id).length;

  return (
    <>
      <Link
        to="/obras"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Minhas Obras
      </Link>
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{w.name}</h1>
            <StatusBadge status={w.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {w.location} ·{" "}
            <span className="num">
              {fmtDate(w.start_date)} a {fmtDate(w.end_date)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWriteWork(w.id) && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar obra
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate({ search: { tab: "diario" } })}>
            <CalendarDays className="size-4" />
            Ver Diário
          </Button>
          <Button variant="outline" asChild>
            <Link to="/orcamentos" search={{ obra: w.id }}>
              <FileSpreadsheet className="size-4" />
              Ver Orçamento
            </Link>
          </Button>
          {canWriteWork(w.id) && w.status !== "concluida" && (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="size-4" />
              Novo Registro
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="Executado"
          value={`${w.actual_progress}%`}
          sub="Avanço físico"
          tone="primary"
        />
        <Metric label="Planejado" value={`${w.planned_progress}%`} sub="Previsto até hoje" />
        <Metric
          label="Desvio"
          value={`${dev > 0 ? "+" : ""}${dev} p.p.`}
          sub={dev < 0 ? "Abaixo do planejado" : "Dentro do planejado"}
          tone={dev <= -10 ? "danger" : dev < 0 ? "warning" : "primary"}
        />
        <Metric
          label="Serviços em andamento"
          value={getRunningServicesCount(w.id)}
          sub={`de ${getServices(w.id).length} serviços`}
        />
        <Metric
          label="Pendências"
          value={issues}
          sub="Abertas em campo"
          tone={issues > 2 ? "warning" : undefined}
        />
        <Metric
          label="Último registro"
          value={last ? fmtDate(last).slice(0, 5) : "—"}
          sub={last ? fmtDate(last) : "Sem diário"}
        />
      </div>

      <div className="mt-6 mb-5 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate({ search: { tab: t.id }, replace: true })}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "geral" && <Overview workId={w.id} />}
      {tab === "evolucao" && <Evolution workId={w.id} />}
      {tab === "orcamentos" && <WorkBudgets workId={w.id} />}
      {tab === "diario" && <WorkDiary workId={w.id} onNew={() => setNewOpen(true)} />}
      {tab === "fotos" && <Photos workId={w.id} />}
      {tab === "frentes" && <WorkFronts key={`frentes-${w.id}`} workId={w.id} />}
      {tab === "documentos" && <WorkDocuments key={`documentos-${w.id}`} workId={w.id} />}

      {editing && (
        <NewWorkDialog key={`editar-${w.id}`} work={w} onClose={() => setEditing(false)} />
      )}
      <NewReportDialog key={w.id} open={newOpen} onOpenChange={setNewOpen} defaultWorkId={w.id} />
    </>
  );
}

function Overview({ workId }: { workId: string }) {
  const w = getWork(workId)!;
  const curve = getProgressCurve(workId);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel
          title="Avanço físico geral — planejado x executado"
          action={
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 bg-muted-foreground" />
                Planejado
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-sm bg-primary" />
                Executado
              </span>
            </div>
          }
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={curve} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="exec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => `${fmtNum(v, 1)}%`}
                  contentStyle={{
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="planejado"
                  name="Planejado"
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  dot={false}
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="executado"
                  name="Executado"
                  stroke="var(--primary)"
                  fill="url(#exec)"
                  strokeWidth={2}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Atividades recentes da obra">
          <ActivityList items={getActivities(workId).slice(0, 6)} />
          {!getActivities(workId).length && null}
        </Panel>
      </div>
      <WorkBudgets workId={workId} />
      <Panel title="Cronograma físico">
        {getServices(workId).length ? (
          <Gantt work={w} services={getServices(workId)} />
        ) : (
          <p className="py-4 text-sm text-muted-foreground">
            Ainda não há serviços com datas planejadas para esta obra. Os itens do orçamento estão
            disponíveis acima; o cronograma depende das datas de início e fim dos serviços.
          </p>
        )}
      </Panel>
    </div>
  );
}

function WorkBudgets({ workId }: { workId: string }) {
  const budgets = getBudgetsByWork(workId);
  return (
    <Panel title={`Orçamentos da obra (${budgets.length})`}>
      {budgets.length ? (
        <div className="space-y-3">
          {budgets.map((budget) => {
            const summary = getBudgetSummary(budget.id);
            return (
              <Link
                key={budget.id}
                to="/orcamentos/$obraId/$orcamentoId"
                params={{ obraId: workId, orcamentoId: budget.id }}
                className="grid gap-3 rounded-md border bg-card p-4 hover:border-primary/40 hover:bg-success-soft/40 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div>
                  <div className="font-semibold text-primary">{budget.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {summary.itemCount} itens · Atualizado em {fmtDate(budget.updated_at)}
                    {budget.revision ? ` · Revisão ${budget.revision}` : ""}
                  </div>
                  {summary.pendingCount > 0 && (
                    <p className="mt-1 text-xs text-warning-foreground">
                      {summary.pendingCount} itens com quantidade ou preço pendente
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="num font-medium">{fmtBRL(summary.total)}</span>
                  <BudgetStatusBadge status={budget.status} />
                  <span className="text-sm text-primary">Abrir orçamento →</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">
          Nenhum orçamento cadastrado para esta obra.
        </p>
      )}
    </Panel>
  );
}

function Evolution({ workId }: { workId: string }) {
  const rows = getServices(workId).map((s) => ({ s, ...serviceMetrics(s) }));
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Panel title="Quantitativos por serviço" className="[&>div:last-child]:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                {[
                  "Serviço",
                  "Unidade",
                  "Previsto",
                  "Executado",
                  "Saldo",
                  "% Executado",
                  "Situação",
                ].map((h, i) => (
                  <th key={h} className={cn("eyebrow px-4 py-2.5", i > 1 && i < 6 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, pct, situation }) => (
                <tr key={s.id} className="num border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.unit}</td>
                  <td className="px-4 py-3 text-right">{fmtNum(s.planned_quantity)}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {fmtNum(s.executed_quantity)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {fmtNum(Math.max(0, s.planned_quantity - s.executed_quantity))}
                  </td>
                  <td className="px-4 py-3 text-right">{fmtPct(pct)}</td>
                  <td className="px-4 py-3">
                    <SituationChip s={situation} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Progresso por serviço">
        <div className="space-y-4">
          {rows.map(({ s, pct, expected, situation }) => (
            <div key={s.id}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium">{s.name}</span>
                <span className="num text-muted-foreground">
                  {fmtPct(pct)}{" "}
                  <span className="text-muted-foreground/70">/ esp. {fmtPct(expected, 0)}</span>
                </span>
              </div>
              <div className="relative h-2.5 rounded-sm bg-muted">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-sm",
                    SITUATION_STYLE[situation].bar,
                  )}
                  style={{ width: `${pct}%` }}
                />
                <div
                  className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-foreground/50"
                  style={{ left: `${expected}%` }}
                />
              </div>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            A marca vertical indica o percentual esperado para hoje conforme o cronograma.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function WorkDiary({ workId, onNew }: { workId: string; onNew: () => void }) {
  const [view, setView] = useState<"month" | "list">("month");
  const [sel, setSel] = useState<DailyReport | null>(null);
  const reports = getReportsByWork(workId);
  const sorted = [...reports].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Panel
      title={`Registros de diário (${reports.length})`}
      action={
        <div className="flex items-center gap-2">
          <ViewToggle
            value={view}
            onChange={(v) => setView(v as "month" | "list")}
            options={[
              ["month", "Calendário", CalendarDays],
              ["list", "Lista", List],
            ]}
          />
          <Button size="sm" disabled={!canWriteWork(workId)} onClick={onNew}>
            <Plus className="size-3.5" />
            Novo Registro
          </Button>
        </div>
      }
    >
      {view === "month" ? (
        <ReportCalendar reports={reports} onSelect={setSel} />
      ) : (
        <ReportList reports={sorted} onSelect={setSel} />
      )}
      <ReportDetailDialog report={sel} onClose={() => setSel(null)} />
    </Panel>
  );
}

export function ViewToggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string, React.ComponentType<{ className?: string }>][];
}) {
  return (
    <div className="inline-flex rounded-md border bg-muted/50 p-0.5">
      {options.map(([v, label, Icon]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            "flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium",
            value === v
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function ReportList({
  reports,
  onSelect,
  showWork,
}: {
  reports: DailyReport[];
  onSelect: (r: DailyReport) => void;
  showWork?: boolean;
}) {
  if (!reports.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p>
    );
  return (
    <div className="divide-y rounded-md border">
      {reports.map((r) => {
        const items = getReportItems(r.id);
        const photos = getReportPhotos(r.id).length;
        return (
          <button
            key={r.id}
            onClick={() => onSelect(r)}
            className="grid w-full gap-2 px-4 py-3 text-left text-sm hover:bg-muted/40 sm:grid-cols-[110px_1fr_auto] sm:items-center"
          >
            <div>
              <div className="num font-semibold">{fmtDate(r.date)}</div>
              <div className="text-xs text-muted-foreground">{r.weather}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium">
                {showWork ? `${getWork(r.work_id)?.name} · ` : ""}
                {items
                  .map(
                    (i) =>
                      `${getService(i.service_id)?.name} — ${fmtNum(i.executed_quantity)} ${getService(i.service_id)?.unit}`,
                  )
                  .join(" · ") || "Sem serviços"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {r.responsible_user} · {r.workers_quantity} trabalhadores · {photos} fotos
              </div>
            </div>
            <span
              className={cn(
                "justify-self-start rounded-sm px-2 py-0.5 text-xs font-medium sm:justify-self-end",
                r.status === "rascunho"
                  ? "bg-warning-soft text-warning-foreground"
                  : "bg-success-soft text-primary",
              )}
            >
              {r.status === "rascunho" ? "Rascunho" : "Finalizado"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Photos({ workId }: { workId: string }) {
  const all = getWorkPhotos(workId);
  const reports = getReportsByWork(workId);
  const reportById = useMemo(() => new Map(reports.map((r) => [r.id, r])), [reports]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rep, setRep] = useState("");
  const [lb, setLb] = useState<number | null>(null);
  const photos = all.filter((p) => {
    const d = reportById.get(p.daily_report_id)?.date ?? "";
    return (!from || d >= from) && (!to || d <= to) && (!rep || p.daily_report_id === rep);
  });
  const withPhotos = reports
    .filter((r) => all.some((p) => p.daily_report_id === r.id))
    .sort((a, b) => b.date.localeCompare(a.date));
  const inputCls = "h-9 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <Panel
      title={`Galeria (${photos.length} fotos)`}
      action={<ImageIcon className="size-4 text-muted-foreground" />}
    >
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          De
          <input
            type="date"
            className={cn(inputCls, "mt-1 block")}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Até
          <input
            type="date"
            className={cn(inputCls, "mt-1 block")}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Diário
          <select
            className={cn(inputCls, "mt-1 block min-w-[220px]")}
            value={rep}
            onChange={(e) => setRep(e.target.value)}
          >
            <option value="">Todos os diários</option>
            {withPhotos.map((r) => (
              <option key={r.id} value={r.id}>
                {fmtDate(r.date)} — {r.responsible_user}
              </option>
            ))}
          </select>
        </label>
        {(from || to || rep) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
              setRep("");
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>
      {photos.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {photos.map((p, i) => {
            const r = reportById.get(p.daily_report_id);
            return (
              <figure key={p.id} className="group overflow-hidden rounded-md border bg-card">
                <button onClick={() => setLb(i)} className="block w-full overflow-hidden">
                  <img
                    src={p.file_url}
                    alt={p.description}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </button>
                <figcaption className="p-3">
                  <p className="truncate text-sm font-medium">{p.description}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="size-3" />
                    Diário de {r ? fmtDate(r.date) : "—"}
                  </p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma foto para os filtros selecionados.
        </p>
      )}
      <PhotoLightbox photos={photos} index={lb} onChange={setLb} />
    </Panel>
  );
}

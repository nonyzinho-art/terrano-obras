import type { Work, WorkService } from "@/lib/types";
import { serviceMetrics, SITUATION_LABEL, TODAY, type ServiceSituation } from "@/lib/repository";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const SITUATION_STYLE: Record<ServiceSituation, { bar: string; chip: string }> = {
  concluido: { bar: "bg-muted-foreground", chip: "bg-muted text-muted-foreground" },
  em_andamento: { bar: "bg-primary", chip: "bg-success-soft text-primary" },
  atrasado: { bar: "bg-danger", chip: "bg-danger-soft text-danger" },
  nao_iniciado: { bar: "bg-planned", chip: "bg-secondary text-muted-foreground" },
};

export function SituationChip({ s }: { s: ServiceSituation }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-sm px-2 py-0.5 text-xs font-medium",
        SITUATION_STYLE[s].chip,
      )}
    >
      {SITUATION_LABEL[s]}
    </span>
  );
}

export function Gantt({ work, services }: { work: Work; services: WorkService[] }) {
  const start = new Date(work.start_date);
  const end = new Date(work.end_date);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) {
    return (
      <p className="text-sm text-muted-foreground">
        Defina as datas da obra para visualizar o cronograma.
      </p>
    );
  }
  const t0 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
  const t1 = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1);
  const now = Date.parse(TODAY);
  const pos = (t: number) => Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100));
  const months: { label: string; left: number }[] = [];
  const d = new Date(t0);
  while (d.getTime() < t1) {
    months.push({
      label: `${MONTHS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`,
      left: pos(d.getTime()),
    });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const timelineWidth = Math.max(600, months.length * 110);
  const columns = `220px ${timelineWidth}px 190px`;
  const nowPos = pos(now);

  return (
    <div className="min-w-0">
      <p className="mb-3 text-xs text-muted-foreground">
        Role para os lados para consultar os meses. Os serviços permanecem fixos.
      </p>
      <div
        className="max-h-[560px] w-full overflow-auto rounded-md border"
        tabIndex={0}
        role="region"
        aria-label="Cronograma físico com rolagem horizontal"
      >
        <div style={{ width: timelineWidth + 410 }}>
          <div
            className="sticky top-0 z-30 grid items-center border-b bg-background text-xs"
            style={{ gridTemplateColumns: columns }}
          >
            <div className="eyebrow sticky left-0 z-20 border-r bg-background px-3 py-4">
              Serviço
            </div>
            <div className="relative h-12 overflow-hidden">
              {months.map((m) => (
                <span
                  key={m.label}
                  className="absolute top-4 whitespace-nowrap pl-2 text-muted-foreground"
                  style={{ left: `${m.left}%` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <div className="eyebrow sticky right-0 z-20 border-l bg-background px-3 py-4 text-right">
              Executado / Previsto
            </div>
          </div>
          {services.map((s) => {
            const { pct, expected, situation } = serviceMetrics(s);
            const late = situation === "atrasado";
            const left = pos(Date.parse(s.planned_start)),
              width = pos(Date.parse(s.planned_end)) - left;
            return (
              <div
                key={s.id}
                className="grid items-stretch border-b text-sm last:border-0"
                style={{ gridTemplateColumns: columns }}
              >
                <div className="sticky left-0 z-10 border-r bg-background px-3 py-3">
                  <div className="flex items-center gap-2 font-medium">{s.name}</div>
                  <div className="num text-xs text-muted-foreground">
                    {fmtDate(s.planned_start)} – {fmtDate(s.planned_end)}
                  </div>
                </div>
                <div className="relative min-h-16 overflow-hidden">
                  {months.map((m) => (
                    <span
                      key={m.label}
                      className="absolute inset-y-0 w-px bg-border/70"
                      style={{ left: `${m.left}%` }}
                    />
                  ))}
                  <div
                    className="absolute top-5 h-5 overflow-hidden rounded-sm bg-planned"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${SITUATION_LABEL[situation]} · esperado ${fmtPct(expected)}`}
                  >
                    {late && (
                      <div
                        className="absolute inset-y-0 left-0 bg-danger/25"
                        style={{ width: `${expected}%` }}
                      />
                    )}
                    <div
                      className={cn("absolute inset-y-0 left-0", SITUATION_STYLE[situation].bar)}
                      style={{ width: `${pct}%` }}
                    />
                    {pct >= 14 && (
                      <span className="num absolute inset-y-0 left-1.5 flex items-center text-[10px] font-semibold text-primary-foreground">
                        {fmtPct(pct)}
                      </span>
                    )}
                  </div>
                  {now >= t0 && now < t1 && (
                    <span
                      className="absolute -top-1 -bottom-1 w-px bg-warning"
                      style={{ left: `${nowPos}%` }}
                    />
                  )}
                </div>
                <div className="num sticky right-0 z-10 border-l bg-background px-3 py-3 text-right text-xs">
                  <div className="font-medium">
                    {fmtNum(s.executed_quantity)} / {fmtNum(s.planned_quantity)} {s.unit}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <span className="text-muted-foreground">{fmtPct(pct)}</span>
                    <SituationChip s={situation} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-planned" />
          Planejado / não iniciado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-primary" />
          Em andamento no prazo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-danger" />
          Atrasado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-danger/25" />
          Déficit vs. planejado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-muted-foreground" />
          Concluído
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-warning" />
          Hoje
        </span>
      </div>
    </div>
  );
}

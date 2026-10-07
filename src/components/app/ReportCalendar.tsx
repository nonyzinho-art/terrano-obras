import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseISO, toISO } from "@/lib/format";
import { getWork, TODAY } from "@/lib/repository";
import type { DailyReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function ReportCalendar({
  reports,
  mode = "month",
  onSelect,
  showWork,
  onDateSelect,
}: {
  reports: DailyReport[];
  mode?: "month" | "week";
  onSelect: (r: DailyReport) => void;
  showWork?: boolean;
  onDateSelect?: (date: string, reports: DailyReport[]) => void;
}) {
  const [cursor, setCursor] = useState(() => parseISO(TODAY));
  const byDate = new Map<string, DailyReport[]>();
  reports.forEach((r) => byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]));

  let days: Date[] = [];
  if (mode === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    if (days[35]!.getMonth() !== cursor.getMonth()) days = days.slice(0, 35);
  } else {
    const start = new Date(cursor);
    start.setDate(cursor.getDate() - cursor.getDay());
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
  }
  const shift = (n: number) => {
    const d = new Date(cursor);
    if (mode === "month") {
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
    } else d.setDate(d.getDate() + 7 * n);
    setCursor(d);
  };
  const title =
    mode === "month"
      ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
      : `${days[0]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${days[6]!.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold capitalize">{title}</h3>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setCursor(parseISO(TODAY))}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => shift(-1)}
            aria-label="Anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => shift(1)}
            aria-label="Próximo"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-md border">
        {WD.map((w) => (
          <div key={w} className="eyebrow border-b bg-muted/50 px-2 py-2 text-center">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const iso = toISO(d);
          const list = byDate.get(iso) ?? [];
          const out = mode === "month" && d.getMonth() !== cursor.getMonth();
          return (
            <div
              key={iso}
              className={cn(
                "border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0",
                mode === "month" ? "min-h-[92px]" : "min-h-[220px]",
                out && "bg-muted/30",
                list.length && !out && "bg-primary-soft/40",
              )}
            >
              {onDateSelect ? (
                <button
                  type="button"
                  onClick={() => onDateSelect(iso, list)}
                  aria-label={`${d.toLocaleDateString("pt-BR")} — ${list.length ? `${list.length} registro(s)` : "Novo Diário"}`}
                  aria-current={iso === TODAY ? "date" : undefined}
                  className="flex min-h-[78px] w-full flex-col items-center gap-1 rounded-sm px-0.5 py-1 text-center hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-primary sm:items-start sm:px-1"
                >
                  <span
                    className={cn(
                      "num flex size-6 items-center justify-center rounded-full text-xs",
                      iso === TODAY
                        ? "bg-primary font-semibold text-primary-foreground"
                        : out
                          ? "text-muted-foreground/50"
                          : "text-muted-foreground",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {list.length ? (
                    <span className="flex flex-wrap gap-1 text-[10px] sm:text-xs">
                      {list.some((r) => r.status === "finalizado") && (
                        <span className="rounded-sm bg-success-soft px-1 text-primary">
                          <span className="sm:hidden">F: </span>
                          <span className="hidden sm:inline">Finalizados: </span>
                          {list.filter((r) => r.status === "finalizado").length}
                        </span>
                      )}
                      {list.some((r) => r.status === "rascunho") && (
                        <span className="rounded-sm bg-warning-soft px-1 text-warning-foreground">
                          <span className="sm:hidden">R: </span>
                          <span className="hidden sm:inline">Rascunhos: </span>
                          {list.filter((r) => r.status === "rascunho").length}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      <span className="sm:hidden">+</span>
                      <span className="hidden sm:inline">+ Novo Diário</span>
                    </span>
                  )}
                </button>
              ) : (
                <>
                  <div
                    className={cn(
                      "num mb-1 flex size-6 items-center justify-center rounded-full text-xs",
                      iso === TODAY
                        ? "bg-primary font-semibold text-primary-foreground"
                        : out
                          ? "text-muted-foreground/50"
                          : "text-muted-foreground",
                    )}
                  >
                    {d.getDate()}
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, mode === "month" ? 3 : 10).map((r) => (
                      <button
                        key={r.id}
                        onClick={() => onSelect(r)}
                        className={cn(
                          "flex w-full items-center gap-1 truncate rounded-sm border-l-2 px-1.5 py-0.5 text-left text-[11px] hover:brightness-95",
                          r.status === "rascunho"
                            ? "border-warning bg-warning-soft text-warning-foreground"
                            : "border-primary bg-card text-foreground shadow-sm",
                        )}
                      >
                        <span className="truncate">
                          {showWork
                            ? getWork(r.work_id)?.name
                            : r.responsible_user.replace(/^(Eng\.|Téc\.) /, "")}
                        </span>
                      </button>
                    ))}
                    {mode === "month" && list.length > 3 && (
                      <div className="px-1 text-[11px] text-muted-foreground">
                        +{list.length - 3} registros
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-1 bg-primary" />
          Finalizado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-1 bg-warning" />
          Rascunho
        </span>
      </div>
    </div>
  );
}

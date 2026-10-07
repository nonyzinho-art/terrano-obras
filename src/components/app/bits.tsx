import { Camera, ClipboardList, Wrench, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/repository";
import type { Activity, WorkStatus } from "@/lib/types";

const STATUS_STYLE: Record<WorkStatus, { badge: string; dot: string; bar: string }> = {
  em_andamento: { badge: "bg-success-soft text-primary", dot: "bg-success", bar: "bg-primary" },
  atencao: { badge: "bg-warning-soft text-warning-foreground", dot: "bg-warning", bar: "bg-warning" },
  atrasada: { badge: "bg-danger-soft text-danger", dot: "bg-danger", bar: "bg-danger" },
  concluida: { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground", bar: "bg-muted-foreground" },
};

export function StatusBadge({ status }: { status: WorkStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium", s.badge)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ProgressBar({ value, planned, status = "em_andamento", className }: { value: number; planned?: number; status?: WorkStatus; className?: string }) {
  return (
    <div className={cn("relative h-1.5 w-full rounded-full bg-muted", className)}>
      <div className={cn("absolute inset-y-0 left-0 rounded-full", STATUS_STYLE[status].bar)} style={{ width: `${Math.min(100, value)}%` }} />
      {planned !== undefined && (
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-foreground/60" style={{ left: `${Math.min(100, planned)}%` }} title={`Planejado ${planned}%`} />
      )}
    </div>
  );
}

const ICON = { diario: ClipboardList, foto: Camera, servico: Wrench, pendencia: CircleCheck };

export function ActivityList({ items, workName }: { items: Activity[]; workName?: (id: string) => string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Sem atividades recentes.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:left-[13px] before:top-1 before:bottom-1 before:w-px before:bg-border">
      {items.map((a) => {
        const Icon = ICON[a.kind];
        const d = new Date(a.at);
        return (
          <li key={a.id} className="relative flex gap-3">
            <div className="z-10 grid size-7 shrink-0 place-items-center rounded-full border bg-card text-primary"><Icon className="size-3.5" /></div>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm leading-snug">{a.text}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {workName && <span className="font-medium text-foreground/70">{workName(a.work_id)} · </span>}
                {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("panel", className)}>
      {title && (
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

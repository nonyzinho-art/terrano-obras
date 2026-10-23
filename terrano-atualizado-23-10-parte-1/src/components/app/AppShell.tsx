import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, HardHat, CalendarDays, FileSpreadsheet, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/obras", label: "Obras", icon: HardHat },
  { to: "/diario", label: "Diário de Obras", icon: CalendarDays },
  { to: "/cotacoes", label: "Cotações", icon: FileSpreadsheet },
  { to: "/orcamentos", label: "Orçamentos", icon: FileSpreadsheet },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border">
      <div className="grid size-8 place-items-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
        T
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-sidebar-accent-foreground">Terrano Obras</div>
        <div className="text-[11px] text-sidebar-foreground/70">Urbanismo & Infraestrutura</div>
      </div>
    </div>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-0.5 p-3">
      <div className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
        Gestão
      </div>
      {NAV.map((n) => {
        const active = "exact" in n ? path === n.to : path.startsWith(n.to);
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors border-l-2",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-primary font-medium"
                : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <n.icon className="size-4" strokeWidth={1.75} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar lg:flex">
        <Brand />
        <Nav />
        <div className="mt-auto border-t border-sidebar-border p-4 flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            T
          </div>
          <div className="leading-tight">
            <div className="text-xs font-medium text-sidebar-accent-foreground">Terrano Obras</div>
            <div className="text-[11px] text-sidebar-foreground/70">Gestão de obras</div>
          </div>
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar">
            <button
              className="absolute right-3 top-5 text-sidebar-foreground"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="size-5" />
            </button>
            <Brand />
            <Nav onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold">Terrano Obras</span>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

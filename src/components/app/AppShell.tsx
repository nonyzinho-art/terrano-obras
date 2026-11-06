import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  ChevronsUpDown,
  FileSpreadsheet,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Ruler,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Painel", icon: LayoutDashboard, exact: true },
  { to: "/obras", label: "Obras", icon: Building2 },
  { to: "/diario", label: "Diário de obras", icon: CalendarDays },
  { to: "/orcamentos", label: "Orçamentos", icon: FileSpreadsheet },
  { to: "/medicoes", label: "Medições", icon: Ruler },
  { to: "/cotacoes", label: "Cotações", icon: Handshake },
] as const;

/** Signed-in account shown in the sidebar footer and the mobile header. */
export type ShellAccount = {
  name: string;
  email: string;
  roleLabel: string;
  isAdmin: boolean;
  busy: boolean;
  syncMessage?: string;
  onProfile: () => void;
  onAdmin: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
};

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground",
        className,
      )}
    >
      T
    </div>
  );
}

function Brand() {
  return (
    <div className="flex h-16 items-center gap-2.5 px-5">
      <BrandMark />
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-[0.12em] text-sidebar-accent-foreground">
          TERRANO
        </div>
        <div className="text-[11px] text-sidebar-foreground/80">Gestão de obras</div>
      </div>
    </div>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {NAV.map((n) => {
        const active = "exact" in n ? path === n.to : path.startsWith(n.to);
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
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

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

function AccountMenu({ account, compact }: { account: ShellAccount; compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu da conta"
        className={cn(
          "flex items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          compact ? "p-1" : "w-full px-3 py-2.5 text-sidebar-foreground hover:bg-sidebar-accent/50",
        )}
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
            compact ? "bg-brand text-white" : "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          {initials(account.name)}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-sidebar-accent-foreground">
                {account.name}
              </span>
              <span className="block truncate text-[11px] text-sidebar-foreground/80">
                {account.roleLabel}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-70" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={compact ? "bottom" : "top"} align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{account.name}</div>
          <div className="truncate text-xs text-muted-foreground">{account.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={account.onProfile}>
          <UserRound className="size-4" /> Meu perfil e Telegram
        </DropdownMenuItem>
        {account.isAdmin && (
          <DropdownMenuItem onSelect={account.onAdmin}>
            <ShieldCheck className="size-4" /> Gerenciar acessos
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={account.busy} onSelect={account.onRefresh}>
          <RefreshCw className="size-4" /> Atualizar dados
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={account.onSignOut}>
          <LogOut className="size-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children, account }: { children: ReactNode; account?: ShellAccount }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar lg:flex">
        <Brand />
        <Nav />
        {account && (
          <div className="mt-auto border-t border-sidebar-border p-2">
            {account.syncMessage && (
              <p role="status" className="px-3 pb-1.5 pt-1 text-[11px] text-sidebar-foreground/70">
                {account.syncMessage}
              </p>
            )}
            <AccountMenu account={account} />
          </div>
        )}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar">
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
          <span className="text-sm font-bold tracking-[0.12em] text-brand">TERRANO</span>
          {account && (
            <div className="ml-auto">
              <AccountMenu account={account} compact />
            </div>
          )}
        </header>
        <main className="mx-auto min-w-0 max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</main>
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
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-brand sm:text-[1.65rem]">{title}</h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

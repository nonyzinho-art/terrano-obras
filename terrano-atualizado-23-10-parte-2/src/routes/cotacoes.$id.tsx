import { AddQuoteSupplierDialog } from "@/components/app/AddQuoteSupplierDialog";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Panel } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAccess } from "@/lib/access";
import { getSupabase } from "@/lib/supabase";
import { getWork, replaceData } from "@/lib/repository";
import { loadCloudData } from "@/lib/cloud-data";
import {
  loadQuote,
  quoteStatus,
  quoteError,
  supplierLink,
  latestProposals,
  proposalCoverage,
  approvalRoles,
  type Proposal,
} from "@/lib/quotes";
import { fmtBRL, fmtNum, fmtDate } from "@/lib/format";
import { budgetHierarchy } from "@/lib/budget-hierarchy";
export const Route = createFileRoute("/cotacoes/$id")({
  head: () => ({ meta: [{ title: "Cotação — Terrano Obras" }] }),
  component: QuoteDetail,
});
function QuoteDetail() {
  const { id } = Route.useParams();
  const { profile, canWriteWork } = useAccess();
  const query = useQuery({
    queryKey: ["quote", id, profile?.user_id],
    queryFn: () => loadQuote(id),
  });
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    action: string;
    target?: string | undefined;
    role?: string | undefined;
    message: string;
  } | null>(null);
  const [visibleLink, setVisibleLink] = useState<string | null>(null);
  const action = async () => {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabase().rpc("quote_action", {
        p_quote: id,
        p_action: confirm.action,
        p_target: confirm.target ?? null,
        p_role: confirm.role ?? null,
      });
      if (error) throw error;
      toast.success("Cotação atualizada.");
      setConfirm(null);
      await query.refetch();
      if (confirm.action === "aprovar") replaceData(await loadCloudData());
    } catch (e) {
      setError(quoteError(e));
    } finally {
      setBusy(false);
    }
  };
  if (query.isPending) return <p>Carregando cotação…</p>;
  if (query.error || !query.data) return <p role="alert">{quoteError(query.error)}</p>;
  const { quote: q, items, invites, proposals, prices, approvals } = query.data;
  const latest = latestProposals(proposals).sort((a, b) => a.total - b.total);
  const writable = canWriteWork(q.work_id);
  const closed = q.status === "aprovada" || q.status === "cancelada";
  const selected = proposals.find((p) => p.id === q.selected_proposal);
  const ask = (action: string, message: string, target?: string, role?: string) =>
    setConfirm({ action, message, target, role });
  const totalFor = (p: Proposal, itemId: string) => {
    const price = prices.find((x) => x.proposal_id === p.id && x.item_id === itemId)?.unit_price;
    return price == null
      ? null
      : Math.round(price * items.find((i) => i.id === itemId)!.quantity * 100) / 100;
  };
  const copy = async (token: string) => {
    const link = supplierLink(token);
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      setVisibleLink(link);
    }
  };
  return (
    <>
      <Link to="/cotacoes" className="mb-4 inline-block text-sm text-primary">
        ← Voltar às cotações
      </Link>
      <PageHeader
        eyebrow={getWork(q.work_id)?.name ?? "Obra"}
        title={q.name}
        description={`${quoteStatus[q.status]} · Prazo: ${fmtDate(q.deadline)} · ${items.length} itens`}
        actions={
          <Button
            variant="outline"
            disabled={busy || query.isFetching}
            onClick={() => void query.refetch()}
          >
            Atualizar propostas
          </Button>
        }
      />
      {q.notes && (
        <Panel title="Orientações da cotação">
          <p className="whitespace-pre-wrap text-sm">{q.notes}</p>
        </Panel>
      )}
      {error && (
        <p role="alert" className="my-4 rounded border bg-warning-soft p-3 text-sm">
          {error}
        </p>
      )}
      <div className="mt-5 space-y-5">
        <Panel
          title="Fornecedores e convites"
          action={
            writable && q.status === "aberta" ? (
              <Button size="sm" onClick={() => setAddingSupplier(true)}>
                Adicionar fornecedor
              </Button>
            ) : undefined
          }
        >
          <p className="mb-3 text-sm text-muted-foreground">
            Copie e envie o link de cada fornecedor. Os convites dão acesso somente aos itens e
            anexos desta cotação.
          </p>
          {typeof window !== "undefined" &&
            ["localhost", "127.0.0.1"].includes(window.location.hostname) && (
              <p className="mb-3 rounded bg-warning-soft p-3 text-sm">
                Você está usando o endereço local. Estes links funcionam neste computador; para
                enviar aos fornecedores, abra o sistema pelo endereço publicado.
              </p>
            )}
          {invites.map((i) => {
            const p = latest.find((p) => p.invite_id === i.id);
            return (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"
              >
                <div>
                  <h3 className="font-medium">{i.supplier_name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {i.email || "Sem e-mail cadastrado"} ·{" "}
                    {!i.active
                      ? "Convite desativado"
                      : p
                        ? `Proposta recebida · Revisão ${p.version}`
                        : "Aguardando proposta"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!i.active || closed}
                    onClick={() => void copy(i.token)}
                  >
                    Copiar link
                  </Button>
                  <a
                    className="inline-flex items-center rounded border px-3 text-xs text-primary"
                    href={supplierLink(i.token)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir formulário
                  </a>
                  {p && (
                    <Button size="sm" variant="outline" onClick={() => setHistory(i.id)}>
                      Histórico
                    </Button>
                  )}
                  {writable && q.status === "aberta" && p && i.active && !i.revision_allowed && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        ask(
                          "revisao",
                          "Liberar uma nova proposta para este fornecedor? A proposta anterior será preservada.",
                          i.id,
                        )
                      }
                    >
                      Liberar revisão
                    </Button>
                  )}
                  {writable && !closed && i.active && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        ask(
                          "desativar_convite",
                          "Desativar este convite? O fornecedor perderá o acesso ao formulário.",
                          i.id,
                        )
                      }
                    >
                      Desativar link
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Panel>
        <Panel title="Comparação das propostas">
          <p className="mb-3 text-xs text-muted-foreground">
            Propostas parciais estão identificadas. A comparação por item ajuda a conferir o mesmo
            escopo antes de selecionar.
          </p>
          {!latest.length ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhuma proposta recebida ainda.</p>
          ) : (
            <>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                {latest.map((p) => {
                  const coverage = proposalCoverage(p, items, prices);
                  return (
                    <div
                      key={p.id}
                      className={`rounded border p-4 ${p.id === q.selected_proposal ? "border-primary bg-success-soft" : "bg-card"}`}
                    >
                      <h3 className="font-semibold">{p.supplier_name}</h3>
                      <p className="num my-2 text-xl font-semibold">{fmtBRL(p.total)}</p>
                      <p className="text-xs text-muted-foreground">
                        Revisão {p.version} · {coverage.quoted}/{items.length} itens cotados ·{" "}
                        {fmtDate(p.created_at)}
                      </p>
                      {!coverage.complete && (
                        <p className="mt-1 text-xs text-warning-foreground">
                          Proposta parcial — solicite os preços restantes para aprovar.
                        </p>
                      )}
                      {p.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{p.notes}</p>}
                      {p.id === q.selected_proposal ? (
                        <p className="mt-3 text-sm font-medium text-primary">
                          Proposta selecionada
                        </p>
                      ) : (
                        writable &&
                        !closed && (
                          <Button
                            className="mt-3"
                            size="sm"
                            disabled={
                              !coverage.complete ||
                              !invites.find((i) => i.id === p.invite_id)?.active
                            }
                            onClick={() =>
                              ask(
                                "selecionar",
                                "Selecionar esta proposta para aprovação? A troca de seleção reinicia as aprovações e pausa novos envios.",
                                p.id,
                              )
                            }
                          >
                            Selecionar para aprovação
                          </Button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="max-h-[560px] overflow-auto rounded border">
                <table className="w-max min-w-full text-sm">
                  <thead className="sticky top-0 z-20 bg-muted">
                    <tr>
                      <th className="sticky left-0 z-30 min-w-64 bg-muted p-3 text-left">
                        Serviço / insumo
                      </th>
                      <th className="p-3">Quantidade</th>
                      {latest.map((p) => (
                        <th key={p.id} className="min-w-40 p-3 text-right">
                          {p.supplier_name}
                          <span className="block text-xs font-normal">Preço unitário / Total</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {budgetHierarchy(items).map((row) =>
                      row.kind === "group" ? (
                        <tr
                          key={`g-${row.code}`}
                          className={
                            row.depth === 1
                              ? "bg-primary text-primary-foreground"
                              : "bg-success-soft text-primary"
                          }
                        >
                          <th
                            className={`sticky left-0 z-10 max-w-96 p-3 text-left ${row.depth === 1 ? "bg-primary" : "bg-success-soft"}`}
                          >
                            {row.code} — {row.name}
                          </th>
                          <td />
                          {latest.map((p) => (
                            <td key={p.id} className="num p-3 text-right">
                              {fmtBRL(
                                row.items.reduce((sum, i) => sum + (totalFor(p, i.id) ?? 0), 0),
                              )}
                            </td>
                          ))}
                        </tr>
                      ) : (
                        <tr key={row.item.id} className="border-b bg-card">
                          <td className="sticky left-0 z-10 max-w-96 bg-card p-3">
                            {row.item.code} — {row.item.description}
                          </td>
                          <td className="num p-3 text-right">
                            {fmtNum(row.item.quantity, 4)} {row.item.unit}
                          </td>
                          {latest.map((p) => {
                            const price = prices.find(
                              (x) => x.proposal_id === p.id && x.item_id === row.item.id,
                            )?.unit_price;
                            return (
                              <td key={p.id} className="num p-3 text-right">
                                {price == null ? (
                                  <span className="text-warning-foreground">Não cotado</span>
                                ) : (
                                  <>
                                    {fmtBRL(price)}
                                    <strong className="block">
                                      {fmtBRL(totalFor(p, row.item.id)!)}
                                    </strong>
                                  </>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
        <Panel title="Aprovação interna">
          {selected ? (
            <>
              <p className="mb-4 text-sm">
                Selecionada: <strong>{selected.supplier_name}</strong> · {fmtBRL(selected.total)}
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {approvalRoles.map((role) => {
                  const decision = approvals.find(
                    (a) => a.cycle === q.approval_cycle && a.role === role.role,
                  );
                  return (
                    <div key={role.role} className="rounded border p-4">
                      <h3 className="font-medium">{role.label}</h3>
                      {decision ? (
                        <p className="mt-2 text-sm text-primary">
                          Aprovado em {fmtDate(decision.decided_at)}
                        </p>
                      ) : (
                        <>
                          <p className="my-2 text-xs text-muted-foreground">Aguardando aprovação</p>
                          {writable &&
                            q.status === "em_aprovacao" &&
                            (profile?.role === role.role || profile?.role === "administrador") && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  ask(
                                    "aprovar",
                                    `Confirmar aprovação por ${role.label}? Após as três aprovações, o orçamento será gerado para acompanhamento.`,
                                    undefined,
                                    role.role,
                                  )
                                }
                              >
                                Aprovar
                              </Button>
                            )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecione uma proposta completa para encaminhar às coordenações e diretoria.
            </p>
          )}
          {q.budget_id && (
            <Button className="mt-4" asChild>
              <Link
                to="/orcamentos/$obraId/$orcamentoId"
                params={{ obraId: q.work_id, orcamentoId: q.budget_id }}
              >
                Abrir orçamento aprovado
              </Link>
            </Button>
          )}
          {writable && q.status === "em_aprovacao" && profile?.role !== "engenheiro" && (
            <Button
              className="mt-4"
              variant="outline"
              onClick={() =>
                ask(
                  "reabrir",
                  "Reabrir para negociação? As aprovações deste ciclo serão preservadas no histórico, mas precisarão ser feitas novamente.",
                )
              }
            >
              Reabrir para negociação
            </Button>
          )}
          {writable && !closed && (
            <Button
              className="mt-4 ml-2"
              variant="outline"
              onClick={() =>
                ask(
                  "cancelar",
                  "Cancelar esta cotação? Os registros serão preservados e os envios serão encerrados.",
                )
              }
            >
              Cancelar cotação
            </Button>
          )}
        </Panel>
      </div>
      {addingSupplier && (
        <AddQuoteSupplierDialog
          quote={q}
          onClose={() => setAddingSupplier(false)}
          onSaved={() => {
            void query.refetch();
          }}
        />
      )}
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar alteração</DialogTitle>
            <DialogDescription>{confirm?.message}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button disabled={busy} onClick={() => void action()}>
              {busy ? "Salvando…" : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!visibleLink}
        onOpenChange={(open) => {
          if (!open) setVisibleLink(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link do fornecedor</DialogTitle>
            <DialogDescription>
              Copie o endereço abaixo e envie ao fornecedor convidado.
            </DialogDescription>
          </DialogHeader>
          <textarea
            readOnly
            className="w-full rounded border p-3 text-sm"
            value={visibleLink ?? ""}
            onFocus={(e) => e.target.select()}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!history}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Histórico de propostas</DialogTitle>
            <DialogDescription>As revisões anteriores são preservadas.</DialogDescription>
          </DialogHeader>
          {proposals
            .filter((p) => p.invite_id === history)
            .sort((a, b) => b.version - a.version)
            .map((p) => (
              <div key={p.id} className="rounded border p-3">
                <h3 className="font-semibold">
                  Revisão {p.version} — {fmtBRL(p.total)}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {p.supplier_name} · {fmtDate(p.created_at)} · {p.contact}
                </p>
                <details className="mt-2 text-sm">
                  <summary>Ver itens desta revisão</summary>
                  {items.map((i) => {
                    const price = prices.find(
                      (x) => x.proposal_id === p.id && x.item_id === i.id,
                    )?.unit_price;
                    return (
                      <p key={i.id} className="border-b py-2">
                        {i.code} — {i.description}: {price == null ? "Não cotado" : fmtBRL(price)}
                      </p>
                    );
                  })}
                </details>
              </div>
            ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

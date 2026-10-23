import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getSupabase } from "@/lib/supabase";
import { quoteError, type QuoteItem } from "@/lib/quotes";
import { parseAmount } from "@/lib/budget-import";
import { budgetHierarchy } from "@/lib/budget-hierarchy";
import { fmtBRL, fmtNum, fmtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type SupplierView = {
  id: string;
  name: string;
  work: string;
  front: string;
  deadline: string;
  notes: string;
  supplier: string;
  can_submit: boolean;
  items: QuoteItem[];
  documents: { id: string; title: string; filename: string; url: string | null }[];
  previous: null | {
    version: number;
    supplier_name: string;
    cnpj: string;
    contact: string;
    notes: string;
    total: number;
    prices: { item_id: string; unit_price: number | null }[];
  };
};
export const Route = createFileRoute("/fornecedor/proposta")({
  head: () => ({
    meta: [
      { title: "Enviar proposta — Terrano Obras" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SupplierProposal,
});
function SupplierProposal() {
  const [token, setToken] = useState("");
  const [view, setView] = useState<SupplierView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [uncoted, setUncoted] = useState<Set<string>>(new Set());
  const key = useRef("");
  const submittedPayload = useRef("");
  useEffect(() => {
    let live = true;
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(t);
    key.current = crypto.randomUUID();
    const load = async () => {
      try {
        if (!/^[0-9a-f-]{36}$/i.test(t))
          throw Error("Link inválido. Solicite seu convite à Terrano.");
        const { data, error } = await getSupabase().functions.invoke("quote-supplier", {
          body: { token: t },
        });
        if (error || data?.error)
          throw Error(data?.error ?? "Convite inválido, desativado ou indisponível.");
        if (live) {
          const v = data as SupplierView;
          setView(v);
          setName(v.previous?.supplier_name ?? v.supplier);
          setCnpj(v.previous?.cnpj ?? "");
          setContact(v.previous?.contact ?? "");
          setNotes(v.previous?.notes ?? "");
          const initial: Record<string, string> = {};
          const skipped = new Set<string>();
          for (const item of v.items) {
            const p = v.previous?.prices.find((p) => p.item_id === item.id);
            initial[item.id] = p?.unit_price == null ? "" : String(p.unit_price).replace(".", ",");
            if (p && p.unit_price === null) skipped.add(item.id);
          }
          setPrices(initial);
          setUncoted(skipped);
        }
      } catch (e) {
        if (live) setError(quoteError(e));
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, []);
  const amount = (id: string) => {
    try {
      return parseAmount(prices[id]);
    } catch {
      return null;
    }
  };
  const total =
    view?.items.reduce(
      (sum, i) =>
        sum + (uncoted.has(i.id) ? 0 : Math.round(i.quantity * (amount(i.id) ?? 0) * 100) / 100),
      0,
    ) ?? 0;
  const quoted = view?.items.filter((i) => !uncoted.has(i.id) && !!amount(i.id)).length ?? 0;
  const send = async () => {
    if (!view || busy || sent) return;
    setBusy(true);
    setError("");
    try {
      const payload = view.items.map((i) => {
        if (uncoted.has(i.id)) return { item_id: i.id, unit_price: null };
        const n = parseAmount(prices[i.id]);
        if (n === null || n <= 0 || n > 1e9 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001)
          throw Error(
            `Confira o preço do item ${i.code} ou marque Não cotado. Use até duas casas decimais.`,
          );
        return { item_id: i.id, unit_price: n };
      });
      const fingerprint = JSON.stringify([name.trim(), cnpj, contact, notes, payload]);
      if (submittedPayload.current && submittedPayload.current !== fingerprint)
        key.current = crypto.randomUUID();
      submittedPayload.current = fingerprint;
      const { error } = await getSupabase().rpc("submit_quote", {
        p_token: token,
        p_key: key.current,
        p_name: name.trim(),
        p_cnpj: cnpj,
        p_contact: contact,
        p_notes: notes,
        p_prices: payload,
      });
      if (error) throw error;
      setSent(true);
      setConfirmation(false);
    } catch (e) {
      setError(quoteError(e));
      setConfirmation(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <header className="rounded-lg bg-primary p-5 text-primary-foreground">
        <h1 className="text-xl font-semibold">Terrano Obras — Proposta do fornecedor</h1>
        <p className="mt-1 text-sm">
          Preencha os preços da sua proposta. Você não precisa de uma conta para responder ao
          convite.
        </p>
      </header>
      {loading ? (
        <p role="status">Carregando convite…</p>
      ) : sent ? (
        <section className="panel p-8">
          <h2 className="text-xl font-semibold text-primary">Proposta enviada com sucesso</h2>
          <p className="mt-3">
            A Terrano poderá analisar sua proposta. Uma nova revisão depende da liberação da equipe.
          </p>
          <p className="num mt-3 font-semibold">Total enviado: {fmtBRL(total)}</p>
        </section>
      ) : view ? (
        <>
          <section className="panel p-5">
            <h2 className="text-xl font-semibold">{view.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {view.work} · {view.front} · Prazo: {fmtDate(view.deadline)}
            </p>
            {view.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{view.notes}</p>}
            {view.documents.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium">Projetos e anexos</h3>
                {view.documents.map((d) =>
                  d.url ? (
                    <a
                      key={d.id}
                      className="mt-2 block text-sm text-primary underline"
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.title} — baixar
                    </a>
                  ) : (
                    <p key={d.id} className="mt-2 text-sm">
                      {d.title} — solicite o arquivo à Terrano.
                    </p>
                  ),
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Se o link do anexo expirar, atualize esta página antes de preencher a proposta.
                </p>
              </div>
            )}
          </section>
          {!view.can_submit && (
            <p className="rounded border bg-warning-soft p-4 text-sm">
              {view.previous
                ? `Proposta recebida — Revisão ${view.previous.version}.`
                : "O prazo de envio ou a etapa de recebimento está encerrada."}{" "}
              Para alterações, entre em contato com a Terrano.
            </p>
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (total <= 0) {
                setError("Cote ao menos um item.");
                return;
              }
              setConfirmation(true);
            }}
          >
            <fieldset disabled={busy || !view.can_submit} className="space-y-4">
              <section className="panel grid gap-3 p-5 sm:grid-cols-3">
                <label className="text-sm">
                  Empresa / fornecedor
                  <Input
                    required
                    maxLength={200}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  CNPJ
                  <Input maxLength={40} value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
                </label>
                <label className="text-sm">
                  Contato
                  <Input
                    maxLength={200}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="Nome, telefone ou e-mail"
                  />
                </label>
              </section>
              <div className="overflow-auto rounded border bg-card">
                <table className="w-full min-w-[850px] text-sm">
                  <thead>
                    <tr className="bg-muted">
                      <th className="p-3 text-left">Código</th>
                      <th className="p-3 text-left">Descrição</th>
                      <th className="p-3">Unid.</th>
                      <th className="p-3">Quant.</th>
                      <th className="p-3">Preço unitário (R$)</th>
                      <th className="p-3">Não cotado</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetHierarchy(view.items).map((row) =>
                      row.kind === "group" ? (
                        <tr
                          key={`g-${row.code}`}
                          className={
                            row.depth === 1
                              ? "bg-primary text-primary-foreground"
                              : "bg-success-soft text-primary"
                          }
                        >
                          <td className="p-3 font-semibold">{row.code}</td>
                          <td colSpan={6} className="p-3 font-semibold">
                            {row.name}
                          </td>
                        </tr>
                      ) : (
                        <tr key={row.item.id} className="border-b">
                          <td className="p-3">{row.item.code}</td>
                          <td className="min-w-60 p-3">{row.item.description}</td>
                          <td className="p-3">{row.item.unit}</td>
                          <td className="num p-3 text-right">{fmtNum(row.item.quantity, 4)}</td>
                          <td className="p-3">
                            <Input
                              aria-label={`Preço do item ${row.item.code}`}
                              inputMode="decimal"
                              className="min-w-28 text-right"
                              required={!uncoted.has(row.item.id)}
                              disabled={uncoted.has(row.item.id) || busy || !view.can_submit}
                              value={prices[row.item.id] ?? ""}
                              onChange={(e) =>
                                setPrices((prev) => ({ ...prev, [row.item.id]: e.target.value }))
                              }
                              placeholder="0,00"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Não cotar item ${row.item.code}`}
                              checked={uncoted.has(row.item.id)}
                              onChange={(e) =>
                                setUncoted((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(row.item.id);
                                  else next.delete(row.item.id);
                                  return next;
                                })
                              }
                            />
                          </td>
                          <td className="num p-3 text-right">
                            {uncoted.has(row.item.id)
                              ? "Não cotado"
                              : fmtBRL(row.item.quantity * (amount(row.item.id) ?? 0))}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <label className="block text-sm">
                Observações da proposta
                <Textarea
                  maxLength={10000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Condições comerciais, prazo de execução e ressalvas"
                />
              </label>
            </fieldset>
            <div className="panel sticky bottom-2 flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <strong className="num">Total: {fmtBRL(total)}</strong>
                <p className="text-xs text-muted-foreground">
                  {quoted} de {view.items.length} itens cotados
                </p>
              </div>
              <Button disabled={busy || !view.can_submit || total <= 0}>
                Conferir e enviar proposta
              </Button>
            </div>
          </form>
        </>
      ) : null}
      {error && (
        <p role="alert" className="rounded border bg-warning-soft p-4 text-sm">
          {error}
        </p>
      )}
      <Dialog
        open={confirmation}
        onOpenChange={(open) => {
          if (!busy) setConfirmation(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar proposta</DialogTitle>
            <DialogDescription>
              {quoted} de {view?.items.length} itens cotados. Total: {fmtBRL(total)}. Após o envio,
              alterações dependerão da liberação de revisão pela Terrano.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation(false)}>
              Voltar e conferir
            </Button>
            <Button disabled={busy} onClick={() => void send()}>
              {busy ? "Enviando…" : "Confirmar envio"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

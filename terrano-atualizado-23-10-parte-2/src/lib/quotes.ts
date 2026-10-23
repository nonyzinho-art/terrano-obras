import { getSupabase } from "./supabase";
export type Quote = {
  id: string;
  work_id: string;
  front_id: string;
  name: string;
  deadline: string;
  notes: string;
  status: "aberta" | "em_aprovacao" | "aprovada" | "cancelada";
  selected_proposal: string | null;
  approval_cycle: number;
  budget_id: string | null;
  source_filename: string;
  created_at: string;
};
export type QuoteItem = {
  id: string;
  quote_id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  hierarchy: { code: string; name: string }[];
  group: string;
  source_row: number;
};
export type Invite = {
  id: string;
  quote_id: string;
  supplier_name: string;
  email: string;
  token: string;
  active: boolean;
  revision_allowed: boolean;
};
export type Price = { proposal_id: string; item_id: string; unit_price: number | null };
export type Proposal = {
  id: string;
  invite_id: string;
  version: number;
  supplier_name: string;
  cnpj: string;
  contact: string;
  notes: string;
  total: number;
  created_at: string;
};
export type Approval = {
  quote_id: string;
  cycle: number;
  role: string;
  actor: string;
  decided_at: string;
};
export const quoteStatus = {
  aberta: "Recebendo propostas",
  em_aprovacao: "Em aprovação",
  aprovada: "Aprovada",
  cancelada: "Cancelada",
};
export const approvalRoles = [
  { role: "coordenador_obras", label: "Coordenação de obras" },
  { role: "coordenador_comercial", label: "Coordenação comercial" },
  { role: "diretor", label: "Diretoria" },
];
export function quoteError(e: unknown) {
  return e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Não foi possível concluir. Tente novamente.";
}
export async function quoteRows<T>(
  table: string,
  column?: string,
  value?: string | string[],
): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = getSupabase()
      .from(table)
      .select("*")
      .order(
        table === "quote_prices" ? "item_id" : table === "quote_approvals" ? "decided_at" : "id",
      )
      .range(offset, offset + 999);
    if (table === "quote_prices") query = query.order("proposal_id");
    if (table === "quote_approvals") query = query.order("quote_id").order("cycle").order("role");
    if (column) query = Array.isArray(value) ? query.in(column, value) : query.eq(column, value);
    const { data, error } = await query;
    if (error) throw error;
    all.push(...(data as T[]));
    if (data.length < 1000) return all;
  }
}
export async function loadQuote(id: string) {
  const [quotes, items, invites, approvals] = await Promise.all([
    quoteRows<Quote>("quote_requests", "id", id),
    quoteRows<QuoteItem>("quote_items", "quote_id", id),
    quoteRows<Invite>("quote_invites", "quote_id", id),
    quoteRows<Approval>("quote_approvals", "quote_id", id),
  ]);
  if (!quotes[0]) throw Error("Cotação não encontrada ou sem acesso.");
  const proposals = invites.length
    ? await quoteRows<Proposal>(
        "quote_proposals",
        "invite_id",
        invites.map((i) => i.id),
      )
    : [];
  const prices = proposals.length
    ? await quoteRows<Price>(
        "quote_prices",
        "proposal_id",
        proposals.map((p) => p.id),
      )
    : [];
  return { quote: quotes[0], items, invites, approvals, proposals, prices };
}
export function supplierLink(token: string) {
  return `${window.location.origin}/fornecedor/proposta#token=${encodeURIComponent(token)}`;
}
export function latestProposals(proposals: Proposal[]) {
  const map = new Map<string, Proposal>();
  for (const p of proposals)
    if (!map.has(p.invite_id) || map.get(p.invite_id)!.version < p.version) map.set(p.invite_id, p);
  return [...map.values()];
}
export function proposalCoverage(p: Proposal, items: QuoteItem[], prices: Price[]) {
  const selected = prices.filter((x) => x.proposal_id === p.id && x.unit_price !== null);
  const covered = new Set(selected.map((x) => x.item_id));
  return { quoted: selected.length, complete: items.every((i) => covered.has(i.id)) };
}

import { prepareQuoteItems } from "@/lib/quote-quantities";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAccess } from "@/lib/access";
import { getWorks } from "@/lib/repository";
import { getSupabase } from "@/lib/supabase";
import { parseBudgetRows, type ImportPreview } from "@/lib/budget-import";
import { budgetHierarchy } from "@/lib/budget-hierarchy";
import { quoteError } from "@/lib/quotes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
type Sheet = { sheet: string; data: unknown[][] };
type Doc = { id: string; title: string; filename: string };
export function NewQuoteDialog({ onClose }: { onClose: () => void }) {
  const { profile, canWriteWork } = useAccess();
  const works = getWorks().filter((w) => canWriteWork(w.id) && w.status !== "concluida");
  const [work, setWork] = useState(works[0]?.id ?? "");
  const [front, setFront] = useState("");
  const [fronts, setFronts] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [suppliers, setSuppliers] = useState([{ name: "", email: "" }]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheet, setSheet] = useState("");
  const [filename, setFilename] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [omitZero, setOmitZero] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const submittedPayload = useRef("");
  const uploaded = useRef(new Map<File, string>());
  const navigate = useNavigate();
  useEffect(() => {
    let live = true;
    setFront("");
    setSelected([]);
    setFiles([]);
    setDocs([]);
    setFronts([]);
    setError("");
    if (work)
      Promise.all([
        getSupabase()
          .from("work_fronts")
          .select("id,name")
          .eq("work_id", work)
          .eq("active", true)
          .order("name"),
        getSupabase()
          .from("work_documents")
          .select("id,title,filename")
          .eq("work_id", work)
          .order("title"),
      ]).then(([f, d]) => {
        if (!live) return;
        if (f.error || d.error) {
          setError("Não foi possível carregar as frentes e documentos.");
          return;
        }
        setFronts(f.data ?? []);
        setFront(f.data?.[0]?.id ?? "");
        setDocs(d.data ?? []);
      });
    return () => {
      live = false;
    };
  }, [work]);
  const prepared = prepareQuoteItems(preview?.items ?? [], quantities, omitZero);
  const chooseSheet = (next: string, list = sheets) => {
    setSheet(next);
    setError("");
    setPreview(null);
    setQuantities({});
    setOmitZero(false);
    setOnlyPending(false);
    try {
      setPreview(parseBudgetRows(list.find((s) => s.sheet === next)!.data, { quotation: true }));
    } catch (e) {
      setError(quoteError(e));
    }
  };
  const read = async (file: File) => {
    setBusy(true);
    setError("");
    setPreview(null);
    setSheets([]);
    setFilename(file.name);
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024)
        throw Error("Use uma planilha .xlsx de até 10 MB.");
      const { default: readExcel } = await import("read-excel-file/universal");
      const list = await readExcel(await file.arrayBuffer());
      setSheets(list);
      chooseSheet(list[0]!.sheet, list);
    } catch (e) {
      setError(quoteError(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (
      !preview ||
      preview.errors.length ||
      busy ||
      !profile ||
      !front ||
      !name.trim() ||
      !deadline ||
      !canWriteWork(work)
    )
      return;
    if (prepared.invalid.length || !prepared.included.length) {
      setOnlyPending(true);
      setError(
        prepared.included.length
          ? `Confira as quantidades dos itens: ${prepared.invalid
              .slice(0, 8)
              .map((i) => i.code)
              .join(
                ", ",
              )}${prepared.invalid.length > 8 ? "…" : ""}. Corrija os campos destacados na prévia.`
          : "Nenhum item com quantidade positiva para enviar.",
      );
      return;
    }
    if (suppliers.some((s) => !s.name.trim())) {
      setError("Informe o nome de cada fornecedor.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const client = getSupabase();
      const docIds = [...selected];
      for (const file of files) {
        let docId = uploaded.current.get(file);
        if (!docId) {
          if (file.size === 0 || file.size > 25 * 1024 * 1024)
            throw Error("Cada projeto deve ter conteúdo e até 25 MB.");
          docId = crypto.randomUUID();
          const ext = file.name.split(".").pop();
          const path = `${work}/${profile.user_id}/${docId}.${/^[a-z0-9]{1,10}$/i.test(ext ?? "") ? ext : "bin"}`;
          const up = await client.storage
            .from("work-documents")
            .upload(path, file, { contentType: file.type || "application/octet-stream" });
          if (up.error) throw up.error;
          const meta = await client.from("work_documents").insert({
            id: docId,
            work_id: work,
            title: file.name.slice(0, 200),
            category: "Projeto",
            filename: file.name,
            storage_path: path,
            size_bytes: file.size,
          });
          if (meta.error) {
            const check = await client
              .from("work_documents")
              .select("id")
              .eq("id", docId)
              .maybeSingle();
            if (!check.data) {
              if (!check.error) await client.storage.from("work-documents").remove([path]);
              throw meta.error;
            }
          }
          uploaded.current.set(file, docId);
        }
        docIds.push(docId);
      }
      const fingerprint = JSON.stringify([
        work,
        front,
        name.trim(),
        deadline,
        notes,
        filename,
        prepared.included,
        suppliers,
        docIds,
      ]);
      if (submittedPayload.current && submittedPayload.current !== fingerprint)
        key.current = crypto.randomUUID();
      submittedPayload.current = fingerprint;
      const { data, error } = await client.rpc("create_quote", {
        p_key: key.current,
        p_work: work,
        p_front: front,
        p_name: name.trim(),
        p_deadline: deadline,
        p_notes: notes,
        p_filename: filename,
        p_items: prepared.included,
        p_suppliers: suppliers,
        p_documents: docIds,
      });
      if (error) throw error;
      toast.success("Cotação criada. Os links estão prontos para copiar.");
      onClose();
      await navigate({ to: "/cotacoes/$id", params: { id: String(data) } });
    } catch (e) {
      setError(quoteError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nova cotação</DialogTitle>
          <DialogDescription>
            Obra, frente, planilha, projetos e fornecedores. Os preços serão preenchidos pelos
            fornecedores.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Obra
                <select
                  required
                  className="mt-1 h-9 w-full rounded border bg-card px-3"
                  value={work}
                  onChange={(e) => setWork(e.target.value)}
                >
                  {works.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Frente de serviço
                <select
                  required
                  className="mt-1 h-9 w-full rounded border bg-card px-3"
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                >
                  <option value="">Selecione uma frente</option>
                  {fronts.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!fronts.length && (
              <p className="text-sm text-muted-foreground">
                Cadastre uma frente ativa na página da obra para criar a cotação.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Nome da cotação
                <Input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Rede de água — contratação"
                />
              </label>
              <label className="text-sm">
                Prazo para propostas
                <Input
                  required
                  type="date"
                  min={new Date().toLocaleDateString("en-CA")}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
            </div>
            <label className="block text-sm">
              Observações para os fornecedores
              <Textarea
                maxLength={10000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condições, escopo e orientações"
              />
            </label>
            <label className="block text-sm">
              Planilha de cotação (.xlsx)
              <Input
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void read(file);
                  e.target.value = "";
                }}
              />
            </label>
            {sheets.length > 1 && (
              <label className="block text-sm">
                Aba da planilha
                <select
                  className="ml-3 rounded border p-2"
                  value={sheet}
                  onChange={(e) => chooseSheet(e.target.value)}
                >
                  {sheets.map((s) => (
                    <option key={s.sheet}>{s.sheet}</option>
                  ))}
                </select>
              </label>
            )}
            {preview && (
              <>
                <p className="text-sm">
                  {prepared.included.length} itens para enviar · {prepared.excluded.length} itens
                  com zero excluídos · {preview.groups} grupos · {filename}
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={omitZero}
                    onChange={(e) => setOmitZero(e.target.checked)}
                  />
                  Não enviar itens com quantidade zero
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={onlyPending}
                    onChange={(e) => setOnlyPending(e.target.checked)}
                  />
                  Mostrar somente quantidades que precisam de correção ({prepared.invalid.length})
                </label>
                {prepared.invalid.length > 0 && (
                  <p className="text-sm text-warning-foreground">
                    Há {prepared.invalid.length} itens com quantidade vazia, inválida ou zero.
                    Preencha a quantidade na tabela. Para itens com zero que não fazem parte do
                    escopo, marque a opção acima.
                  </p>
                )}
                {preview.errors.slice(0, 10).map((e, i) => (
                  <p key={i} className="text-sm text-danger">
                    {e}
                  </p>
                ))}
                <div className="max-h-56 overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="p-2 text-left">Código</th>
                        <th className="p-2 text-left">Descrição</th>
                        <th className="p-2">Unidade</th>
                        <th className="p-2">Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetHierarchy(onlyPending ? prepared.invalid : prepared.edited).map(
                        (row) =>
                          row.kind === "group" ? (
                            <tr
                              key={`g-${row.code}`}
                              className={
                                row.depth === 1
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-success-soft text-primary"
                              }
                            >
                              <td className="p-2">{row.code}</td>
                              <td colSpan={3} className="p-2 font-semibold">
                                {row.name}
                              </td>
                            </tr>
                          ) : (
                            <tr
                              key={row.item.code}
                              className={
                                prepared.invalid.some((i) => i.code === row.item.code)
                                  ? "border-b bg-warning-soft"
                                  : "border-b bg-card"
                              }
                            >
                              <td className="p-2">{row.item.code}</td>
                              <td className="p-2">{row.item.description}</td>
                              <td className="p-2">{row.item.unit}</td>
                              <td className="p-2 text-right">
                                <Input
                                  aria-label={`Quantidade do item ${row.item.code}`}
                                  inputMode="decimal"
                                  className="min-w-28 text-right"
                                  value={
                                    quantities[row.item.code] ??
                                    String(row.item.quantity ?? "").replace(".", ",")
                                  }
                                  placeholder="Preencher"
                                  onChange={(e) =>
                                    setQuantities((prev) => ({
                                      ...prev,
                                      [row.item.code]: e.target.value,
                                    }))
                                  }
                                />
                                {omitZero && row.item.quantity === 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    Não será enviado
                                  </span>
                                )}
                              </td>
                            </tr>
                          ),
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="rounded border p-3">
              <h3 className="mb-2 font-medium">Projetos e anexos</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Somente os documentos selecionados serão disponibilizados aos convidados.
              </p>
              {docs.map((d) => (
                <label key={d.id} className="mb-2 flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(d.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id),
                      )
                    }
                  />
                  {d.title}
                </label>
              ))}
              <label className="block text-sm">
                Adicionar projetos (até 25 MB por arquivo)
                <Input
                  type="file"
                  multiple
                  onChange={(e) => {
                    setFiles(Array.from(e.target.files ?? []));
                  }}
                />
              </label>
              {files.map((f, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {f.name}
                </p>
              ))}
              <p className="mt-2 text-xs text-muted-foreground">
                Os projetos enviados também ficam salvos em Documentos da obra.
              </p>
            </div>
            <div className="rounded border p-3">
              <h3 className="mb-3 font-medium">Fornecedores convidados ({suppliers.length})</h3>
              {suppliers.map((s, i) => (
                <div key={i} className="mb-2 flex flex-wrap gap-2">
                  <Input
                    required
                    maxLength={200}
                    aria-label={`Fornecedor ${i + 1}`}
                    placeholder="Nome do fornecedor"
                    className="min-w-44 flex-1"
                    value={s.name}
                    onChange={(e) =>
                      setSuppliers((prev) =>
                        prev.map((v, j) => (i === j ? { ...v, name: e.target.value } : v)),
                      )
                    }
                  />
                  <Input
                    type="email"
                    aria-label={`E-mail do fornecedor ${i + 1}`}
                    placeholder="E-mail (opcional)"
                    className="min-w-44 flex-1"
                    value={s.email}
                    onChange={(e) =>
                      setSuppliers((prev) =>
                        prev.map((v, j) => (i === j ? { ...v, email: e.target.value } : v)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={suppliers.length === 1}
                    onClick={() => setSuppliers((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Remover
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={suppliers.length >= 100}
                onClick={() => setSuppliers((prev) => [...prev, { name: "", email: "" }])}
              >
                Adicionar fornecedor
              </Button>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="rounded border bg-warning-soft p-3 text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={busy || !preview || !!preview.errors.length || !front}>
              {busy ? "Processando…" : "Criar cotação e gerar links"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

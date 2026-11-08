import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FolderPlus } from "lucide-react";
import { Panel } from "./bits";
import { ProjectFilesPicker } from "./ProjectFilesPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAccess } from "@/lib/access";
import { getSupabase } from "@/lib/supabase";
import { loadQuoteDocuments, quoteError, type QuoteDocument } from "@/lib/quotes";
import {
  downloadAllAsZip,
  fmtSize,
  groupByFolder,
  uploadProjectFiles,
  type ProjectFile,
} from "@/lib/project-files";

/** Project files the suppliers of a quote can download. */
export function QuoteProjectsPanel({
  quoteId,
  quoteName,
  workId,
  canAdd,
}: {
  quoteId: string;
  quoteName: string;
  workId: string;
  canAdd: boolean;
}) {
  const query = useQuery({
    queryKey: ["quote-documents", quoteId],
    queryFn: () => loadQuoteDocuments(quoteId),
  });
  const [adding, setAdding] = useState(false);
  const [zipping, setZipping] = useState("");
  const docs = query.data ?? [];
  const total = docs.reduce((sum, d) => sum + (d.size_bytes ?? 0), 0);
  const sign = async (list: QuoteDocument[]) => {
    const { data, error } = await getSupabase()
      .storage.from("work-documents")
      .createSignedUrls(
        list.map((d) => d.storage_path),
        600,
      );
    if (error) throw error;
    return list.map((d, i) => ({ ...d, url: data?.[i]?.signedUrl ?? null }));
  };
  const open = async (doc: QuoteDocument) => {
    try {
      const [signed] = await sign([doc]);
      if (signed?.url) window.open(signed.url, "_blank", "noopener");
    } catch (e) {
      toast.error(quoteError(e));
    }
  };
  const zip = async () => {
    setZipping("Preparando…");
    try {
      await downloadAllAsZip(await sign(docs), `Projetos - ${quoteName}`, (done, n) =>
        setZipping(`Baixando ${done} de ${n}`),
      );
    } catch (e) {
      toast.error(quoteError(e));
    } finally {
      setZipping("");
    }
  };
  return (
    <Panel
      title={`Projetos anexados${docs.length ? ` (${docs.length})` : ""}`}
      action={
        <div className="flex gap-2">
          {docs.length > 1 && (
            <Button size="sm" variant="outline" disabled={!!zipping} onClick={() => void zip()}>
              <Download className="h-4 w-4" /> {zipping || "Baixar .zip"}
            </Button>
          )}
          {canAdd && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <FolderPlus className="h-4 w-4" /> Adicionar projetos
            </Button>
          )}
        </div>
      }
    >
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando projetos…</p>
      ) : query.error ? (
        <p role="alert" className="text-sm text-danger">
          {quoteError(query.error)}
        </p>
      ) : !docs.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhum projeto anexado. Os fornecedores só veem a planilha de itens.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {fmtSize(total)} no total. Todos os fornecedores convidados baixam estes arquivos pelo
            próprio link.
          </p>
          <div className="max-h-72 space-y-3 overflow-auto">
            {groupByFolder(docs).map(([folder, files]) => (
              <div key={folder}>
                {folder && <p className="text-xs font-semibold text-muted-foreground">{folder}</p>}
                {files.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="block w-full truncate py-0.5 pl-3 text-left text-sm text-primary hover:underline"
                    onClick={() => void open(d)}
                  >
                    {d.title.slice(d.title.lastIndexOf("/") + 1)}
                    {d.size_bytes ? (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · {fmtSize(d.size_bytes)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
      {adding && (
        <AddQuoteProjectsDialog
          quoteId={quoteId}
          workId={workId}
          onClose={() => setAdding(false)}
          onAdded={() => void query.refetch()}
        />
      )}
    </Panel>
  );
}

function AddQuoteProjectsDialog({
  quoteId,
  workId,
  onClose,
  onAdded,
}: {
  quoteId: string;
  workId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { profile } = useAccess();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const uploaded = useRef(new Map<File, string>());
  const save = async () => {
    if (!profile || !files.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const ids = await uploadProjectFiles(
        workId,
        profile.user_id,
        files,
        uploaded.current,
        (done, total) => setProgress(`Enviando ${done} de ${total}`),
      );
      setProgress("Anexando à cotação…");
      const { error } = await getSupabase().rpc("add_quote_documents", {
        p_quote: quoteId,
        p_documents: ids,
      });
      if (error) throw error;
      toast.success(`${ids.length} projeto(s) anexado(s). Os fornecedores já podem baixar.`);
      onAdded();
      onClose();
    } catch (e) {
      setError(quoteError(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Adicionar projetos à cotação</DialogTitle>
          <DialogDescription>
            Escolha a pasta do projeto inteira — as subpastas são mantidas e os fornecedores baixam
            tudo em um .zip. Os arquivos também ficam em Documentos da obra.
          </DialogDescription>
        </DialogHeader>
        <ProjectFilesPicker value={files} onChange={setFiles} disabled={busy} />
        {error && (
          <p role="alert" className="rounded border bg-warning-soft p-3 text-sm">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy || !files.length} onClick={() => void save()}>
            {busy ? progress || "Enviando…" : `Anexar ${files.length || ""} arquivo(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

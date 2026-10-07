import { useEffect, useState, useRef } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAccess } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/app/bits";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format";
type Doc = {
  id: string;
  title: string;
  filename: string;
  category: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
};
const categories = ["Projeto", "Contrato", "Licença", "Orçamento", "Relatório", "Outros"];
export function WorkDocuments({ workId }: { workId: string }) {
  const { profile, canWriteWork } = useAccess();
  const writable = canWriteWork(workId);
  const [docs, setDocs] = useState<Doc[]>([]),
    [loaded, setLoaded] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [title, setTitle] = useState(""),
    [category, setCategory] = useState("Projeto"),
    [filter, setFilter] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<Doc | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  useEffect(() => {
    if (!preview) return;
    let live = true;
    let url = "";
    setPreviewUrl("");
    setPreviewError("");
    getSupabase()
      .storage.from("work-documents")
      .download(preview.storage_path)
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) {
          setPreviewError(
            "Não foi possível abrir o PDF. Confira seu acesso à obra e tente novamente.",
          );
          return;
        }
        url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
        setPreviewUrl(url);
      })
      .catch(() => {
        if (live) setPreviewError("Não foi possível abrir o PDF. Tente novamente.");
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview]);
  const openPreview = (d: Doc) => {
    setPreviewUrl("");
    setPreviewError("");
    setPreview(d);
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const load = async () => {
    const { data, error } = await getSupabase()
      .from("work_documents")
      .select("*")
      .eq("work_id", workId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    setDocs(data ?? []);
    setLoaded(true);
  };
  useEffect(() => {
    let live = true;
    getSupabase()
      .from("work_documents")
      .select("*")
      .eq("work_id", workId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (live) {
          if (error) setError("Não foi possível carregar os documentos.");
          else {
            setDocs(data ?? []);
            setLoaded(true);
          }
        }
      });
    return () => {
      live = false;
    };
  }, [workId]);
  const upload = async () => {
    if (!file || !profile || !title.trim() || !writable) return;
    setBusy(true);
    setError("");
    const id = crypto.randomUUID();
    const ext = file.name.split(".").pop();
    const path =
      workId +
      "/" +
      profile.user_id +
      "/" +
      id +
      "." +
      (/^[a-zA-Z0-9]{1,10}$/.test(ext ?? "") ? ext : "bin");
    let stored = false;
    try {
      if (file.size === 0 || file.size > 25 * 1024 * 1024)
        throw Error("Selecione um arquivo com até 25 MB e conteúdo válido.");
      const { error: uploadError } = await getSupabase()
        .storage.from("work-documents")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      stored = true;
      const { error: insertError } = await getSupabase().from("work_documents").insert({
        id,
        work_id: workId,
        title: title.trim(),
        category,
        filename: file.name,
        storage_path: path,
        size_bytes: file.size,
      });
      if (insertError) throw insertError;
      setFile(null);
      setTitle("");
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (e) {
      if (stored) {
        const { data, error: checkError } = await getSupabase()
          .from("work_documents")
          .select("id")
          .eq("id", id)
          .maybeSingle();
        if (data) {
          setFile(null);
          setTitle("");
          if (fileInput.current) fileInput.current.value = "";
          try {
            await load();
          } catch {
            setError("Documento salvo. Atualize a página para carregar a lista.");
          }
          return;
        }
        if (!data && !checkError) await getSupabase().storage.from("work-documents").remove([path]);
      }
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível salvar. Confira a lista antes de reenviar.",
      );
    } finally {
      setBusy(false);
    }
  };
  const download = async (d: Doc) => {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await getSupabase()
        .storage.from("work-documents")
        .download(d.storage_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Não foi possível baixar o documento. Confira seu acesso à obra.");
    } finally {
      setBusy(false);
    }
  };
  const filtered = docs.filter(
    (d) =>
      (!filter || d.category === filter) &&
      (!query ||
        (d.title + " " + d.filename).toLocaleLowerCase().includes(query.toLocaleLowerCase())),
  );
  return (
    <Panel title="Documentos da obra">
      <p className="mb-4 text-sm text-muted-foreground">
        Projetos, contratos, licenças e outros arquivos. Acesso restrito às pessoas autorizadas
        nesta obra.
      </p>
      {writable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
          className="mb-6 grid gap-3 rounded border bg-muted/20 p-4 sm:grid-cols-2"
        >
          <label className="text-sm">
            Nome do documento
            <Input
              value={title}
              maxLength={200}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Projeto executivo de drenagem"
            />
          </label>
          <label className="text-sm">
            Categoria
            <select
              className="mt-1 h-9 w-full rounded border bg-card px-3"
              disabled={busy}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Arquivo (até 25 MB)
            <Input
              ref={fileInput}
              type="file"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.slice(0, 200));
              }}
            />
          </label>
          <Button className="self-end justify-self-start" disabled={busy || !file || !title.trim()}>
            {busy ? "Processando…" : "Salvar documento"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded border bg-warning-soft p-3 text-sm">
          {error}
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          aria-label="Buscar documento"
          placeholder="Buscar nome ou arquivo"
          className="max-w-md"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filtrar categoria"
          className="h-9 rounded border bg-card px-3 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {!loaded ? (
        <p>Carregando documentos…</p>
      ) : !filtered.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum documento encontrado.
        </p>
      ) : (
        <div className="divide-y rounded border">
          {filtered.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                {/\.pdf$/i.test(d.filename) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openPreview(d)}
                    className="text-left font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                    aria-label={`Abrir PDF: ${d.title}`}
                  >
                    {d.title}
                  </button>
                ) : (
                  <p className="font-medium">{d.title}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {d.category} · {d.filename} · {(d.size_bytes / 1024 / 1024).toFixed(2)} MB ·{" "}
                  {fmtDate(d.created_at)}
                </p>
              </div>
              <div className="flex gap-2">
                {/\.pdf$/i.test(d.filename) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => openPreview(d)}
                  >
                    Visualizar PDF
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void download(d)}
                >
                  Baixar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="flex h-[90dvh] w-[96vw] max-w-none flex-col p-4 sm:max-w-[1200px]">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle className="break-words">{preview?.title}</DialogTitle>
            <DialogDescription>{preview?.filename}</DialogDescription>
          </DialogHeader>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Use os controles do leitor para navegar, ampliar ou imprimir. Se o leitor não
              aparecer, use a opção de baixar.
            </p>
            <Button
              variant="outline"
              disabled={busy || !preview}
              onClick={() => {
                if (preview) void download(preview);
              }}
            >
              Baixar documento
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
            {previewError ? (
              <p role="alert" className="p-4 text-sm">
                {previewError}
              </p>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                title={`Leitor de PDF: ${preview?.title}`}
                className="h-full w-full border-0"
              />
            ) : (
              <p role="status" className="p-4 text-sm">
                Carregando PDF…
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

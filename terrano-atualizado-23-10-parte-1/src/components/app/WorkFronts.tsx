import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAccess } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/app/bits";
type Front = { id: string; name: string; active: boolean };
export function WorkFronts({ workId }: { workId: string }) {
  const { canWriteWork } = useAccess();
  const writable = canWriteWork(workId);
  const [fronts, setFronts] = useState<Front[]>([]),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const load = async () => {
    const { data, error } = await getSupabase()
      .from("work_fronts")
      .select("id,name,active")
      .eq("work_id", workId)
      .order("name");
    if (error) throw error;
    setFronts(data ?? []);
    setLoaded(true);
  };
  useEffect(() => {
    let live = true;
    getSupabase()
      .from("work_fronts")
      .select("id,name,active")
      .eq("work_id", workId)
      .order("name")
      .then(({ data, error }) => {
        if (live) {
          if (error) setError("Não foi possível carregar as frentes.");
          else {
            setFronts(data ?? []);
            setLoaded(true);
          }
        }
      });
    return () => {
      live = false;
    };
  }, [workId]);
  const save = async (front?: Front) => {
    setBusy(true);
    setError("");
    try {
      const result = front
        ? await getSupabase()
            .from("work_fronts")
            .update({ active: !front.active })
            .eq("id", front.id)
            .eq("work_id", workId)
            .select("id")
        : await getSupabase()
            .from("work_fronts")
            .insert({ work_id: workId, name: name.trim() })
            .select("id");
      if (result.error) throw result.error;
      if (!result.data?.length) throw Error("Sem permissão para alterar esta frente.");
      setName("");
      await load();
    } catch (e) {
      setError(
        e && typeof e === "object" && "code" in e && e.code === "23505"
          ? "Já existe uma frente com esse nome nesta obra."
          : e instanceof Error
            ? e.message
            : "Não foi possível salvar a frente.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Frentes de serviço">
      <p className="mb-4 text-sm text-muted-foreground">
        As frentes ativas aparecem no Telegram. Desativar uma frente preserva os registros
        anteriores.
      </p>
      {writable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="mb-5 flex flex-wrap gap-3"
        >
          <Input
            aria-label="Nome da nova frente"
            placeholder="Ex.: Pavimentação"
            maxLength={120}
            className="max-w-md"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
          <Button disabled={busy || !name.trim()}>Adicionar frente</Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded border bg-warning-soft p-3 text-sm">
          {error}
        </p>
      )}
      {!loaded ? (
        <p>Carregando frentes…</p>
      ) : !fronts.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma frente cadastrada.</p>
      ) : (
        <div className="divide-y rounded border">
          {fronts.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-4 p-3">
              <div>
                <span className="font-medium">{f.name}</span>
                <span className="ml-3 text-xs text-muted-foreground">
                  {f.active ? "Ativa" : "Inativa"}
                </span>
              </div>
              {writable && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void save(f)}
                >
                  {f.active ? "Desativar" : "Reativar"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { getWorks } from "@/lib/repository";
import { getProfile, ROLE_LABELS, type AppRole } from "@/lib/access";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type Access = {
  user_id: string;
  email: string;
  role: AppRole;
  active: boolean;
  work_ids: string[];
  editable_ids: string[];
};
export function AccessAdminDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [users, setUsers] = useState<Access[]>([]),
    [selected, setSelected] = useState<Access | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    const { data, error } = await getSupabase().rpc("list_app_access");
    if (error) throw error;
    setUsers(data ?? []);
  };
  useEffect(() => {
    if (!open) return;
    let live = true;
    getSupabase()
      .rpc("list_app_access")
      .then(({ data, error }) => {
        if (live) {
          if (error) setError("Não foi possível consultar os acessos.");
          else setUsers(data ?? []);
        }
      });
    return () => {
      live = false;
    };
  }, [open]);
  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabase().rpc("set_app_access", {
        p_user: selected.user_id,
        p_role: selected.role,
        p_active: selected.active,
        p_works: selected.work_ids,
        p_editable: selected.editable_ids,
      });
      if (error) throw error;
      await load();
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o acesso.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar acessos</DialogTitle>
          <DialogDescription>
            Diretores e coordenadores acessam todas as obras. Engenheiros acessam somente as obras
            selecionadas. Novos cadastros aguardam sua liberação.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="rounded border bg-warning-soft p-3 text-sm">
            {error}
          </p>
        )}
        {selected ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="space-y-4"
          >
            <p className="font-medium">{selected.email}</p>
            <label className="block text-sm">
              Perfil
              <select
                className="mt-1 h-9 w-full rounded border bg-card px-3"
                disabled={busy || selected.user_id === getProfile()?.user_id}
                value={selected.role}
                onChange={(e) => setSelected({ ...selected, role: e.target.value as AppRole })}
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={busy || selected.user_id === getProfile()?.user_id}
                checked={selected.active}
                onChange={(e) => setSelected({ ...selected, active: e.target.checked })}
              />
              Acesso liberado
            </label>
            {selected.role === "engenheiro" && (
              <fieldset className="space-y-2">
                <legend className="mb-2 font-medium">Obras autorizadas</legend>
                {getWorks().map((w) => {
                  const checked = selected.work_ids.includes(w.id);
                  return (
                    <div
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
                    >
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={checked}
                          onChange={(e) =>
                            setSelected({
                              ...selected,
                              work_ids: e.target.checked
                                ? [...selected.work_ids, w.id]
                                : selected.work_ids.filter((id) => id !== w.id),
                              editable_ids: e.target.checked
                                ? [...selected.editable_ids, w.id]
                                : selected.editable_ids.filter((id) => id !== w.id),
                            })
                          }
                        />
                        {w.name}
                      </label>
                      {checked && (
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={selected.editable_ids.includes(w.id)}
                            onChange={(e) =>
                              setSelected({
                                ...selected,
                                editable_ids: e.target.checked
                                  ? [...selected.editable_ids, w.id]
                                  : selected.editable_ids.filter((id) => id !== w.id),
                              })
                            }
                          />
                          Permitir registros e alterações
                        </label>
                      )}
                    </div>
                  );
                })}
                {!getWorks().length && (
                  <p className="text-sm">Cadastre uma obra antes de vincular o engenheiro.</p>
                )}
              </fieldset>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setSelected(null)}
              >
                Voltar
              </Button>
              <Button disabled={busy}>Salvar acesso</Button>
            </div>
          </form>
        ) : (
          <div className="divide-y rounded border">
            {users.map((u) => (
              <div
                key={u.user_id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[u.role]} · {u.active ? "Liberado" : "Aguardando liberação"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setError("");
                    setSelected({ ...u });
                  }}
                >
                  Editar acesso
                </Button>
              </div>
            ))}
            {!users.length && <p className="p-4 text-sm">Carregando contas…</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

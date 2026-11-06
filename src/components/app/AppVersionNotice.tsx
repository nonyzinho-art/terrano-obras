import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
declare const __TERRANO_BUILD_ID__: string;

export function AppVersionNotice() {
  const [available, setAvailable] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let live = true;
    let checking = false;
    const controller = new AbortController();
    const check = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const response = await fetch("/version.json?t=" + Date.now(), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (live && typeof data.version === "string" && data.version !== __TERRANO_BUILD_ID__)
          setAvailable(true);
      } catch {
        /* A network failure is not a new release. */
      } finally {
        checking = false;
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 60_000);
    const onVisible = () => void check();
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  if (!available) return null;
  return (
    <aside
      role="status"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-card p-4 shadow-lg"
    >
      <p className="font-semibold">Nova versão disponível</p>
      <p className="my-2 text-sm text-muted-foreground">
        Salve o que estiver editando antes de atualizar. Seu trabalho permanece na tela até você
        confirmar.
      </p>
      {confirming ? (
        <>
          <p className="mb-3 text-sm">
            Já salvou suas alterações? Atualizar recarrega esta página e descarta alterações não
            salvas.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("_atualizacao", String(Date.now()));
                window.location.assign(url.toString());
              }}
            >
              Já salvei, atualizar
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Continuar editando
            </Button>
          </div>
        </>
      ) : (
        <Button onClick={() => setConfirming(true)}>Atualizar</Button>
      )}
    </aside>
  );
}

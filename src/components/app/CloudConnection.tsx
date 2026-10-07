import { useEffect, useState, useRef, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { loadCloudData } from "@/lib/cloud-data";
import { replaceData, getWorks } from "@/lib/repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/app/AppShell";
import { AccessAdminDialog } from "@/components/app/AccessAdminDialog";
import { setAccess, ROLE_LABELS, type AppProfile } from "@/lib/access";

async function loadAccount(id: string) {
  const { data, error } = await getSupabase()
    .from("app_profiles")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();
  if (error) throw error;
  const p = data as AppProfile | null;
  if (!p?.active) return { profile: p, data: null, permissions: [] };
  const [snapshot, permissions] = await Promise.all([
    loadCloudData(),
    getSupabase().rpc("my_work_permissions"),
  ]);
  if (permissions.error) throw permissions.error;
  return { profile: p, data: snapshot, permissions: permissions.data ?? [] };
}

export function CloudConnection({ children }: { children: ReactNode }) {
  const sessionUserId = useRef<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [workName, setWorkName] = useState("");
  const [location, setLocation] = useState("Goiás");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  useEffect(() => {
    const client = getSupabase();
    let active = true;
    let authRevision = 0;
    const applySession = (nextUser: User | null) => {
      if (!active) return;
      setChecked(true);
      const nextId = nextUser?.id ?? null;
      if (sessionUserId.current === nextId) return;
      sessionUserId.current = nextId;
      setReady(false);
      setUser(nextUser);
      setProfile(null);
      setAccess(null);
      replaceData(null);
      setTelegramUrl("");
    };
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authRevision !== 0) return;
        if (error) setMessage(error.message);
        applySession(data.session?.user ?? null);
      })
      .catch(() => {
        if (active && authRevision === 0) {
          setChecked(true);
          setMessage("Não foi possível verificar sua sessão.");
        }
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      authRevision++;
      applySession(session?.user ?? null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!user) {
      replaceData(null);
      setReady(false);
      setProfile(null);
      setAccess(null);
      return;
    }
    loadAccount(user.id)
      .then((result) => {
        if (active) {
          replaceData(result.data);
          setProfile(result.profile);
          setAccess(result.profile, result.permissions);
          setReady(true);
          setMessage("");
        }
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [user]);
  const authenticate = async (signup: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      const client = getSupabase();
      const result = signup
        ? await client.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setMessage(
          "Confira seu e-mail para confirmar o cadastro. Seu acesso será liberado pelo administrador.",
        );
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const result = await loadAccount(user!.id);
      replaceData(result.data);
      setProfile(result.profile);
      setAccess(result.profile, result.permissions);
      setReady(true);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar.");
    } finally {
      setBusy(false);
    }
  };
  const telegram = async (action: "link" | "configure") => {
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await getSupabase().functions.invoke("telegram-bot", {
        body: { action },
      });
      if (error) {
        const details = await error.context?.json?.().catch(() => null);
        throw new Error(details?.error ?? "Não foi possível conectar o Telegram.");
      }
      if (action === "link") setTelegramUrl(data.url);
      else setMessage("Conexão ativada. Clique em Vincular Telegram para conectar sua conta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao conectar.");
    } finally {
      setBusy(false);
    }
  };
  const createWork = async () => {
    if (!workName.trim() || !start || !end || end < start) {
      setMessage("Preencha o nome e as datas válidas da obra.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await getSupabase()
        .from("works")
        .insert({ name: workName.trim(), location, start_date: start, end_date: end });
      if (error) throw error;
      const result = await loadAccount(user!.id);
      replaceData(result.data);
      setAccess(result.profile, result.permissions);
      setWorkName("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível cadastrar a obra.");
    } finally {
      setBusy(false);
    }
  };
  if (!checked)
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        Verificando seu acesso…
      </div>
    );
  if (!user)
    return (
      <div className="grid min-h-screen place-items-center bg-background p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void authenticate(false);
          }}
          className="w-full max-w-md rounded-xl border bg-card space-y-4 p-7 shadow-sm"
        >
          <h2 className="font-semibold">Terrano Obras — Acesso</h2>
          <p className="text-sm text-muted-foreground">
            Entre para acessar suas obras. Novos cadastros aguardam a liberação do administrador.
          </p>
          <label className="block text-sm">
            E-mail
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="block text-sm">
            Senha
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              minLength={8}
            />
          </label>
          {message && (
            <p role="alert" className="rounded border bg-warning-soft p-3 text-sm">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !password} type="submit">
              Entrar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || password.length < 8}
              onClick={() => authenticate(true)}
            >
              Solicitar primeiro acesso
            </Button>
          </div>
        </form>
      </div>
    );
  if (!ready || !profile?.active)
    return (
      <div className="grid min-h-screen place-items-center bg-background p-5">
        <section className="panel w-full max-w-md space-y-4 p-6">
          <h1 className="font-semibold">Terrano Obras</h1>
          <p>
            {!ready ? "Carregando seu acesso…" : "Seu cadastro aguarda liberação do administrador."}
          </p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          {message && <p role="alert">{message}</p>}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={refresh}>
              Atualizar acesso
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void getSupabase().auth.signOut()}
            >
              Sair
            </Button>
          </div>
        </section>
      </div>
    );
  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm">
        <span>
          {user.email} · {ROLE_LABELS[profile.role]}
        </span>
        <div className="flex flex-wrap gap-2">
          {profile.role === "administrador" && (
            <Button size="sm" variant="outline" onClick={() => setAdminOpen(true)}>
              Gerenciar acessos
            </Button>
          )}
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={refresh}>
              Atualizar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const { error } = await getSupabase().auth.signOut();
                if (error) setMessage(error.message);
                else {
                  setTelegramUrl("");
                  setProfile(null);
                  setAccess(null);
                  replaceData(null);
                  setAdminOpen(false);
                }
              }}
            >
              Sair
            </Button>
          </>
        </div>
      </div>
      {user && ready && (
        <section className="panel mb-5 flex flex-wrap items-center gap-3 p-3">
          <span className="text-sm">Telegram · @Kanteiro_bot</span>
          <Button size="sm" disabled={busy} onClick={() => telegram("link")}>
            Vincular Telegram
          </Button>
          {profile.role === "administrador" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => telegram("configure")}
            >
              Ativar conexão
            </Button>
          )}
          {telegramUrl && (
            <a
              className="text-sm text-primary underline"
              href={telegramUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir vínculo no Telegram (válido por 10 minutos)
            </a>
          )}
        </section>
      )}
      {message && (
        <p role="alert" className="mb-4 rounded-md border bg-warning-soft p-3 text-sm">
          {message}
        </p>
      )}
      {children}
      {!getWorks().length && profile.role === "engenheiro" && (
        <p className="panel p-5 text-sm">
          Nenhuma obra vinculada. Solicite ao administrador o acesso às suas obras.
        </p>
      )}
      {user && ready && !getWorks().length && profile.role !== "engenheiro" && (
        <section className="panel mt-5 space-y-3 p-5">
          <h2 className="font-semibold">Cadastre sua primeira obra</h2>
          <p className="text-sm text-muted-foreground">Cadastre a primeira obra da empresa.</p>
          <label className="block text-sm">
            Nome da obra
            <Input value={workName} onChange={(e) => setWorkName(e.target.value)} />
          </label>
          <label className="block text-sm">
            Localização
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              Início
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="text-sm">
              Término
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <Button disabled={busy} onClick={createWork}>
            Cadastrar obra
          </Button>
        </section>
      )}
      {adminOpen && <AccessAdminDialog open={adminOpen} onOpenChange={setAdminOpen} />}
    </AppShell>
  );
}

import { useEffect, useState, useRef, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { loadCloudData } from "@/lib/cloud-data";
import { replaceData, getWorks, getDataRevision } from "@/lib/repository";
import { backgroundPaused, startBackgroundRefresh } from "@/lib/background-refresh";
import { clearPhotoUrls } from "@/lib/photo-urls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell, BrandMark } from "@/components/app/AppShell";
import { AccessAdminDialog } from "@/components/app/AccessAdminDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setAccess, ROLE_LABELS, type AppProfile } from "@/lib/access";

/** Split screen used by the sign-in, loading and blocked-account states. */
function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background md:grid-cols-[2fr_3fr]">
      <aside className="flex flex-col justify-center gap-3 bg-sidebar px-8 py-10 md:px-14">
        <BrandMark className="h-9 self-start md:h-11" />
        <p className="text-base text-white md:text-lg">Gestão de obras</p>
        <p className="text-xs text-sidebar-foreground/80">Urbanismo e infraestrutura</p>
      </aside>
      <main className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

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
  const accountGeneration = useRef(0);
  const refreshing = useRef(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupMode, setSignupMode] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
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
      accountGeneration.current++;
      clearPhotoUrls();
      setSyncMessage("");
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
    if (signup && (fullName.trim().length < 3 || fullName.trim().length > 120)) {
      setMessage("Preencha seu nome completo, entre 3 e 120 caracteres.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const client = getSupabase();
      const result = signup
        ? await client.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              data: { full_name: fullName.trim() },
            },
          })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setMessage(
          "Confira seu e-mail para confirmar o cadastro. Depois, entre com seu e-mail e senha.",
        );
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  };
  const refresh = async (background = false) => {
    if (!user || refreshing.current || busy) return;
    if (backgroundPaused()) {
      if (!background)
        setSyncMessage(
          "Atualização adiada durante a edição. Salve ou feche o formulário para atualizar.",
        );
      return;
    }
    const id = user.id;
    const generation = accountGeneration.current;
    const revision = getDataRevision();
    refreshing.current = true;
    if (!background) setBusy(true);
    try {
      const result = await loadAccount(id);
      if (sessionUserId.current !== id || accountGeneration.current !== generation) return;
      // A save or another refresh completed while this read was in flight. Do not roll it back.
      if (
        result.profile?.active &&
        (getDataRevision() !== revision || (background && backgroundPaused()))
      )
        return;
      replaceData(result.data);
      if (!result.profile?.active) clearPhotoUrls();
      setProfile(result.profile);
      setAccess(result.profile, result.permissions);
      setReady(true);
      setSyncMessage(
        `Dados atualizados às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
      );
      if (!background) setMessage("");
    } catch (error) {
      if (sessionUserId.current === id && accountGeneration.current === generation) {
        if (background)
          setSyncMessage(
            "Não foi possível atualizar agora. Os últimos dados carregados foram mantidos.",
          );
        else setMessage(error instanceof Error ? error.message : "Falha ao atualizar.");
      }
    } finally {
      refreshing.current = false;
      if (sessionUserId.current === id && accountGeneration.current === generation && !background)
        setBusy(false);
    }
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!user || !ready || !profile?.active) return;
    const offline = () => setSyncMessage("Sem conexão. Exibindo os últimos dados carregados.");
    window.addEventListener("offline", offline);
    const stop = startBackgroundRefresh(
      () => refreshRef.current(true),
      () => !backgroundPaused(),
    );
    return () => {
      stop();
      window.removeEventListener("offline", offline);
    };
  }, [user?.id, ready, profile?.active]);
  const saveProfile = async () => {
    if (profileName.trim().length < 3 || profileName.trim().length > 120) {
      setMessage("Preencha seu nome completo, entre 3 e 120 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await getSupabase().auth.updateUser({
        data: { full_name: profileName.trim() },
      });
      if (error) throw error;
      if (data.user) setUser(data.user);
      setProfileOpen(false);
      setMessage("Nome atualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar seu nome.");
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
      <AuthLayout>
        <p className="text-sm text-muted-foreground">Verificando seu acesso…</p>
      </AuthLayout>
    );
  if (!user)
    return (
      <AuthLayout>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void authenticate(signupMode);
          }}
          className="space-y-4"
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-brand">
              {signupMode ? "Criar sua conta" : "Acessar o sistema"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {signupMode
                ? "Novos cadastros começam sem obras liberadas; o administrador libera cada obra."
                : "Use seu e-mail e senha cadastrados."}
            </p>
          </div>
          {signupMode && (
            <label className="block text-sm">
              Nome completo
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
                minLength={3}
                maxLength={120}
              />
            </label>
          )}
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
          <Button className="w-full" disabled={busy || !password} type="submit">
            {signupMode ? "Criar conta" : "Entrar"}
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            className="w-full"
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setSignupMode(!signupMode);
              setMessage("");
            }}
          >
            {signupMode ? "Já tenho conta" : "Criar minha conta"}
          </Button>
        </form>
      </AuthLayout>
    );
  if (!ready || !profile?.active)
    return (
      <AuthLayout>
        <section className="space-y-4">
          <h1 className="text-2xl font-bold tracking-tight text-brand">
            {!ready ? "Carregando…" : "Acesso desativado"}
          </h1>
          <p className="text-sm">
            {!ready
              ? "Carregando seu acesso…"
              : "Seu acesso está desativado. Fale com o administrador do sistema."}
          </p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          {message && (
            <p role="alert" className="rounded-md border bg-warning-soft p-3 text-sm">
              {message}
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void refresh()}>
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
      </AuthLayout>
    );
  const signOut = async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) setMessage(error.message);
    else {
      setTelegramUrl("");
      setProfile(null);
      setAccess(null);
      replaceData(null);
      setAdminOpen(false);
      setProfileOpen(false);
    }
  };
  const isAdmin = profile.role === "administrador";
  return (
    <AppShell
      account={{
        name: user.user_metadata?.["full_name"] || user.email || "Minha conta",
        email: user.email ?? "",
        roleLabel: ROLE_LABELS[profile.role],
        isAdmin,
        busy,
        syncMessage,
        onProfile: () => {
          setProfileName(user.user_metadata?.["full_name"] || "");
          setProfileOpen(true);
        },
        onAdmin: () => setAdminOpen(true),
        onRefresh: () => void refresh(),
        onSignOut: () => void signOut(),
      }}
    >
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Meu perfil</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveProfile();
            }}
          >
            <label className="block text-sm">
              Nome completo
              <Input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                autoComplete="name"
                required
                minLength={3}
                maxLength={120}
              />
            </label>
            <Button type="submit" disabled={busy}>
              Salvar nome
            </Button>
          </form>
          <section className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-semibold">Telegram · @Kanteiro_bot</h3>
              <p className="text-xs text-muted-foreground">
                Vincule sua conta para enviar fotos do diário pelo celular.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => telegram("link")}>
                Vincular Telegram
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => telegram("configure")}
                >
                  Ativar conexão do bot
                </Button>
              )}
            </div>
            {telegramUrl && (
              <a
                className="block text-sm text-primary underline"
                href={telegramUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir vínculo no Telegram (válido por 10 minutos)
              </a>
            )}
            {message && <p className="rounded-md border bg-warning-soft p-3 text-sm">{message}</p>}
          </section>
        </DialogContent>
      </Dialog>
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

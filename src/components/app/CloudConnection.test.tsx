import { render, screen, waitFor, cleanup, act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudConnection } from "./CloudConnection";
const mocks = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  profile: { user_id: "u", role: "engenheiro", active: false },
  load: vi.fn(),
  replace: vi.fn(),
  setAccess: vi.fn(),
  signup: vi.fn(),
  updateUser: vi.fn(),
  callback: null as
    null | ((event: string, session: null | { user: { id: string; email: string } }) => void),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      signUp: (args: unknown) => mocks.signup(args),
      updateUser: (args: unknown) => mocks.updateUser(args),
      getSession: async () => ({ data: { session: mocks.session }, error: null }),
      onAuthStateChange: (fn: typeof mocks.callback) => {
        mocks.callback = fn;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.profile, error: null }) }),
      }),
    }),
    rpc: async () => ({ data: [], error: null }),
  }),
}));
vi.mock("@/lib/cloud-data", () => ({ loadCloudData: () => mocks.load() }));
vi.mock("@/lib/repository", () => ({
  replaceData: (v: unknown) => mocks.replace(v),
  getWorks: () => [],
  getDataRevision: () => mocks.replace.mock.calls.length,
}));
vi.mock("@/lib/access", () => ({
  setAccess: (...v: unknown[]) => mocks.setAccess(...v),
  ROLE_LABELS: { engenheiro: "Engenheiro" },
}));
vi.mock("@/components/app/AppShell", () => ({
  BrandMark: () => null,
  AppShell: ({
    children,
    account,
  }: {
    children: React.ReactNode;
    account?: { onProfile: () => void; syncMessage?: string };
  }) => (
    <div>
      <nav>Menu protegido</nav>
      {account && <button onClick={account.onProfile}>Meu perfil</button>}
      {account?.syncMessage && <p role="status">{account.syncMessage}</p>}
      {children}
    </div>
  ),
}));
vi.mock("@/components/app/AccessAdminDialog", () => ({ AccessAdminDialog: () => null }));
describe("login obrigatório", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.profile.active = false;
    mocks.load.mockReset().mockResolvedValue({ works: [] });
    mocks.replace.mockClear();
    mocks.setAccess.mockClear();
    mocks.signup.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    mocks.updateUser.mockReset().mockResolvedValue({
      data: {
        user: {
          id: "u",
          email: "teste@example.invalid",
          user_metadata: { full_name: "Pessoa Teste" },
        },
      },
      error: null,
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it("solicita nome ao criar conta e envia o nome ao cadastro", async () => {
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Criar minha conta" }));
    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Pessoa Teste" } });
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "teste@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-teste-123" } });
    fireEvent.click(screen.getByRole("button", { name: /^Criar conta$/ }));
    await waitFor(() =>
      expect(mocks.signup).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ data: { full_name: "Pessoa Teste" } }),
        }),
      ),
    );
  });
  it("permite salvar o nome da conta pelo perfil", async () => {
    mocks.session = { user: { id: "u", email: "teste@example.invalid" } };
    mocks.profile.active = true;
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Meu perfil" }));
    fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Pessoa Teste" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nome" }));
    await waitFor(() =>
      expect(mocks.updateUser).toHaveBeenCalledWith({ data: { full_name: "Pessoa Teste" } }),
    );
    await screen.findByText("Nome atualizado.");
  });
  it("não monta páginas nem menu antes do login", async () => {
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    await screen.findByRole("button", { name: /^Entrar$/ });
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
    expect(screen.queryByText("Menu protegido")).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("bloqueia contas que aguardam liberação", async () => {
    mocks.session = { user: { id: "u", email: "teste@example.invalid" } };
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    await screen.findByText("Seu acesso está desativado. Fale com o administrador do sistema.");
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("libera contas ativas e fecha o conteúdo ao encerrar a sessão", async () => {
    mocks.session = { user: { id: "u", email: "teste@example.invalid" } };
    mocks.profile.active = true;
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    await screen.findByText("Conteúdo protegido");
    mocks.callback?.("SIGNED_OUT", null);
    await waitFor(() => expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument());
    expect(screen.queryByText("Menu protegido")).not.toBeInTheDocument();
  });
  it("mantém a página aberta ao voltar para a aba e renovar o token", async () => {
    mocks.session = { user: { id: "u", email: "teste@example.invalid" } };
    mocks.profile.active = true;
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    await screen.findByText("Conteúdo protegido");
    const loads = mocks.load.mock.calls.length;
    const resets = mocks.replace.mock.calls.length;
    await act(async () => {
      mocks.callback?.("SIGNED_IN", { user: { ...mocks.session!.user } });
      mocks.callback?.("TOKEN_REFRESHED", { user: { ...mocks.session!.user } });
    });
    expect(screen.getByText("Conteúdo protegido")).toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(loads);
    expect(mocks.replace).toHaveBeenCalledTimes(resets);
  });
  it("trocar de conta bloqueia o conteúdo até verificar o novo acesso", async () => {
    mocks.session = { user: { id: "u", email: "teste@example.invalid" } };
    mocks.profile.active = true;
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    await screen.findByText("Conteúdo protegido");
    mocks.profile.active = false;
    await act(async () => {
      mocks.callback?.("SIGNED_IN", { user: { id: "outro", email: "outro@example.invalid" } });
    });
    await screen.findByText("Seu acesso está desativado. Fale com o administrador do sistema.");
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });
  it("atualiza em segundo plano preservando a página e os campos digitados", async () => {
    mocks.session = { user: { id: "u", email: "teste@example.invalid" } };
    mocks.profile.active = true;
    render(
      <CloudConnection>
        <input aria-label="Rascunho de teste" defaultValue="" />
      </CloudConnection>,
    );
    const input = await screen.findByLabelText("Rascunho de teste");
    fireEvent.change(input, { target: { value: "Texto ainda não salvo" } });
    const snapshot = { works: [{ id: "nova-obra" }] };
    mocks.load.mockResolvedValueOnce(snapshot);
    await act(async () => {});
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 20_000);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(snapshot));
    expect(screen.getByLabelText("Rascunho de teste")).toBe(input);
    expect(input).toHaveValue("Texto ainda não salvo");
    expect(screen.queryByText("Carregando seu acesso…")).not.toBeInTheDocument();
  });
  it("mantém os últimos dados e a página se a consulta automática falhar", async () => {
    mocks.session = { user: { id: "u", email: "teste@example.invalid" } };
    mocks.profile.active = true;
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    await screen.findByText("Conteúdo protegido");
    const count = mocks.replace.mock.calls.length;
    mocks.load.mockRejectedValueOnce(new Error("Failed to fetch"));
    await act(async () => {});
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 20_000);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await screen.findByText(/Não foi possível atualizar agora/);
    expect(mocks.replace).toHaveBeenCalledTimes(count);
    expect(screen.getByText("Conteúdo protegido")).toBeInTheDocument();
  });
  it("descarta leitura antiga concluída depois de um salvamento mais recente", async () => {
    mocks.session = { user: { id: "u", email: "teste@example.invalid" } };
    mocks.profile.active = true;
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    await screen.findByText("Conteúdo protegido");
    let finish!: (value: unknown) => void;
    mocks.load.mockReturnValueOnce(
      new Promise((r) => {
        finish = r;
      }),
    );
    await act(async () => {});
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 20_000);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    mocks.replace({ newerSave: true });
    const old = { staleRead: true };
    await act(async () => {
      finish(old);
    });
    expect(mocks.replace).not.toHaveBeenCalledWith(old);
  });
  it("não restaura dados de uma requisição que terminou após sair da conta", async () => {
    mocks.session = { user: { id: "u", email: "teste@example.invalid" } };
    mocks.profile.active = true;
    render(
      <CloudConnection>
        <p>Conteúdo protegido</p>
      </CloudConnection>,
    );
    await screen.findByText("Conteúdo protegido");
    let finish!: (value: unknown) => void;
    mocks.load.mockReturnValueOnce(
      new Promise((r) => {
        finish = r;
      }),
    );
    await act(async () => {});
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 20_000);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    await act(async () => {
      mocks.callback?.("SIGNED_OUT", null);
    });
    const old = { previousAccount: true };
    await act(async () => {
      finish(old);
    });
    expect(mocks.replace).not.toHaveBeenCalledWith(old);
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });
});

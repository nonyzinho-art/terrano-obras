import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudConnection } from "./CloudConnection";
const mocks = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  profile: { user_id: "u", role: "engenheiro", active: false },
  load: vi.fn(),
  replace: vi.fn(),
  setAccess: vi.fn(),
  callback: null as
    null | ((event: string, session: null | { user: { id: string; email: string } }) => void),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
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
}));
vi.mock("@/lib/access", () => ({
  setAccess: (...v: unknown[]) => mocks.setAccess(...v),
  ROLE_LABELS: { engenheiro: "Engenheiro" },
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div>
      <nav>Menu protegido</nav>
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
  });
  afterEach(cleanup);
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
    await screen.findByText("Seu cadastro aguarda liberação do administrador.");
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
    await screen.findByText("Seu cadastro aguarda liberação do administrador.");
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("./supabase", () => ({ getSupabase: () => ({}) }));
import {
  documentTitle,
  groupByFolder,
  MAX_PROJECT_FILE,
  selectProjectFiles,
} from "./project-files";
import { inviteMessage, inviteStatus, mailtoUrl, whatsappUrl, type Invite } from "./quotes";

const file = (path: string, size = 10) => {
  const name = path.split("/").pop()!;
  const f = new File(["x"], name);
  Object.defineProperty(f, "size", { value: size });
  Object.defineProperty(f, "webkitRelativePath", { value: path });
  return f;
};

describe("pasta do projeto", () => {
  it("mantém subpastas, ignora arquivos do sistema e separa os grandes", () => {
    const picked = selectProjectFiles([
      file("Brisas/ARQ/planta 10.pdf"),
      file("Brisas/ARQ/planta 2.pdf"),
      file("Brisas/Thumbs.db"),
      file("Brisas/DREN/~$memorial.docx"),
      file("Brisas/.DS_Store"),
      file("Brisas/vazio.txt", 0),
      file("Brisas/TOPO/levantamento.dwg", MAX_PROJECT_FILE + 1),
      file("Brisas/memorial.pdf"),
    ]);
    expect(picked.files.map((f) => f.path)).toEqual([
      "Brisas/ARQ/planta 2.pdf",
      "Brisas/ARQ/planta 10.pdf",
      "Brisas/memorial.pdf",
    ]);
    expect(picked.ignored).toHaveLength(4);
    expect(picked.tooLarge.map((f) => f.path)).toEqual(["Brisas/TOPO/levantamento.dwg"]);
  });

  it("agrupa por pasta e encurta caminhos longos pelo começo", () => {
    expect(
      groupByFolder([{ title: "A/B/x.pdf" }, { title: "solto.pdf" }, { title: "A/y.pdf" }]).map(
        ([folder, docs]) => [folder, docs.length],
      ),
    ).toEqual([
      ["", 1],
      ["A", 1],
      ["A/B", 1],
    ]);
    const long = "P/".repeat(150) + "final.pdf";
    expect(documentTitle(long)).toHaveLength(200);
    expect(documentTitle(long).endsWith("final.pdf")).toBe(true);
  });
});

describe("envio dos links", () => {
  const invite: Invite = {
    id: "i",
    quote_id: "q",
    supplier_name: "Pavimenta",
    email: "x@y.com",
    token: "t",
    active: true,
    revision_allowed: true,
  };
  it("monta a mensagem e os links de WhatsApp e e-mail", () => {
    const msg = inviteMessage({ name: "Drenagem", deadline: "2026-11-20" }, "Brisas do Sul", "L");
    expect(msg).toContain('"Drenagem" (Brisas do Sul)');
    expect(msg).toContain("20/11/2026");
    expect(whatsappUrl(msg, "(16) 99999-0000")).toMatch(/^https:\/\/wa\.me\/5516999990000\?text=/);
    expect(whatsappUrl("oi")).toBe("https://wa.me/?text=oi");
    expect(mailtoUrl("x@y.com", "A B", "c")).toBe("mailto:x%40y.com?subject=A%20B&body=c");
  });
  it("mostra quem abriu e quem enviou proposta", () => {
    expect(inviteStatus(invite).label).toBe("Ainda não abriu o link");
    const opened = { ...invite, last_opened_at: "2026-11-08T13:00:00Z", open_count: 3 };
    expect(inviteStatus(opened)).toMatchObject({ tone: "info" });
    expect(inviteStatus(opened).label).toMatch(/^Abriu em .* · 3 acessos · sem proposta$/);
    expect(inviteStatus(opened, { version: 2, created_at: "2026-11-08T14:00:00Z" })).toMatchObject({
      tone: "success",
      label: expect.stringMatching(/^Proposta enviada · revisão 2 em /),
    });
    expect(inviteStatus({ ...invite, active: false }).tone).toBe("danger");
  });
});

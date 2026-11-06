import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PhotoImage } from "./PhotoImage";
const mocks = vi.hoisted(() => ({ url: vi.fn() }));
vi.mock("@/lib/photo-urls", () => ({ photoUrl: (...args: unknown[]) => mocks.url(...args) }));
const photo = {
  id: "p",
  daily_report_id: "r",
  storage_path: "w/r/p",
  file_url: "",
  description: "Foto",
  created_at: "2026-10-26",
};
beforeEach(() => {
  mocks.url.mockReset().mockResolvedValue("https://example.invalid/photo.jpg");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("aguarda proximidade da tela antes de pedir a foto", async () => {
  let intersect!: IntersectionObserverCallback;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  render(<PhotoImage photo={photo} alt="Foto teste" />);
  expect(mocks.url).not.toHaveBeenCalled();
  intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
  await screen.findByAltText("Foto teste");
  expect(mocks.url).toHaveBeenCalledTimes(1);
});
it("mostra falha e permite tentar de novo sem aninhar botões na galeria", async () => {
  mocks.url.mockRejectedValueOnce(new Error("Object not found"));
  const outer = vi.fn();
  const { container } = render(
    <button onClick={outer}>
      <PhotoImage photo={photo} alt="Foto teste" />
    </button>,
  );
  await screen.findByText(/Foto indisponível/);
  expect(container.querySelector("button button")).toBeNull();
  fireEvent.click(screen.getByText(/Clique para tentar novamente/));
  await screen.findByAltText("Foto teste");
  expect(outer).not.toHaveBeenCalled();
  expect(mocks.url).toHaveBeenLastCalledWith(photo, true);
});
it("uma imagem quebrada não remove os metadados nem impede nova tentativa", async () => {
  render(<PhotoImage photo={photo} alt="Foto teste" />);
  fireEvent.error(await screen.findByAltText("Foto teste"));
  fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));
  await waitFor(() => expect(screen.getByAltText("Foto teste")).toBeInTheDocument());
  expect(mocks.url).toHaveBeenCalledTimes(2);
});

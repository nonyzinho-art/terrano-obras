import { useState } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
  Link,
} from "@tanstack/react-router";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";
afterEach(cleanup);
function makeRouter() {
  const root = createRootRoute({ component: Outlet });
  const editor = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => {
      const [text, setText] = useState("");
      return (
        <>
          <UnsavedChangesGuard dirty={text !== ""} />
          <input aria-label="Rascunho" value={text} onChange={(e) => setText(e.target.value)} />
          <Link to="/obras">Outra página</Link>
        </>
      );
    },
  });
  const other = createRoute({
    getParentRoute: () => root,
    path: "/obras",
    component: () => <h1>Destino</h1>,
  });
  return createRouter({
    routeTree: root.addChildren([editor, other]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
}
it("impede perder entrada ao navegar e permite continuar ou descartar", async () => {
  const router = makeRouter();
  render(<RouterProvider router={router} />);
  fireEvent.change(await screen.findByLabelText("Rascunho"), { target: { value: "10 metros" } });
  fireEvent.click(screen.getByRole("link", { name: "Outra página" }));
  await screen.findByRole("dialog", { name: "Alterações não salvas" });
  fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByLabelText("Rascunho")).toHaveValue("10 metros");
  fireEvent.click(screen.getByRole("link", { name: "Outra página" }));
  fireEvent.click(await screen.findByRole("button", { name: "Descartar e sair" }));
  expect(await screen.findByRole("heading", { name: "Destino" })).toBeVisible();
});
it("permite navegar após limpar a edição", async () => {
  const router = makeRouter();
  render(<RouterProvider router={router} />);
  fireEvent.change(await screen.findByLabelText("Rascunho"), { target: { value: "pendente" } });
  fireEvent.change(screen.getByLabelText("Rascunho"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("link", { name: "Outra página" }));
  expect(await screen.findByRole("heading", { name: "Destino" })).toBeVisible();
});

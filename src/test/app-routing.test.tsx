import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches the budget list and dedicated budget detail as separate pages", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/orcamentos").at(-1)?.routeId).toBe("/orcamentos/");
    const detail = router.matchRoutes("/orcamentos/brisas-do-sul/brisas-do-sul-drenagem").at(-1);
    expect(detail?.routeId).toBe("/orcamentos/$obraId/$orcamentoId");
    expect(detail?.params).toMatchObject({ obraId: "brisas-do-sul", orcamentoId: "brisas-do-sul-drenagem" });
  });

  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});

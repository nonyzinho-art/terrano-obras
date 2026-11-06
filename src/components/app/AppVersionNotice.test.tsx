import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppVersionNotice } from "./AppVersionNotice";
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("mostra nova versão e exige confirmação sem desmontar o trabalho",async()=>{
 vi.stubEnv("PROD",true);
 vi.stubGlobal("__TERRANO_BUILD_ID__","old");
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({version:"new"})});
 vi.stubGlobal("fetch",fetcher);
 render(<><input aria-label="Trabalho" defaultValue="rascunho"/><AppVersionNotice/></>);
 await screen.findByText("Nova versão disponível");
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/version.json?"),expect.objectContaining({cache:"no-store"}));
 fireEvent.click(screen.getByRole("button",{name:"Atualizar"}));
 expect(screen.getByRole("button",{name:"Já salvei, atualizar"})).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"Continuar editando"}));
 expect(screen.getByLabelText("Trabalho")).toHaveValue("rascunho");
});
it("não acusa atualização quando a versão é igual ou a rede falha",async()=>{
 vi.stubEnv("PROD",true);vi.stubGlobal("__TERRANO_BUILD_ID__","same");
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({version:"same"})});
 vi.stubGlobal("fetch",fetcher);
 render(<AppVersionNotice/>);
 await waitFor(()=>expect(fetcher).toHaveBeenCalled());
 expect(screen.queryByText("Nova versão disponível")).toBeNull();
 fetcher.mockRejectedValue(new Error("offline"));
 fireEvent(window,new Event("online"));
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
 expect(screen.queryByText("Nova versão disponível")).toBeNull();
});


import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BudgetComparison } from "./BudgetComparison";
import type { ComparisonItem } from "@/lib/budget-comparison";
const item: ComparisonItem = {
  id: "old",
  code: "1",
  description: "Tubo",
  unit: "m",
  quantity: 10,
  price: 5,
  group: "Água",
};
afterEach(cleanup);
it("permite filtrar pontos de atenção sem alterar execução", () => {
  render(
    <BudgetComparison
      before={[item]}
      after={[]}
      executed={new Map([["old", 3]])}
      beforeLabel="Revisão 1"
      afterLabel="Prévia"
    />,
  );
  expect(screen.getByText(/Item removido possui execução aprovada/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Situação na comparação"), { target: { value: "novo" } });
  expect(screen.getByText("Nenhum item para este filtro.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Situação na comparação"), { target: { value: "" } });
  fireEvent.click(screen.getByLabelText("Somente pontos de atenção"));
  expect(screen.getByText(/3,0000 m/)).toBeInTheDocument();
});
it("pagina tabela extensa e encontra serviços fora da página atual", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    ...item,
    id: String(i),
    code: String(i + 1),
    description: `Serviço ${i + 1}`,
  }));
  render(
    <BudgetComparison
      before={[]}
      after={rows}
      executed={new Map()}
      beforeLabel="Anterior"
      afterLabel="Prévia"
    />,
  );
  expect(screen.queryByText("Serviço 60")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
  expect(screen.getByText("Serviço 60")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar na comparação"), {
    target: { value: "servico 2" },
  });
  expect(screen.getByText("Serviço 2")).toBeInTheDocument();
  expect(screen.getByText(/Página 1 de 1/)).toBeInTheDocument();
});

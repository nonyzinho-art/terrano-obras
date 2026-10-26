# Publicação pendente: orçamento no Telegram

## Medições e planejamento — 15/10/2026

Relatório PDF: migração `measurement_report_author_labels` aplicada. A consulta dos autores exige conta autenticada com acesso à obra; os usuários não recebem acesso direto a `auth.users`. Relatório gerado no navegador com jsPDF 4.2.1 e AutoTable 5.0.9, versões fixadas no package-lock. Usa dados salvos, confirma revisão e situação antes de exportar e permite até 20 fotos do orçamento. Quantidades e preços da medição usam os valores preservados nas linhas salvas. Identifica rascunho, cancelada, aprovada e substituída. Layout testado com 65 itens e fotografia, com conferência visual da paginação. Não há assinatura digital; a aprovação identificada é a registrada no sistema. Interface disponível localmente, pendente de publicação na Vercel.

Revisões de medições aprovadas: migração `approved_measurement_revisions` aplicada em 15/10/2026. `revisao-medicoes.sql` é referência e não deve ser reaplicada. O responsável pela aprovação cria revisão justificada, edita o novo rascunho e aprova. A versão original permanece aprovada até a substituição atômica; depois fica com status `substituida`. Histórico de quantidades e aprovação é preservado. Apenas uma revisão em rascunho por medição. Revisão pode zerar a produção original. SQL validado como authenticated, com rollback, e testes da interface e dos indicadores aprovados.

Migração `budget_measurements_and_planning` já aplicada no Supabase. O arquivo `medicoes.sql` é uma cópia de referência: não reaplicar. Interface disponível no sistema local; publicar a aplicação na Vercel para disponibilizar as telas no site.

Medições usam quantidades do período, com rascunho, aprovação e cancelamento de rascunho. Aprovação por administrador, diretor ou coordenador de obras. Aprovadas são imutáveis; períodos não podem coincidir e o acumulado não pode exceder o orçado. Revisão conferida é exigida para evitar aprovação de dados alterados por outra pessoa.

Indicadores e cronograma usam a revisão aprovada mais recente por nome do orçamento e obra. Avanço é ponderado pelo valor orçado; execução valorizada não é pagamento nem custo real. Planejamento linear nas datas explícitas de cada orçamento. Sem datas, o orçamento não contribui para o previsto. Fotos e registros do diário não geram quantidades automaticamente.

Testes SQL executados como authenticated com papéis reais, em transação com rollback, sem medições reais criadas. Não importar dados de teste na produção.

Ativado no Supabase em 07/10/2026: migração telegram_diary_budget_link e telegram-bot versão 9. Não reaplicar o SQL. A Vercel será atualizada separadamente no fim do dia.

1. Aplicar `bot-orcamentos.sql` no Supabase.
2. Publicar `supabase/functions/telegram-bot/index.ts` como `telegram-bot`, mantendo `verify_jwt=false`, os segredos e a autenticação do webhook existentes.
3. Usuários iniciam uma nova seleção com `/diario`. Conversas antigas sem orçamento precisam reiniciar a seleção.

O bot passa a usar obra → orçamento aprovado em execução → fotos/observações. O vínculo `budget_id` fica tanto no diário quanto nas fotos. Registros antigos continuam com o vínculo anterior e não recebem orçamento por inferência.

Orçamentos aprovados começam com `execution_status=em_execucao`; `concluido` remove o orçamento das opções sem remover os registros. Orçamentos em cotação não aparecem. Interface de encerramento de orçamento ainda não faz parte desta mudança.

Verificado: SQL completo em transação com rollback, seleção e associação de foto/diário, repetição sem duplicação, bloqueio de orçamento concluído/em cotação/de outra obra e RPCs restritas ao servidor. Fluxo do handler testado com Telegram/Storage simulados. TypeScript do aplicativo passou. Teste real no Telegram pendente da publicação.

15/10/2026: budget_document_links aplicada. documents-budget.sql é referência, não reaplicar. Documentos privados da obra podem ser vinculados a vários orçamentos; remover vínculo preserva o arquivo.

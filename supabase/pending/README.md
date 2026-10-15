# Publicação pendente: orçamento no Telegram

Ativado no Supabase em 07/10/2026: migração telegram_diary_budget_link e telegram-bot versão 9. Não reaplicar o SQL. A Vercel será atualizada separadamente no fim do dia.

1. Aplicar `bot-orcamentos.sql` no Supabase.
2. Publicar `supabase/functions/telegram-bot/index.ts` como `telegram-bot`, mantendo `verify_jwt=false`, os segredos e a autenticação do webhook existentes.
3. Usuários iniciam uma nova seleção com `/diario`. Conversas antigas sem orçamento precisam reiniciar a seleção.

O bot passa a usar obra → orçamento aprovado em execução → fotos/observações. O vínculo `budget_id` fica tanto no diário quanto nas fotos. Registros antigos continuam com o vínculo anterior e não recebem orçamento por inferência.

Orçamentos aprovados começam com `execution_status=em_execucao`; `concluido` remove o orçamento das opções sem remover os registros. Orçamentos em cotação não aparecem. Interface de encerramento de orçamento ainda não faz parte desta mudança.

Verificado: SQL completo em transação com rollback, seleção e associação de foto/diário, repetição sem duplicação, bloqueio de orçamento concluído/em cotação/de outra obra e RPCs restritas ao servidor. Fluxo do handler testado com Telegram/Storage simulados. TypeScript do aplicativo passou. Teste real no Telegram pendente da publicação.


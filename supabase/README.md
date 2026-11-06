# Banco de dados (Supabase)

Projeto: `slwxkviezhqpnbmmyezp`

## `migrations/`

Histórico completo do banco, na ordem em que foi aplicado (32 arquivos, de 06/10 a 26/10/2026).
Cada arquivo é cópia fiel do que está registrado em `supabase_migrations.schema_migrations`,
conferida por md5 em 06/11/2026. Rodando todos em sequência num banco vazio, recria-se a estrutura
(tabelas, funções, regras de acesso e buckets de arquivos), sem os dados.

Toda alteração nova no banco deve entrar aqui como um novo arquivo `AAAAMMDDHHMMSS_nome.sql`.
Nunca edite uma migração que já foi aplicada.

## `functions/`

Código das Edge Functions publicadas:

- `telegram-bot`: bot @Kanteiro_bot (diário por foto). Publicado na versão 9.
- `quote-supplier`: portal do fornecedor (abre o convite de cotação). Publicado na versão 1.

Ambas rodam com `verify_jwt=false` e fazem a própria autenticação.

## `pending/`

Cópias de referência de SQLs antigos, todos já aplicados e incluídos em `migrations/`. Não reaplicar.

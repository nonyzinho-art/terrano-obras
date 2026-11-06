# Terrano Obras

Sistema de gestão de obras de urbanismo e infraestrutura da Terrano: obras, diário de obra,
orçamentos, medições, cotações com fornecedores e registro de fotos pelo Telegram.

## Tecnologia

- **Aplicação:** React 19 + TanStack Start, Tailwind e componentes shadcn/ui
- **Banco, login e arquivos:** Supabase (projeto `slwxkviezhqpnbmmyezp`)
- **Publicação:** Vercel
- **Bot do Telegram:** @Kanteiro_bot, como Edge Function do Supabase

## Rodar localmente

Requer Node.js 22 ou mais recente.

```sh
npm ci
cp .env.example .env.local   # preencha a chave pública do Supabase
npm run dev
```

## Verificações

```sh
npm test          # testes automatizados
npx tsc --noEmit  # checagem de tipos
npm run lint      # padrão de código
```

## Estrutura

| Pasta                 | Conteúdo                                                        |
| --------------------- | --------------------------------------------------------------- |
| `src/routes/`         | Páginas (uma por arquivo)                                       |
| `src/components/app/` | Componentes do sistema                                          |
| `src/components/ui/`  | Componentes visuais base (shadcn/ui)                            |
| `src/lib/`            | Regras de negócio, cálculos e acesso aos dados                  |
| `src/test/`           | Testes de integração e dados fictícios usados só nos testes     |
| `supabase/`           | Migrações do banco e Edge Functions (veja `supabase/README.md`) |

## Regras de trabalho

- Toda mudança no banco entra como nova migração em `supabase/migrations/`.
- Rode os testes antes de cada commit.
- Não envie arquivos pelo site do GitHub; use commits a partir do projeto local.

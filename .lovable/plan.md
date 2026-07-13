## Objetivo

Aumentar drasticamente o limite de leads no CRM (hoje ~2-5 mil leads dependendo do navegador) **sem mudar nenhum comportamento visível**: mesmos pipelines, mesmos filtros, mesma importação, mesmo sync com a nuvem, mesmos dados já salvos.

## Diagnóstico

Hoje tudo é salvo em `localStorage` via `uload`/`usave` (`src/lib/userStorage.ts`). O `localStorage` do navegador tem um teto rígido de **~5MB por origem** (10MB no Chrome). Com ~2000 leads + importações grandes (ex.: 607 novos de uma vez) esse teto estoura e dispara `QuotaExceededError` — é exatamente o erro que já apareceu no bug do botão "Importar" recentemente.

Aumentar o limite significa trocar o backend local por um que aguenta centenas de MB: **IndexedDB** (padrão dos navegadores, cabem GBs). A nuvem (`user_storage` no Lovable Cloud) continua igual como fonte de verdade entre dispositivos.

## O que muda (interno, invisível pro usuário)

1. **Novo módulo `src/lib/idbCache.ts`** — wrapper mínimo em IndexedDB (uma object store `kv` com chave `u:<userId>:<key>`). Sem dependências externas.
2. **`src/lib/userStorage.ts`** — as chaves "pesadas" (`p21_leads`, `p21_movements`, `p21_sessions`, `p21_meetings`) passam a ler/gravar no IndexedDB; as leves continuam em `localStorage` (metas, stages, tarefas diárias, etc., que já cabem tranquilo).
   - `uload` vira async internamente, mas mantemos uma **camada síncrona em memória** (hidratada no boot) pra não quebrar nenhum componente que hoje chama `uload(...)` de forma síncrona (`PipelineBoard`, `Dashboard`, `Metas`, etc.). Ou seja: nenhum arquivo de UI precisa ser tocado.
   - `usave` continua síncrono do ponto de vista do chamador: atualiza a cache em memória na hora e persiste no IndexedDB em background (mesmo padrão do debounce que já existe pra nuvem).
3. **Migração automática, uma vez por usuário:** no primeiro login após o update, se houver dados dessas chaves em `localStorage`, eles são copiados pro IndexedDB e removidos do `localStorage` (libera o espaço travado). Marcador `p21_idb_migrated_<uid>` evita rodar de novo.
4. **Sync com a nuvem (`syncFromCloud`, `cloudPush`, `cloudDelete`)** continua igual — só muda a fonte local (IDB em vez de LS) pras chaves pesadas.
5. **Tratamento de erro do Import** continua com o `try/catch` já adicionado, mas o `QuotaExceededError` praticamente deixa de acontecer.

## O que NÃO muda

- Nada de UI, componente, filtro, pipeline, etapa, importação, lead, campo, meta, financeiro, pomodoro.
- Assinaturas de `uload`/`usave`/`uremove` continuam idênticas pros componentes.
- Cloud sync (`user_storage`), auth, e todas as outras chaves continuam iguais.
- Dados atuais do usuário são preservados (migração automática).

## Resultado

- Teto prático de leads passa de ~poucos milhares para dezenas/centenas de milhares (limitado só pela performance de render do Kanban, não pelo storage).
- Importações grandes deixam de estourar quota.
- Zero mudança perceptível no dia a dia.

## Arquivos afetados

- `src/lib/idbCache.ts` (novo, ~60 linhas)
- `src/lib/userStorage.ts` (editado: cache em memória + roteamento IDB p/ chaves pesadas + migração)
- `src/main.tsx` **ou** `src/contexts/AuthContext.tsx` (hidratação da cache no login, antes de renderizar as rotas protegidas — pra manter `uload` síncrono)

Nenhum outro arquivo precisa ser tocado.
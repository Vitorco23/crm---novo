# Arquitetura — CRM Performance21 (SOC)

> Documentação do estado atual do código. Nenhuma funcionalidade é alterada por este documento.

## 1. Visão geral

O CRM Performance21 é um **Sistema Operacional Comercial (SOC)**: além do pipeline
tradicional, ele prioriza leads, gera a Missão do Dia, executa diagnósticos de IA e
consolida operação, finanças e agenda em uma única interface.

Stack:

| Camada | Tecnologia |
|---|---|
| UI | React 18 + Vite 5 + TypeScript 5 |
| Estilo | Tailwind CSS v3 + shadcn/ui (design tokens em `src/index.css`) |
| Estado remoto | TanStack Query v5 |
| Backend | Lovable Cloud (Supabase: Postgres + Auth + Storage + Edge Functions) |
| IA | Lovable AI Gateway (roteador próprio em `supabase/functions/_shared/ai-router.ts`) |
| PWA | Service Worker próprio (`public/sw.js`, `src/pwa/`) |

## 2. Constituição técnica

Regras permanentes seguidas por todo o código:

1. **Modularidade por domínio** — cada domínio vive em `src/modules/<dominio>/`.
2. **Engines separados de UI** — regra de negócio em `services/`, nunca em componentes.
3. **Event bus central** — módulos se comunicam por eventos, não por imports cruzados.
4. **Filtros globais persistidos** — a seleção de filtros sobrevive à troca de página.
5. **Cache e lazy loading** — IndexedDB + virtualização para escalar a 100k+ leads.
6. **Motor único de priorização** — `priorityEngine.ts` é a única fonte de pesos.
7. **Toda UI orienta uma ação**, não apenas informa.

## 3. Estrutura de pastas

```text
src/
  modules/
    agenda/          Agenda, lembretes, sincronização com Google Calendar
    cold-call/       Pipeline de Cold Call, Pomodoro, motor de gargalos
    configuracoes/   Integrações, Saúde do Sistema, servidor MCP
    dashboard/       Dashboard operacional e comercial
    financeiro/      Receitas, despesas, custos fixos, metas financeiras
    intelligence/    IA comercial, Central de Decisão, Missão do Dia, memória
    knowledge/       Knowledge Base (RAG) e scripts
    laboratorio/     Laboratório comercial (experimentos, A/B, auditoria de call)
    leads/           Modal do lead, cadência, tarefas, inteligência do lead
    metas/           Metas operacionais e Scrum
    pipeline/        Board Kanban, lista, importação/exportação, Onboarding
  shared/
    components/      Application Shell (sidebar, header, estados, busca global)
    services/        store, eventBus, userStorage, idbCache, queryKeys, history
  contexts/          Auth, Tema, Pomodoro
  integrations/supabase/  Cliente e tipos gerados (não editar)
supabase/functions/  Edge Functions + `_shared/` (ai-core, ai-router, auth)
docs/                Esta documentação
```

Cada módulo segue o mesmo padrão interno:

```text
modules/<dominio>/
  pages/         Rotas
  components/    UI do domínio
  services/      Engines, repositórios e tipos (sem JSX)
  hooks/         Hooks do domínio
```

## 4. Acesso a dados (Refatoração 002)

Cada domínio expõe um **Repository** como ponto único de acesso a dados,
composto por `*Queries.ts` (leitura) e `*Mutations.ts` (escrita):

- `AgendaRepository`
- `IntelligenceRepository`
- `KnowledgeRepository`
- `LeadIntelligenceRepository`
- `HealthRepository`

Componentes nunca chamam `supabase` diretamente; usam o repositório via TanStack Query,
com chaves centralizadas em `src/shared/services/queryKeys.ts`.

## 5. Persistência local e sincronização

`src/shared/services/userStorage.ts` é a camada de persistência multi-dispositivo:

- `uload` / `usave` / `uremove` — leitura e escrita por usuário.
- `hydrateLocal`, `syncFromCloud`, `pullKeysFromCloud` — sincronização com a tabela
  `user_storage` (uma linha por `user_id` + `key`, valor em `jsonb`).
- Chaves de configuração protegidas garantem que cadência, lembretes e filtros
  sejam idênticos em notebook, tablet e celular.
- `pullInboundLeads` / `pullInboundInteractions` importam registros das tabelas de
  entrada dos webhooks para o pipeline.
- `normalizePhoneBR` produz o telefone canônico (`55 + DDD + número`) usado em todo
  o projeto para casar interações recebidas com leads existentes.

Cache local pesado fica em IndexedDB (`src/shared/services/idbCache.ts`).

## 6. Event bus

`src/shared/services/eventBus.ts` define o contrato de eventos do SOC:

`LeadCriado`, `LeadAtualizado`, `LeadMovido`, `LigacaoRegistrada`, `MensagemRegistrada`,
`ReuniaoMarcada`, `ReuniaoAtualizada`, `ReuniaoRealizada`, `VendaRealizada`,
`OnboardingIniciado`, `PomodoroFinalizado`, `FollowUpCriado`, `MetaAtualizada`,
`FinanceiroAtualizado`, `TarefaCriada`, `TarefaAtualizada`, `TarefaConcluida`.

Eventos possuem `dedupeKey` opcional (dedupe em janela de 1s). As assinaturas ficam
concentradas em `eventWiring.ts` — por exemplo, mover um lead para **Ganho** dispara
promoção ao Onboarding e criação de receita no Financeiro.

## 7. Rotas

| Rota | Tela |
|---|---|
| `/` | Cold Call (Centro de Operação) |
| `/oportunidades` | Pipeline de Oportunidades |
| `/onboarding` | Pipeline de Onboarding |
| `/missao` | Missão do Dia |
| `/central` | Central de Decisão |
| `/inteligencia` | Inteligência Comercial |
| `/inteligencia/central` | Central de Inteligência (chat com especialistas) |
| `/inteligencia/knowledge` | Knowledge Base |
| `/memoria` | Memória Comercial |
| `/dashboard` | Dashboard |
| `/metas`, `/scrum` | Metas operacionais e Scrum |
| `/financeiro` | Financeiro |
| `/pomodoro` | Pomodoro |
| `/agenda`, `/lembretes` | Agenda e lembretes |
| `/laboratorio` | Laboratório comercial |
| `/integracoes`, `/saude-sistema` | Configurações e diagnóstico |
| `/auth`, `/reset-password` | Autenticação |

Rotas internas são protegidas por `ProtectedRoute` + `AppLayout`.

## 8. Pipelines

Três pipelines encadeados:

1. **Cold Call** — `Novo Lead`, `Tentativa 1..10`, `Não Quer`, `Sem contato`.
2. **Oportunidades** — `Reunião Marcada` → ... → `Ganho` / `Perdido`.
3. **Onboarding** — implantação do cliente após o ganho.

Regras automáticas: "Marcar Reunião" move o lead para Oportunidades › Reunião Marcada e
pode criar evento no Google Calendar; mover para **Ganho** promove ao Onboarding e cria
receita no Financeiro quando há `contractValue`.

## 9. Performance

- Debounce em escrita e operações em lote.
- Cache IndexedDB para grandes volumes de leads.
- Virtualização/lazy nas listas e no board.
- Memoização por assinatura no `LeadIntelligenceRepository` (cache invalidado apenas
  quando o próprio lead muda).

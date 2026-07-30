# Camada de Inteligência Artificial

> Toda IA do CRM roda em Edge Functions. O frontend nunca fala com provedores de modelo.

## 1. Princípios

1. **Provedor único**: Lovable AI Gateway (`LOVABLE_API_KEY`), cobrindo modelos Google e OpenAI.
2. **Roteador central**: toda chamada passa por `callAI()` em
   `supabase/functions/_shared/ai-router.ts`. Nenhuma feature conhece ou cita modelos.
3. **AI Core**: contratos, prompts, ferramentas, contexto, memória, knowledge e
   observabilidade vivem em `supabase/functions/_shared/ai-core/`, importados sempre
   pelo `index.ts`.
4. **Privilégio mínimo**: cada bloco de contexto só entra se houver conteúdo.
5. **Conteúdo externo é não confiável**: sanitizado e embrulhado por
   `_shared/untrusted-input.ts` antes de entrar no prompt.
6. **Nada automático em anexos**: análise de anexo é sempre explícita ("Ler com IA").

## 2. AI Router

`callAI({ task, system, user, ... })`:

- Registry por tarefa com **tiers** de modelo (mais barato primeiro) e lista de fallback.
- Escolha de tier por `inputChars` ou `forceComplex`.
- Suporte a `json`, `schema` (structured outputs), `temperature`, `maxTokens`, `timeoutMs`
  (padrão 45s) e conteúdo multimodal (`userContent`).
- Fallback automático em 429/402/5xx/timeout/erro de rede.
- Log best-effort em `ai_router_logs`.

Tarefas registradas: `diretor_comercial`, `auditor_ligacao`, `audit_transcript`,
`analyze_attachment`, `extract_memory`, `priority_leads`, `auto_diagnosis`,
`intel_router`, `consultor_leads`, `mentor_p21`.

## 3. AI Core

| Arquivo | Responsabilidade |
|---|---|
| `types.ts` | Contratos compartilhados (`SpecialistId`, `CrmContext`, `BuiltContext`, ...) |
| `prompt-registry.ts` | Prompts versionados (`id` + `version` + ferramentas permitidas) |
| `tool-registry.ts` | Catálogo de ferramentas autorizadas por especialista |
| `context-builder.ts` | Montagem determinística do contexto com limites de caracteres |
| `memory-engine.ts` | Recuperação de memória comercial relevante |
| `lead-context.ts` | Contexto do lead para diagnósticos |
| `knowledge-governance.ts` | Regras de escopo, ownership e limites do RAG |
| `knowledge-engine.ts` | Busca semântica com cache por execução |
| `knowledge-ingestion.ts` | Governança de importação/indexação (tamanho, chunking, scan de injeção) |
| `observability.ts` | Eventos de execução em `ai_execution_events` |

### Ordem fixa do contexto

`histórico → CRM (snapshot + lead) → knowledge → blocos extras`

Limites (`CONTEXT_LIMITS`): 10 turnos de histórico (1.500 chars por turno, 8.000 no bloco),
12.000 chars por bloco de CRM, 18.000 no bloco de knowledge (3.000 por trecho) e
2.000 chars na pergunta.

### Ferramentas

| Ferramenta | Uso | Especialistas | Auth do usuário |
|---|---|---|---|
| `knowledge.search` | Busca semântica na Knowledge Base | `mentor_p21` | sim |
| `memory.retrieve` | Recupera memórias e padrões comerciais | `diretor_comercial`, `consultor_leads`, `mentor_p21` | não |

## 4. Especialistas

- **Diretor Comercial IA** — leitura estratégica da operação. Toda resposta termina com o
  bloco obrigatório: 🎯 Prioridade nº 1 · ⚠ Maior risco · 📈 Maior oportunidade · ✅ Próxima ação.
- **Consultor de Leads** — foco no lead aberto no CRM.
- **Mentor P21** — apoia-se na Knowledge Base oficial, com citações.

Raciocínio em 4 camadas, nesta ordem: **conversa → contexto do CRM → Knowledge Base →
conhecimento geral do modelo**. A IA nunca age como mecanismo de busca.

## 5. Edge Functions de IA

| Função | Papel |
|---|---|
| `intel-router` | Chat da Central de Inteligência; roteia para o especialista |
| `diretor-comercial-ia` | Parecer estratégico diário da operação |
| `auto-diagnose-lead` | Diagnóstico automático do lead (Atualizar Inteligência) |
| `priority-leads-ia` | Leads prioritários do dia |
| `analyze-call-note` | Análise de anotação de ligação |
| `audit-transcript` | Auditoria de transcrição de call |
| `analyze-attachment` | Leitura sob demanda de anexo |
| `extract-memory` | Extração de memória comercial |
| `knowledge-search` / `knowledge-index` / `knowledge-import` | RAG da Knowledge Base |

## 6. Inteligência do Lead (Single Source of Truth)

`LeadIntelligenceRepository` unifica temperatura, próxima melhor ação, briefing
executivo, badges, trilha comercial e referências de memória. Regras:

- Toda leitura é derivada **do próprio lead** — nada é compartilhado entre leads.
- Funções de leitura são puras e não disparam IA.
- A única operação com IA é `runDiagnosis` (botão **🧠 Atualizar Inteligência**), que
  recalcula briefing, temperatura, score, probabilidade, tendência, NBA, memória,
  timeline, prioridade e Missão do Dia, e grava um snapshot versionado com histórico.

## 7. Priorização e Missão do Dia (SOC)

- `priorityEngine.ts` — motor único de priorização; nenhum peso é duplicado em outro lugar.
- `missionPlanner.ts` — gera a Missão do Dia respeitando metas operacionais configuradas,
  follow-ups inteligentes com cooldown e a meta mínima de 20 follow-ups/dia
  (níveis: prioridade máxima → leads quentes → cadência operacional).
- `getOperationalCapacity()` — planeja **80%** da capacidade calculada, reservando 20%
  como reserva estratégica (exibido em `OperationalCapacityCard`).
- `missionStore.ts` — persistência própria da execução diária.

## 8. Observabilidade

`ai_execution_events` registra apenas metadados, IDs, versões, contagens, fontes e status.
A gravação é estritamente não bloqueante: se a telemetria falhar, a resposta da IA segue
normalmente.

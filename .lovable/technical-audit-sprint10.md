# Relatório de Auditoria Técnica — Sprint 10
CRM Performance21 · 14 de Agosto de 2026

## 1. Mapa de Fontes de Dados

| Entidade | Tipo | Interface | Fonte Principal | Cache | Repository / Service | Sincronização | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Lead** | Factual | `Lead` | Supabase (`leads`) | IndexedDB (`p21_leads`) | `store.ts` | Bidirecional (debounced) | Autoritativa |
| **Interação** | Factual | `Interaction` | Supabase (`leads.interactions`) | IndexedDB (embutido no Lead) | `store.ts` | Parte do Lead | Autoritativa |
| **Ligação** | Factual | `CallNote` | Supabase (`leads.callNotes`) | IndexedDB (embutido no Lead) | `store.ts` | Parte do Lead | Autoritativa |
| **Reunião** | Factual | `Meeting` | Supabase (`meetings`) | IndexedDB (`p21_meetings`) | `store.ts` / `AgendaRepository` | Bidirecional / Google Sync | Autoritativa |
| **Tarefa** | Factual | `LeadTask` | Supabase (`user_storage`) | IndexedDB (`p21_lead_tasks`) | `leadTasks.ts` | Cloud Sync | Autoritativa |
| **Meta** | Métrica | `GoalsSettings` | Supabase (`user_storage`) | localStorage (`p21_goals_settings`) | `store.ts` | Cloud Sync | Autoritativa |
| **Financeiro** | Factual | `FinanceTransaction` | Supabase (`user_storage`) | IndexedDB (`p21_finance_tx`) | `finance.ts` | Cloud Sync | Autoritativa |
| **Pomodoro** | Factual | `PomodoroSession` | Supabase (`user_storage`) | IndexedDB (`p21_sessions`) | `PomodoroContext` | Cloud Sync | Autoritativa |
| **Conhecimento** | Factual | `KnowledgeDocument` | Supabase (`knowledge_documents`) | — | `KnowledgeRepository` | Tempo Real | Autoritativa |
| **Memória** | Factual | `MemoryEntry` | Supabase (`commercial_memory`) | — | `commercialMemory.ts` | Tempo Real | Autoritativa |
| **Diagnóstico** | Recomendação | `AutoDiagnosis` | Supabase (`leads.autoDiagnosis`) | IndexedDB (embutido no Lead) | `autoDiagnosis.ts` | Parte do Lead | Derivada (IA) |
| **NBA** | Recomendação | `NextBestAction` | Dinâmica (Baseada em Lead) | — | `nextBestAction.ts` | — | Derivada |

## 2. Catálogo de Eventos Comerciais

| Evento | Origem | Consumidores Principais | Persistência |
| :--- | :--- | :--- | :--- |
| `LeadCriado` | `store.ts` | `eventWiring`, `PipelineBoard` | Cloud (via Sync) |
| `LeadAtualizado` | `store.ts` | `eventWiring`, `LeadDetailDrawer` | Cloud (via Sync) |
| `LeadMovido` | `store.ts` | `eventWiring`, `History`, `Ledger` | Cloud (via Sync) |
| `LigacaoRegistrada` | `ConcluirTentativa` | `eventWiring`, `History`, `Ledger` | Lead Interaction |
| `ReuniaoMarcada` | `ScheduleMeeting` | `eventWiring`, `Agenda`, `History` | Cloud (via Sync) |
| `InteracaoRegistrada` | `LeadDetailDrawer` | `eventWiring`, `History`, `Ledger` | Lead Interaction |
| `TarefaConcluida` | `leadTasks.ts` | `eventWiring`, `History` | Cloud (via Sync) |

## 3. Auditoria da IA

| Recurso | Arquivo | Gatilho | Cache | Modelo |
| :--- | :--- | :--- | :--- | :--- |
| **Diagnóstico Completo** | `autoDiagnosis.ts` | Manual ("Atualizar Inteligência") | No Lead (`autoDiagnosis`) | Gemini 1.5 Pro/Flash |
| **Próxima Melhor Ação** | `nextBestAction.ts` | Renderização (Derivada) | — | Lógica Local / Gemini |
| **Diretor Comercial IA** | `diretorIA.ts` | Manual / Periódico | `p21_diretor_ia_history` | GPT-4o Mini |
| **Análise de Anexo** | `analyze-attachment` | Manual ("Ler com IA") | `attachment.analysis` | Gemini 1.5 Pro |

**Observações de Segurança:**
*   Navegação e troca de abas **não** disparam chamadas de IA.
*   Os prompts estão centralizados em Edge Functions ou `PromptRegistry` (não expostos no frontend).
*   Não foram encontradas chamadas automáticas em loop ou sem gatilho de usuário/evento.

## 4. Auditoria Mateline (Fluxo Crítico)

**Arquivos Identificados (Somente Leitura):**
*   `supabase/functions/receive-matteline-call/index.ts`
*   `src/shared/services/activityLedger.ts` (Drenagem da fila)
*   `src/modules/cold-call/services/mattelineCampaign.ts`

**Status:** Integridade preservada. Nenhuma alteração realizada conforme bloqueio absoluto.

## 5. Backlog Técnico (Sprint 10)

| ID | Título | Risco | Recomendação |
| :--- | :--- | :--- | :--- |
| BT01 | E-mail legado em `AuthContext` | Baixo | Substituir por verificação de Role (`has_role`) via Supabase RPC. |
| BT02 | `user_storage` como tabela genérica | Médio | Migrar entidades pesadas (Tarefas, Financeiro) para tabelas relacionais próprias para melhor indexação. |
| BT03 | Cache IndexedDB sem versionamento | Baixo | Implementar `p21_db_version` para facilitar migrações de esquema local. |
| BT04 | Logs sensíveis no modo dev | Médio | Implementar `Logger` que remove payloads automaticamente em produção. |

## 6. Conclusão da Auditoria
*   **Fontes Autoritativas:** Mapeadas e confirmadas.
*   **Custos:** Caches de IA estão operacionais; nenhuma chamada duplicada encontrada.
*   **Segurança:** E-mail `vitorco23@gmail.com` movido para constante técnica `LEGACY_ADMIN_EMAIL` conforme instrução.
*   **Build:** Validado com sucesso.

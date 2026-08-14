# Plano: Conversar 2.0 — Contexto Inteligente e RAG Global

Refatorar estruturalmente a área de Inteligência → Conversar para implementar roteamento por intenção, RAG global em todos os especialistas e o princípio de contexto mínimo relevante.

## Alterações Técnicas

### 1. Extensão de Tipos e Registry
- **types.ts**: Adicionar `IntelIntent` para categorizar as perguntas (Operação, Metodologia, Objeções, Script, Oferta, Lead, Estratégia).
- **tool-registry.ts**: Autorizar a ferramenta `knowledge.search` para todos os especialistas (`diretor_comercial`, `consultor_leads`, `mentor_p21`).

### 2. Refatoração do Roteador (intel-router)
- **prompt-registry.ts**: Atualizar `ROUTER_SYSTEM` para classificar tanto o `specialist` quanto a `intent` da pergunta.
- **index.ts (intel-router)**: 
    - Atualizar `classify` para lidar com a nova classificação de intenção.
    - Implementar a lógica de "Contexto Mínimo": se a intenção for metodológica, omitir o snapshot completo do CRM para reduzir ruído e custo.
    - Ativar RAG global: chamar `runKnowledgeSearch` para qualquer especialista se a intenção for relacionada a conhecimento (Objeções, Scripts, Metodologia, etc.).
    - Passar os chunks de conhecimento recuperados para o `buildChatContext` de qualquer especialista selecionado.

### 3. Fortalecimento da Identidade P21
- **prompt-registry.ts**:
    - Atualizar `CONSULTOR_CORE` com a regra de prioridade: a documentação da Performance21 tem precedência absoluta sobre o conhecimento genérico do modelo de IA.
    - Adicionar instrução para não inventar dados (alucinação zero para métricas e fatos).
    - Refinar o perfil do Diretor Comercial para ser mais incisivo e baseado em intenção.

### 4. Otimização do Context Builder
- **context-builder.ts**: Pequenos ajustes para garantir que blocos vazios ou filtrados não gerem ruído no prompt final.

## Especialistas e Fluxo de Intenção

- **Intent: Operação/Métricas** -> Snapshot CRM (Completo) + Knowledge (Se necessário).
- **Intent: Metodologia/Objeções/Script** -> Knowledge (Prioridade) + Contexto Mínimo CRM.
- **Intent: Lead Específico** -> Dados do Lead + Knowledge Relevante + Omitir Global Dashboard.
- **Intent: Prescrição de Oferta** -> Knowledge (Entregáveis/Comercial) + Diagnóstico do Lead.

## Validação e Testes
- Simular perguntas de diferentes categorias (R1/R2, métricas, objeções).
- Verificar via logs se o contexto enviado foi reduzido para perguntas metodológicas.
- Confirmar se o especialista `diretor_comercial` agora recebe e utiliza chunks de conhecimento quando pertinente.

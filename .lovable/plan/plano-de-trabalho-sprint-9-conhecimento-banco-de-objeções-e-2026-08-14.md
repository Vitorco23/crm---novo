# Plano de Trabalho - Sprint 9: Conhecimento, Banco de Objeções e Memória Comercial

Este plano visa organizar a experiência de inteligência do CRM, diferenciando claramente entre fatos (evidência), sínteses (memória), padrões validados (conhecimento) e sugestões (IA).

## 1. Auditoria e Mapeamento de Fontes
- **Banco de Objeções**: Identificado como categoria "Objeções" dentro da `KnowledgeBase.tsx`. Fonte: tabela `knowledge_documents`.
- **Memória Comercial**: Página `MemoriaComercial.tsx`. Fonte: tabela `commercial_memory`.
- **Evidências**: Timeline de interações no `LeadDetailDrawer.tsx` e `InteracoesTimeline.tsx`.
- **Knowledge Base**: `KnowledgeBase.tsx`. Fonte: tabela `knowledge_documents`.

## 2. Reorganização da Interface (Quatro Camadas)

### A. Camada de Evidência (Fatos)
- Padronizar labels de origem nas interações.
- Destacar metadados factuais (quem, quando, onde, transcrição original).

### B. Camada de Memória Comercial
- Atualizar `MemoriaComercial.tsx` para exibir fontes vinculadas e status de atualização (baseado em `updated_at`).
- Implementar sinalização visual para memórias sem fonte identificada ("Fonte não identificada nos dados atuais").
- Garantir que a regeneração seja apenas via ação manual.

### C. Camada de Conhecimento Aprovado
- Refatorar visualização de itens na `KnowledgeBase.tsx`.
- Adicionar badges explícitos: `Aprovado`, `Rascunho`, `Manual`, `IA`.
- Implementar ações rápidas: Copiar resposta, Abrir lead relacionado (se existir ID no metadado).

### D. Camada de Recomendação de IA
- Aplicar labels discretos em conteúdos gerados por IA em toda a interface (ex: "Sugestão de IA", "Análise Automática").
- Diferenciar visualmente de conteúdos manuais ou aprovados.

## 3. Banco de Objeções
- Criar uma visão filtrada ou aba dedicada dentro do shell de Inteligência para "Objeções" (usando a estrutura de KnowledgeBase).
- Garantir exibição de nicho, contexto e resposta recomendada.

## 4. Rastreabilidade e Integridade
- Em cada bloco de síntese (memória ou diagnóstico), exibir o link para as evidências de origem.
- Implementar detecção visual de duplicidades (sem deletar registros).
- Confirmar ausência de chamadas de IA automáticas na navegação.

## Detalhes Técnicos
- Utilizar apenas os esquemas de banco e repositórios existentes.
- Acessibilidade: Navegação por teclado total e foco em headings/labels.
- Responsividade: Layout adaptável para mobile preservando legibilidade de textos longos.

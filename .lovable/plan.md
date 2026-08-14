## Sprint 5 — Agenda e Operação Diária Simplificadas

Esta sprint foca exclusivamente na simplificação visual e operacional da página de Agenda, transformando-a em um cockpit eficiente para o vendedor.

### Ações e Melhorias

#### 1. Cabeçalho da Agenda
- **Redesign Compacto:** Criação de um cabeçalho fixo contendo título, período atual, navegação ("Hoje", "<", ">") e seletores de visualização.
- **Ações Rápidas:** Botões para "Atualizar" e "Nova Tarefa" mantidos de forma discreta.

#### 2. Visualização Operacional
- **Destaque para Atrasos:** Compromissos com data passada serão destacados visualmente.
- **Ordenação Cronológica:** Foco nos compromissos do dia e próximos eventos.
- **Eventos Concluídos:** Posição visual secundária (opacidade reduzida).

#### 3. Cards de Compromisso
- **Informação Essencial:** Horário, tipo, lead/empresa e status em destaque.
- **Ações Integradas:** Botões diretos para WhatsApp, Google Meet e abertura do LeadDetailDrawer.
- **Detalhes sob Demanda:** Informações técnicas e descrições longas movidas para áreas expansíveis ou modais de detalhes.

#### 4. Filtros e Navegação
- **Área Consolidada:** Filtros de busca e tipo agrupados para reduzir ocupação de tela.
- **Preservação:** Manutenção integral da lógica de filtros, busca e navegação entre datas.

#### 5. Integração Google Agenda
- **Preservação Total:** Nenhuma mudança na lógica de sincronização, OAuth, Edge Functions ou tratamento de eventos recorrentes.
- **Feedback Visual:** Melhoria na apresentação de erros de sincronização.

### Arquivos afetados
- `src/modules/agenda/pages/Agenda.tsx`: Refatoração do layout e componentes internos.
- `src/modules/agenda/components/` (Novos arquivos se necessário para modularização interna):
  - `AgendaHeader.tsx`
  - `AgendaEventCard.tsx`
  - `AgendaListView.tsx`
  - `AgendaMonthView.tsx`

### Garantias de Segurança e Estabilidade
- Nenhuma alteração em Dashboard, Pipeline ou Modal de Lead.
- Preservação da lógica comercial e persistência de dados.
- Compatibilidade responsiva total (Desktop, Tablet, Mobile).
- Build limpo e testes de regressão em filtros e navegação.

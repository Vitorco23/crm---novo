# Sprint 4: Simplificação Visual do Modal do Lead

Implementar um redesenho completo do `LeadDetailDrawer.tsx` focado em reduzir a carga visual e melhorar a eficiência operacional do vendedor, mantendo todas as funcionalidades e dados existentes.

## Componentes a serem alterados

### 1. `LeadDetailDrawer.tsx` (Estrutura Principal)
- **Cabeçalho Compacto e Fixo**:
  - Redesenhar para ser fixo no topo.
  - Mostrar Nome da Empresa (bold), Contato, Etapa, Temperatura e Próxima Ação de forma hierárquica.
  - Agrupar ações rápidas (Ligar, WhatsApp, Agendar, Script) em uma barra compacta.
  - Mover "Atualizar Inteligência" para um botão de destaque sutil.
- **Navegação entre Abas**:
  - Tornar a barra de abas (`TabsList`) compacta e fixa logo abaixo do cabeçalho.
- **Rodapé Compacto**:
  - Remover redundâncias e focar em status de salvamento.

### 2. Organização Interna das Abas
- **Aba "📋 Informações" (Geral)**:
  - **Nível 1**: Próxima Ação (Target), Mover Lead e Contatos Principais sempre visíveis.
  - **Nível 2**: Detalhes da Empresa e Contrato em seções agrupadas.
  - **Nível 3**: Informações complementares em seções recolhíveis (`Accordion`).
- **Aba "💬 Interações Comerciais" (Timeline)**:
  - Manter `InteracoesTimeline` com foco no resumo executivo e IA.
  - Garantir que eventos longos fiquem recolhidos por padrão.
- **Aba "📝 Observações"**:
  - Área de texto para notas fixas no topo.
  - **Seção Recolhível "Tarefas"**: Agrupar a lista de tarefas pendentes/concluídas.
  - **Seção Recolhível "Cadência do Nicho"**: Integrar o `CadenceEditor` de forma que as tentativas (T0-T9) sejam navegáveis ou compactas.
- **Aba "📎 Anexos"**:
  - Organizar em grid compacto.
  - Manter a funcionalidade de "Ler com IA" sob demanda.

### 3. Hierarquia Visual e Poluição
- Substituir badges excessivos por ícones com tooltips.
- Padronizar espaçamentos (paddings/margins) usando o design system (#152039, #9ABD33).
- Implementar `Accordion` do shadcn para seções de Nível 3.

## Detalhes Técnicos
- **Estados**: Manter salvamento automático e validações onBlur.
- **Responsividade**: Ajustar larguras e toques para mobile; garantir que o cabeçalho fixo não oculte conteúdo em telas pequenas.
- **Funcionalidade**: Nenhuma regra de negócio ou campo do banco de dados será alterado.

## Validação e Segurança
- Confirmar que a ordem das etapas no PipelineBoard não foi alterada (limpeza de possíveis efeitos da Sprint 3).
- Build completo e verificação de persistência em todas as abas.

# Plano de Implementação: Sprint 8 - Conversar 2.0 (Refinamento Visual)

Este plano foca na transformação da interface da Central de Inteligência em um copiloto moderno, limpo e funcional, seguindo as diretrizes de design fornecidas.

## Alterações Propostas

### 1. Reestruturação do Viewport e Layout
- Fixar a altura da tela para usar `h-[calc(100vh-64px)]` (ajustado ao header global).
- Implementar scroll próprio para a área de mensagens.
- Sidebar compacta (220px) com truncamento de texto.
- Layout centralizado para o conteúdo das mensagens (max-width 800px).

### 2. Redesign das Mensagens
- **IA**: Remover o card (bubble) cinza. Renderizar texto diretamente sobre o fundo. Adicionar ícone discreto, nome do especialista e ações (Copiar/Regenerar) na base.
- **Usuário**: Refinar o bubble com padding menor, cantos suaves e largura máxima controlada.
- **Tipografia**: Otimizar `ReactMarkdown` com estilos específicos para parágrafos, listas e tabelas, garantindo whitespace consistente.

### 3. Composer Moderno e Flutuante
- Transformar a área de input em uma caixa flutuante na base do chat.
- Implementar textarea que expande automaticamente com o conteúdo (max-height 200px).
- Integrar o seletor de especialista (`✨ Auto ▾`) e o botão de envio de forma compacta dentro do composer.

### 4. Estado Vazio e Debug
- Criar uma tela de "Welcome" elegante e centralizada para novas conversas com atalhos operacionais.
- Mover o "Modo Debug" para um menu secundário ou ícone discreto, evitando poluição visual.

### 5. Responsividade
- Garantir que a sidebar se torne um drawer em telas menores (Mobile/Tablet).
- Manter o composer sempre acessível na base.

## Detalhes Técnicos
- **Componentes**: Atualização de `CentralInteligencia.tsx`.
- **Estilização**: Uso intensivo de Tailwind CSS para whitespace (`p-`, `m-`, `gap-`), tipografia (`prose`) e layout flex/grid.
- **Funcionalidade**: Nenhuma lógica de RAG ou integração de IA será alterada. O foco é puramente visual e de UX.

## Verificação
- Testar com respostas de diferentes tamanhos (curtas, médias, longas, listas e tabelas).
- Validar scroll infinito e comportamento do composer em dispositivos móveis.
- Confirmar persistência do CRUD de conversas após as mudanças visuais.

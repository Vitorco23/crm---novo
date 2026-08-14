# Plano de Estabilização do Chat (Sprint 9)

Este plano foca na correção de regressões de estado, histórico e funcionalidades de CRUD na Central de Inteligência.

## Problemas Identificados
1. **Reset Visual:** O envio da primeira mensagem em uma nova conversa causa o desaparecimento temporário da mensagem do usuário devido a uma condição de corrida entre a atualização do `activeId` e o `useEffect` que carrega mensagens do banco.
2. **Fetch fora de ordem:** A troca rápida entre conversas pode resultar em mensagens de uma conversa anterior sobrescrevendo a atual.
3. **CRUD Incompleto:** O menu de opções (Renomear/Excluir) não está conectado às mutations do repositório.
4. **Comportamento de Nova Conversa:** O botão "Nova conversa" não limpa o estado corretamente para permitir a criação via "Lazy Creation".

## Mudanças Propostas

### 1. Estabilização de Estado e Fluxo de Mensagens
- **Refatorar `send`:** Implementar um controle que mantém as mensagens otimistas locais mesmo após a criação da conversa, evitando o reset visual.
- **Proteção contra Race Conditions:** Usar um `ref` ou `AbortController` para garantir que apenas o resultado do fetch da conversa atualmente ativa seja aplicado ao estado.
- **Normalização do Histórico:** Garantir que o `history` enviado para a IA não contenha a mensagem atual duplicada e seja resetado para conversas novas.

### 2. Implementação do CRUD na Sidebar
- **Dropdown Menu:** Conectar o ícone `MoreVertical` a um `DropdownMenu` com opções de "Renomear" e "Excluir".
- **Edição Inline:** Implementar o modo de edição inline para renomear, com suporte a Enter (salvar) e Esc (cancelar).
- **Exclusão com Confirmação:** Adicionar um modal de confirmação antes de deletar, com lógica de redirecionamento para a próxima conversa disponível ou estado vazio.
- **Persistência:** Garantir que as alterações reflitam no banco via `IntelligenceRepository` e permaneçam após F5.

### 3. Melhoria na Experiência de "Nova Conversa"
- Garantir que o estado `activeId = null` mostre corretamente o `EmptyState`.
- A conversa só será persistida no banco após o envio da primeira mensagem, gerando um título automático de até 50 caracteres.

## Detalhes Técnicos
- Arquivos afetados: `src/modules/intelligence/pages/CentralInteligencia.tsx`.
- Nenhuma alteração no backend ou nas Edge Functions.
- Uso de `e.stopPropagation()` para evitar que o clique no menu selecione a conversa.
- Validação via simulação de rede lenta para garantir a robustez contra race conditions.

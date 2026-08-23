# Plan: Unificar Notificações de IA no Lead Detail Drawer

O usuário relatou que ao abrir um lead, as notificações de "Sugestão de ICP" e "Inteligência do lead atualizada" aparecem simultaneamente, sobrepondo-se no canto inferior direito. O objetivo é unificar essas mensagens para melhorar a experiência do usuário.

## Mudanças Propostas

### Frontend

- **`src/modules/leads/components/LeadDetailDrawer.tsx`**:
    - Alterar a função `runIcpSuggestion` para aceitar um parâmetro opcional que indique se deve exibir o toast de "sucesso genérico" ou se ele será gerenciado por quem chama.
    - Modificar a lógica do `useEffect` que dispara a sugestão de ICP ao abrir o lead para não mostrar o toast de "ICP validado" caso nada mude (evitando ruído desnecessário).
    - Na função `handleRefreshAI`, unificar o fluxo: chamar `runIcpSuggestion` e, dependendo do resultado, mostrar apenas uma notificação consolidada em vez de duas separadas.
    - Se a IA sugerir uma mudança, o toast de sugestão (com botão "Aplicar") terá precedência. Se a IA apenas validar o ICP atual, mostraremos uma mensagem única de sucesso.

## Detalhes Técnicos

- Refatorar `runIcpSuggestion` para retornar um booleano ou o resultado da sugestão.
- Garantir que `toast.success("Inteligência do lead atualizada")` não seja disparado se um toast de sugestão de ICP já estiver visível ou for mais relevante.
- Ajustar os tempos de duração (`duration`) para garantir que o usuário tenha tempo de ler a sugestão sem que ela suma rápido demais ou seja coberta por outra mensagem.

---
**Nota:** Não alterarei a lógica de negócio da IA, apenas a forma como os feedbacks visuais são apresentados ao usuário no componente de interface.

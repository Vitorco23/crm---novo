# Card do Lead: sugestão de ICP inline + reorganização da aba Informações

## Problema atual
- A sugestão de ICP aparece como toast (canto inferior direito), fora do modal. Clicar em "Aplicar" às vezes fecha o card e a alteração não é gravada.
- A aba "Informações" esconde dados úteis dentro de sanfonas fechadas ("Detalhes da Empresa", "Links e Localização"), o que atrapalha a navegação.

## 1. Sugestão de ICP dentro do card
- Remover o toast de sugestão de ICP (e o toast "ICP validado") do fluxo automático de abertura do lead.
- A sugestão passa a ser guardada em estado do modal e renderizada como um bloco fixo **acima de "Notas Permanentes"**, na aba Observações:
  - Título: "Sugestão de ICP: N estrelas" + estrelas atuais vs sugeridas.
  - Texto do raciocínio da IA.
  - Botões "Aplicar" e "Dispensar".
- Quando houver sugestão pendente, exibir um indicador discreto na aba Observações (ponto/badge) para o usuário perceber sem toast.
- O botão "Aplicar" grava direto no lead (mesma função de salvamento usada pelas estrelas do card), atualiza o estado local do modal, chama o refresh da lista e **não fecha o modal**. Após aplicar, o bloco some e mostra confirmação curta inline.
- Correção da confiabilidade: hoje o clique usa dados capturados no momento da chamada da IA; a aplicação passará a usar o id do lead e o valor sugerido guardados em estado, evitando o comportamento intermitente.

## 2. Reorganização da aba Informações
Substituir o modelo "campos soltos + 2 sanfonas fechadas" por uma página única em blocos sempre visíveis, sem sanfonas:

```text
[ Etapa Atual ............ ] [ Marcar Reunião ]
── Contato ───────────────────────────────────
Decisor | Telefone | WhatsApp | Instagram
── Empresa ───────────────────────────────────
Nicho | Cidade | ICP (estrelas) | Faz Anúncios
Tags de origem
── Links ─────────────────────────────────────
Website | Google Maps
── Negócio (só Oportunidades/Onboarding) ─────
Valor Contrato | Serviço
```

- Cada bloco com título curto e separador leve; grid de 2 colunas no desktop, 1 coluna no mobile.
- Nenhum campo é removido; apenas deixam de estar escondidos.
- A cadência do nicho e as tarefas continuam sanfonadas na aba Observações (como hoje), com Tarefas aberta por padrão.

## Detalhes técnicos
- Arquivo único: `src/modules/leads/components/LeadDetailDrawer.tsx`.
- Novo estado local `icpSuggestion: { leadId, stars, reasoning } | null`, limpo ao trocar de lead/fechar o modal.
- `runIcpSuggestion` deixa de emitir toasts para o caso automático; mantém toast de erro apenas quando disparado manualmente.
- Sem alterações em banco, Edge Functions ou regras de negócio.

# Concluir tentativa sensível ao canal da cadência

Hoje o modal "Como terminou essa tentativa?" é sempre de ligação: as opções são "Não atendeu", "Caixa postal", "Número inválido" etc., e a atividade registrada é sempre `call`. Quando a etapa da cadência é WhatsApp, Instagram ou E-mail, as opções não fazem sentido e a métrica sai errada.

## O que muda

O modal passa a ler o canal do passo atual da cadência (`getStepForLead`) e adapta título, opções e registro de atividade.

### Ligação (como hoje)
Não atendeu · Caixa postal · Conversou mas não houve interesse · Pediu retorno · Agendou reunião · Número inválido · Outro

### WhatsApp
- Mensagem enviada (sem resposta ainda)
- Respondeu com interesse
- Respondeu sem interesse
- Pediu retorno (data/hora)
- Agendou reunião
- Número não tem WhatsApp / inválido
- Outro

Campo opcional "O que você enviou?" (texto livre, gravado na nota) para todos os desfechos.

### Instagram
- Interação feita (curtida/comentário)
- Respondeu Story / DM
- Sem retorno
- Agendou reunião
- Perfil inativo ou inexistente
- Outro

Campo opcional "O que você fez/enviou?".

### E-mail
- E-mail enviado
- Respondeu com interesse
- Respondeu sem interesse
- E-mail inválido / bounce
- Agendou reunião
- Outro

Campo opcional "Assunto/conteúdo enviado".

## Regras de fluxo

- Avanço de etapa continua igual: desfechos "sem retorno/enviado sem resposta" avançam para a próxima Tentativa; "sem interesse" vai para Não Quer (com lembrete 30/60/90 opcional); "pediu retorno" cria lembrete e mantém a etapa; "agendou" abre o agendamento de reunião.
- Contato inválido: em ligação marca telefone inválido e move para Sem contato (como hoje); em e-mail/Instagram apenas registra na nota e avança/move para Sem contato conforme o caso.
- A nota gravada mantém o cabeçalho `[Cadência D2 · WhatsApp · ...]` e passa a incluir o texto enviado, quando preenchido.

## Métricas

O registro no ledger de atividade passa a usar o canal real do passo: `call`, `message` (WhatsApp/Instagram) ou `email`. Assim os "Dados estimados do dia" no Dashboard param de contar tudo como ligação. A deduplicação por lead+canal (60 min) continua valendo.

## Detalhes técnicos

- `src/modules/leads/components/ConcluirTentativaDialog.tsx`: mapa `OPTIONS_BY_CHANNEL` derivado de `CadenceChannel`, campo de conteúdo enviado, `recordActivity` com canal derivado do passo (fallback `call` quando não há passo resolvido).
- Sem mudanças em `cadence.ts`, no store ou no ledger.

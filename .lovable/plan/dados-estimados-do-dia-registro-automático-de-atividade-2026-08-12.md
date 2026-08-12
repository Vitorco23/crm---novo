# Dados Estimados do Dia — registro automático de atividade

Criar um registro (ledger) que captura automaticamente cada atividade comercial que você faz no CRM e exibi-lo no Dashboard, logo abaixo do Funil de Outreach, como uma estimativa do dia — não como verdade absoluta.

## O que passa a ser contabilizado

| Ação no CRM | Contabiliza como |
|---|---|
| Concluir tentativa (não atendeu, caixa postal, etc.) | Ligação |
| Mover lead de Tentativa N para Tentativa N+1 (ou etapa de ligação) | Ligação |
| Mover lead para etapa de mensagem/WhatsApp | Mensagem |
| Nova interação comercial (Ligação, WhatsApp, E-mail, Follow-up, Reunião) | O tipo escolhido |
| Nota de ligação registrada no lead | Ligação |
| Resumo da CallFace/Matteline chegando pelo webhook | Ligação |
| Reunião marcada | Reunião |

## Regra anti-duplicação

Cada atividade é gravada com uma chave `lead + canal + janela de tempo`.

- Janela padrão: **60 minutos**. Duas ações do mesmo canal no mesmo lead dentro da janela contam **uma vez só**.
- Fontes têm prioridade: `CallFace/webhook` > `interação manual` > `concluir tentativa` > `movimentação inferida`.
  Se já existe um registro inferido (movimentação) e chega um registro explícito (CallFace ou interação manual) na mesma janela, o registro é **promovido** — a fonte é atualizada, o total não muda.
  O inverso também vale: se a CallFace já registrou e depois você move o lead, nada novo é criado.
- Registros são idempotentes por origem: reprocessar a fila da CallFace ou reabrir a tela não gera novas contagens.

## O bloco no Dashboard

Novo card **"Dados estimados do dia"**, abaixo do Funil de Outreach, com:

- Contadores por canal: Ligações, WhatsApp/Mensagens, E-mails, Follow-ups, Reuniões — e o total.
- Uma linha por canal mostrando de onde veio a contagem (ex.: `18 ligações · 11 movimentação · 5 CallFace · 2 manual`).
- Aviso curto: "Estimativa baseada nas suas ações no CRM. Pode divergir do que foi anotado fora do sistema."
- Respeita o filtro de período já existente no Dashboard (Hoje / 7 dias / mês).

## Detalhes técnicos

- **Novo serviço** `src/shared/services/activityLedger.ts`
  - Tipo `ActivityEvent { id, at, leadId?, channel: 'call'|'message'|'email'|'followup'|'meeting'|'other', source: 'callface'|'interaction'|'attempt'|'movement'|'note'|'meeting', dedupeKey }`.
  - Persistência via `uload/usave` na chave `p21_activity_ledger` (sincroniza entre dispositivos como as demais chaves), ring buffer de ~20k eventos.
  - `recordActivity()` aplica a janela de 60 min + prioridade de fonte (promove em vez de duplicar).
  - `summarizeActivity(from, to)` retorna contagens por canal e por fonte.
- **Captura centralizada** em `src/shared/services/eventWiring.ts`, assinando o event bus existente (`LigacaoRegistrada`, `MensagemRegistrada`, `LeadMovido`, `ReuniaoMarcada`) — nenhum componente precisa chamar o ledger diretamente.
- `addInteraction` em `store.ts` passa a emitir o tipo real da interação (hoje emite sempre `LigacaoRegistrada`), para que e-mail/follow-up não virem ligação.
- A drenagem da CallFace (`syncInboundInteractions` em `userStorage.ts`) grava com `source: 'callface'` e chave estável por `call_id`/id da linha, garantindo idempotência.
- **Novo componente** `src/modules/dashboard/components/EstimatedActivityCard.tsx`, renderizado em `Dashboard.tsx` logo após o Funil de Outreach.
- Sem mudanças de schema no banco; tudo roda sobre o storage sincronizado já existente.

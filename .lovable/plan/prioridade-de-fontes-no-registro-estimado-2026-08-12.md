# Prioridade de fontes no registro estimado

## Como está hoje

O ledger (`activityLedger.ts`) já tem uma escala de confiança de fonte:

```text
CallFace (5) > Interação manual (4) = Reunião (4) > Concluir tentativa (3) > Nota (2) > Movimentação de card (1)
```

Quando chega um registro novo, ele procura um registro existente **do mesmo lead, no mesmo canal, dentro de 60 minutos**. Se achar:
- fonte mais confiável -> promove (troca a fonte, não soma);
- fonte igual ou menos confiável -> ignora.

Ou seja, a ordem de prioridade que você descreveu já vale — mas só quando o canal é o mesmo.

## O problema real

A comparação é por **lead + canal**. Se você move o card da Tentativa 1 para a 2 (o sistema infere "ligação") e depois registra manualmente "WhatsApp" no mesmo lead, são dois canais diferentes: o ledger cria **dois registros** — 1 ligação inferida + 1 mensagem manual. O total do dia fica inflado, e a ligação que nunca aconteceu continua contando.

## O que muda

Passa a valer promoção **entre canais**, não só dentro do mesmo canal:

1. Ao gravar um registro **explícito** (CallFace, interação manual, concluir tentativa), o ledger procura primeiro um registro do mesmo lead na janela de 60 min **em qualquer canal** cuja fonte seja **inferida** (movimentação ou nota).
   - Se achar: aquele registro é **substituído** — canal e fonte passam a ser os do registro explícito. Nada de novo é criado.
   - Se não achar: mantém a regra atual (mesmo canal -> promove; senão -> cria novo).
2. Ao gravar um registro **inferido** (movimentação), se já existe qualquer registro explícito do mesmo lead na janela — em qualquer canal — **nada é criado**. A movimentação é considerada consequência da ação já registrada.
3. Entre dois registros explícitos de canais diferentes (ex.: CallFace ligou + você registrou WhatsApp), ambos contam — são ações reais distintas.
4. CallFace continua topo da escala: se a movimentação/nota já registrou, ela é substituída pela ligação do CallFace; se o CallFace já registrou, sua movimentação depois não conta.

Resumo da hierarquia final aplicada por lead/janela:

```text
CallFace  >  registro manual (nova interação / concluir tentativa)  >  movimentação de card
```

## Detalhes técnicos

- Único arquivo alterado: `src/shared/services/activityLedger.ts`.
- Novo conjunto `INFERRED_SOURCES = { movement, note }` e `EXPLICIT_SOURCES = { callface, interaction, attempt, meeting }`.
- `recordActivity()` ganha, antes do match por canal:
  - se a fonte é explícita: busca registro inferido do mesmo lead na janela (qualquer canal) e o reescreve com o novo canal + fonte + horário;
  - se a fonte é inferida: aborta se existir registro explícito do mesmo lead na janela.
- Idempotência por `externalKey` (CallFace) e janela de 60 min permanecem iguais.
- Nenhuma mudança de UI ou de schema; o card "Dados estimados do dia" apenas passa a mostrar números mais fiéis.

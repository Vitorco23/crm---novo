## Problema

Na página `/metas`, cada tecla digitada faz o input perder o foco — você só consegue digitar 1 caractere por vez.

## Causa raiz

Em `src/pages/Metas.tsx`, o componente auxiliar `InputNum` é definido **dentro** do componente `Metas`. Toda vez que o estado `g` muda (a cada tecla), o React vê `InputNum` como um *novo* tipo de componente, desmonta o `<Input>` anterior e monta um novo do zero. Resultado: o foco se perde após cada dígito, parecendo que o valor "só pode ser alterado de 1 em 1".

O mesmo vale para o helper `Stat`.

## Correção

1. **Mover `InputNum` para fora** do componente `Metas` (declaração no escopo do módulo), recebendo `label`, `value`, `onChange`, `suffix`, `step`, `min` por props. Assim o React mantém a mesma instância do `<Input>` entre renders e o foco é preservado.
2. **Mover `Stat` para fora** pelo mesmo motivo (evita re-mounts desnecessários).
3. Tratar `parseFloat("")` para não jogar `NaN` enquanto o usuário apaga o campo (o `update` já faz `isNaN ? 0`, então mantém comportamento — apenas garantir que o input controlado aceite string vazia visualmente sem travar).

Nenhuma mudança de lógica de cálculo, layout ou design — apenas a estrutura do componente.

## Arquivo afetado

- `src/pages/Metas.tsx`
# Corrigir importação com tags LUPUS e INBOUND

## Diagnóstico
O fluxo monta corretamente os leads importados e mostra o total no aviso, mas atualiza apenas o estado visual temporário. Em seguida, ele recarrega os leads do armazenamento sem ter salvo o resultado, descartando os novos leads e as tags.

## Alterações
- Persistir o conjunto final de leads após o upsert, antes de fechar o modal e atualizar o Kanban.
- Isolar a regra de importação/upsert em um serviço testável, preservando etapa e dados existentes enquanto adiciona a tag escolhida.
- Manter a identificação de duplicados por telefone, GMN ou empresa+cidade.

## Validação
- Testar importação de novo lead com tag LUPUS.
- Testar importação de novo lead com tag INBOUND.
- Testar atualização de lead existente, garantindo preservação da etapa e inclusão da nova tag.
- Rodar os testes relevantes e validar o build da aplicação.

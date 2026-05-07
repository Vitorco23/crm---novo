## Diagnóstico rápido

Hoje o app guarda tudo em `localStorage` (cache local) e sincroniza com a tabela `user_storage` na nuvem (1 linha por chave, valor JSON inteiro). Isso funciona, mas tem 3 problemas que pioram o uso conforme você cresce:

1. **Cada save reescreve o JSON inteiro** (ex.: salvar 1 lead reenvia os 2.000) → lento e gasta banda/CPU.
2. **"Last writer wins"**: se você abrir em 2 dispositivos ao mesmo tempo, o último a salvar sobrescreve o outro → risco de perder edições.
3. **Tudo carrega de uma vez no login** → tela "Carregando…" demora quando há muitos leads.

Tudo isso pode ser melhorado **sem migrar dados** — mantemos o `user_storage` como fonte e só mudamos a forma de ler/gravar.

---

## Plano de melhorias (incremental, sem perder dados)

### Etapa 1 — Segurança dos dados (faço primeiro, prioridade máxima)
- **Backup automático local**: antes de qualquer `syncFromCloud` sobrescrever o cache, salvar um snapshot em `u:<uid>:p21_leads__backup_<data>` (mantém os 3 últimos). Se algo der errado, dá pra restaurar com 1 clique.
- **Botão "Exportar backup completo"** em Integrações → baixa um `.json` com todos os dados (leads, finance, scrum, etc.).
- **Botão "Importar backup"** → restaura de um `.json` exportado.
- **Trava anti-sobrescrita**: se o cloud responder vazio mas o local tem dados, **não apaga o local** (já existe parcialmente, vou reforçar).

### Etapa 2 — Performance de gravação (debounce + diff)
- **Debounce de 800ms** nos `usave`: várias edições seguidas viram 1 upload só.
- **Compressão**: comprimir o JSON com `lz-string` antes de enviar (reduz ~70% do tamanho dos leads).
- Resultado: salvar fica instantâneo na UI, upload acontece em background sem travar.

### Etapa 3 — Performance de carregamento
- **Sync incremental por `updated_at`**: só baixa do cloud as chaves que mudaram desde o último sync (guardo `lastSyncAt` local).
- **Lazy load**: ao logar, carrega primeiro `p21_leads` e `p21_daily_tasks` (o que aparece na primeira tela). Resto (`scrum`, `finance`, `pomodoro`) carrega em background.
- Resultado: tela "Carregando…" some em <1s mesmo com muitos dados.

### Etapa 4 — Multi-dispositivo seguro
- **Realtime subscription** no `user_storage`: quando o desktop salva, o celular recebe o update em segundos sem precisar recarregar.
- **Detecção de conflito**: se o cloud tem `updated_at` mais novo que o último sync local, avisar "Dados foram atualizados em outro dispositivo, recarregar?" em vez de sobrescrever silenciosamente.

### Etapa 5 — Limpeza / saúde do app
- **Indicador de sync** no header (✓ sincronizado / ⏳ enviando / ⚠️ offline).
- **Página "Diagnóstico"** em Integrações mostrando: nº de leads, tamanho dos dados, último sync, último backup.
- **Limpar caches antigos**: remover chaves `legacy` não-prefixadas após confirmar que tudo está no cloud.

---

## Detalhes técnicos

- Arquivos tocados: `src/lib/userStorage.ts` (principal), `src/contexts/AuthContext.tsx`, novo `src/lib/backup.ts`, novo `src/components/SyncStatusBadge.tsx`, `src/pages/Integracoes.tsx`.
- Sem migração de banco: a tabela `user_storage` continua igual. Só mudamos como ler/gravar nela.
- Dependência nova: `lz-string` (~3KB) para compressão.
- Realtime: já está disponível no Supabase, só ativar publication na tabela `user_storage`.

---

## Como você quer prosseguir?

Posso fazer **tudo de uma vez** ou **só a Etapa 1 (segurança/backup) primeiro** e depois avançar conforme você testar. A Etapa 1 sozinha já elimina qualquer risco de perder dados de novo.
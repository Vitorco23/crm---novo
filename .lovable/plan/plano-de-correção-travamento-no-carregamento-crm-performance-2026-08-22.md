# Plano de Correção: Travamento no Carregamento (CRM Performance21)

O CRM está travado na tela "Carregando" devido a um possível "hang" ou falha silenciosa na inicialização do `AuthContext` e do motor de sincronização de dados (`userStorage.ts`). O sistema de carregamento aguarda a hidratação do IndexedDB e a sincronização com a nuvem, e qualquer atraso ou erro não tratado nessas etapas impede a renderização da interface autenticada.

## Alterações Propostas

### 1. Robustez no AuthContext
- Garantir que o estado de `loading` seja definido como `false` em todos os cenários, mesmo se houver erros fatais durante a inicialização do armazenamento.
- Adicionar blocos `try/catch` mais granulares ao redor de `ensureUserStorageReady`.

### 2. Otimização do userStorage
- Adicionar salvaguardas no `hydrateLocal` para evitar que uma falha no IndexedDB trave a promessa de inicialização.
- Reforçar o mecanismo de timeout na sincronização com a nuvem para que a interface local (leads já carregados no cache) seja liberada imediatamente após a hidratação do IndexedDB, tratando a sincronização com a nuvem como um processo de fundo (background).

### 3. Melhoria na Experiência de Erro
- Caso ocorra um erro crítico de storage, permitir que o usuário acesse o CRM em modo "local-only" com um aviso, em vez de exibir uma tela branca ou de carregamento infinito.

## Detalhes Técnicos

- **AuthContext.tsx**: Modificar o `useEffect` para assegurar a transição de estado.
- **userStorage.ts**: Adicionar `timeout` global nas operações de IndexedDB e garantir que `syncFromCloud` nunca bloqueie a inicialização do app por mais de 8 segundos (valor atual de `INITIAL_CLOUD_SYNC_TIMEOUT_MS`).
- **idbCache.ts**: Implementar um timeout nas operações de abertura de banco de dados para evitar esperas infinitas em navegadores com IndexedDB corrompido ou bloqueado.

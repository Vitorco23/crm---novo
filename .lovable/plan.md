## Plano: Nova Landing Page Pública (/lp01)

Este plano descreve a implementação da rota pública `/lp01` dentro do projeto CRM Performance21, garantindo isolamento total da área privada e performance otimizada.

### Objetivos
1. Criar uma landing page de alta conversão fiel à identidade da Performance21.
2. Garantir que a rota seja pública e acessível sem login.
3. Isolar o carregamento da LP dos recursos pesados do CRM.

### Mudanças Técnicas

#### 1. Arquitetura de Rotas
- Adicionar `/lp01` no `src/App.tsx` fora do `ProtectedRoute`.
- Utilizar `React.lazy` para o componente da LP para garantir code-splitting.

#### 2. Módulo Público (`src/modules/public/`)
- Criar `LP01.tsx`: Componente principal da Landing Page.
- Criar `components/LPNavbar.tsx`: Navbar fixa e translúcida com backdrop blur.
- Criar `components/LPHero.tsx`: Primeira dobra com formulário de captura e lógica de "disponibilidade" (scarcity).
- Criar `components/LPSections.tsx`: Seções de "O Diagnóstico", "Cases", "Serviços", "Método", "Sobre" e "FAQ".
- Criar `utils/availability.ts`: Lógica de redução de diagnósticos disponíveis persistida no `localStorage`.

#### 3. Integração e Segurança
- O formulário enviará dados para a Edge Function `receive-landing-lead` já existente.
- Nenhum contexto ou provider interno do CRM (como `PomodoroContext`) será injetado na rota pública para evitar carregamento de dados desnecessários.

### Estilo e Identidade
- **Paleta:** Fundo `#0b0b0d`, Texto `#f5f5f5`, Dourado `#caa55a`.
- **Responsividade:** Layout adaptável para mobile, tablet e desktop.
- **Assets:** Áreas reservadas para imagens (iceberg, fotos, screenshots) que serão adicionadas posteriormente.

### User Review Required
> [!IMPORTANT]
> A lógica de escassez visual (diagnósticos disponíveis) será baseada no dia do mês (1-7: 30, 8-14: 21, 15-21: 14, 22+: 7). O valor será reduzido uma vez a cada 24h e salvo no seu navegador. Está de acordo com essa regra?

---

### Detalhes Técnicos (Para Desenvolvedores)
- **Code Splitting:** `const LP01 = lazy(() => import('./modules/public/pages/LP01'))`.
- **Form Submission:** Reuso do `fetch` para a Edge Function com o segredo do webhook.
- **Isolamento de Estado:** A LP não consumirá o `userStorage` nem inicializará o `idbCache` do CRM.

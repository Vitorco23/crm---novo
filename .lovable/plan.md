# Sprint 1 — Fundação Visual e Design System do CRM Performance21

Esta sprint foca na simplificação visual e padronização da infraestrutura de design, reduzindo a poluição visual e criando uma base consistente para o Sistema Operacional Comercial (SOC).

## Design System & Tokens

Centralização e padronização dos estilos fundamentais no `tailwind.config.ts` e `src/index.css`.

- **Cores Oficiais:**
  - Azul Principal (Performance): `#152039`
  - Verde Destaque (Growth): `#9ABD33`
  - Fundo Claro (Productivity): `#F1FBFD`
- **Tipografia:** Padronização de pesos e tamanhos baseada na escala `caption` -> `display` já iniciada, com foco em hierarquia sem excesso de negrito.
- **Bordas e Sombras:** Redução de sombras pesadas e bordas agressivas. Uso de raios consistentes (default `lg`: 10px).
- **Espaçamento:** Adoção estrita da escala de 4pt (0.5 a 24).

## Padronização de Componentes UI

Atualização dos componentes base no diretório `src/components/ui/` para refletir o novo design system.

- **Botões:** Estados de hover, active e disabled consistentes. Redução de gradientes.
- **Cards:** Remoção de sombras excessivas, uso de bordas sutis e `bg-card`.
- **Inputs:** Foco em estados de foco e erro claros.
- **Badges:** Simplificação das cores e arredondamento.
- **Tabs:** Design mais limpo com indicadores de estado ativo sutis.

## Estrutura Global (App Shell)

Refatoração do layout principal para maior leveza visual.

- **AppLayout & Header:**
  - Redução de elementos decorativos no cabeçalho.
  - Melhoria no alinhamento de KPIs e busca global.
  - Backdrop blur refinado e bordas mais sutis.
- **Sidebar (AppSidebar):**
  - Hierarquia clara entre grupos de navegação.
  - Destaque suave para a página ativa.
  - Remoção de separadores desnecessários.

## Redução de Poluição Visual

- Remoção de gradientes sem função.
- Aumento do uso de espaços em branco (negative space).
- Padronização de estados vazios (empty states) e carregamento (skeletons).

## Detalhes Técnicos

### Arquivos Alterados
- `tailwind.config.ts`: Configuração de cores da marca e extensões do tema.
- `src/index.css`: Definição de variáveis HSL para temas light/dark.
- `src/components/ui/*.tsx`: (Button, Card, Badge, Input, Tabs, Dialog) — Padronização visual.
- `src/shared/components/AppLayout.tsx`: Estrutura do Shell.
- `src/shared/components/AppSidebar.tsx`: Navegação lateral.

### Validação
- Build final do projeto (`bun run build`).
- Verificação de responsividade (Full HD, Notebook, Mobile).
- Teste de contraste e acessibilidade básica (foco visível).

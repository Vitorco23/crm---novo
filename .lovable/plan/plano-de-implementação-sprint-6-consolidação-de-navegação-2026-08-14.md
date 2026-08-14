# Plano de Implementação - Sprint 6 (Consolidação de Navegação)

Este plano descreve a reorganização do menu principal do CRM Performance21 em quatro áreas coerentes (Operação, Inteligência, Gestão e Configurações), sem alterar rotas ou remover funcionalidades.

## 1. Auditoria e Inventário de Navegação

| Nome Atual | Rota | Grupo Atual | Novo Grupo | Função |
| :--- | :--- | :--- | :--- | :--- |
| Cold Call | `/` | Operação | **Operação** | Prospecção Ativa (Item Principal) |
| Oportunidades | `/oportunidades` | Operação | **Operação** | Pipeline Comercial (Subitem) |
| Onboarding | `/onboarding` | Operação | **Operação** | Pós-venda (Subitem) |
| Agenda | `/agenda` | Operação | **Operação** | Calendário (Item Principal) |
| Lembretes | `/lembretes` | Operação | **Operação** | Follow-ups (Subitem) |
| Pomodoro | `/pomodoro` | Operação | **Operação** | Foco (Contextual/Subitem) |
| Missão do Dia | `/missao` | Decisão | **Operação** | Execução Diária (Item Principal) |
| Central de Decisão | `/central` | Decisão | **Inteligência** | Visão Executiva IA (Item Principal) |
| Central de Inteligência | `/inteligencia/central` | Inteligência | **Inteligência** | Chat com IA (Item Principal) |
| Knowledge Base | `/inteligencia/knowledge` | Inteligência | **Inteligência** | Documentação (Subitem) |
| Inteligência Comercial | `/inteligencia` | Inteligência | **Inteligência** | Diagnósticos (Subitem) |
| Memória Comercial | `/memoria` | Inteligência | **Inteligência** | Aprendizado (Subitem) |
| Laboratório | `/laboratorio` | Inteligência | **Inteligência** | Experimentos (Subitem) |
| Dashboard | `/dashboard` | Inteligência | **Gestão** | Indicadores Executivos (Item Principal) |
| Scrum | `/scrum` | Planejamento | **Gestão** | Plano de ação (Item Principal) |
| Metas | `/metas` | Planejamento | **Gestão** | KPIs (Subitem) |
| Financeiro | `/financeiro` | Planejamento | **Gestão** | Receitas/Despesas (Subitem) |
| Integrações | `/integracoes` | Configurações | **Configurações** | Conexões (Item Principal) |
| Saúde do Sistema | `/saude-sistema` | (Nova Rota) | **Configurações** | Auditoria Técnica (Subitem) |

## 2. Mudanças Técnicas

### 2.1 Atualização de Constantes (`src/shared/constants/navigation.ts`)
- Redefinir `NavGroupId` para: `operacao`, `inteligencia`, `gestao`, `configuracoes`.
- Atualizar `NAV_GROUPS` com os novos rótulos e ordem.
- Reorganizar `NAV_ITEMS` para refletir os novos grupos e adicionar suporte a subitens (se necessário para a UI do Sidebar).

### 2.2 Refatoração do Sidebar (`src/shared/components/AppSidebar.tsx`)
- Implementar suporte a submenus recolhíveis usando `Collapsible` do Radix (já integrado no shadcn/ui sidebar).
- Garantir que o destaque da rota ativa funcione corretamente para itens e subitens.
- Adicionar tooltips para o estado recolhido.

### 2.3 Melhorias de UI/UX
- Garantir que o Dashboard e a Missão do Dia sejam os pontos de partida na Operação.
- Manter ícones consistentes (Lucide).
- Aplicar o design system da Sprint 1 (cores #152039 e #9ABD33).

## 3. Validação
- Build completo (`npm run build`).
- Teste de responsividade (Desktop/Mobile).
- Teste de permissões (`isAdmin`).
- Verificação de rotas (nenhuma rota alterada).

---
*Nota: A página "Cold Call" continuará na rota `/`, servindo como a "visão Hoje" inicial da Operação caso não haja um dashboard operacional separado definido como root.*

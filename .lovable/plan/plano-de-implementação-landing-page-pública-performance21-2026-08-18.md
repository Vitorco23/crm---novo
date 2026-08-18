# Plano de Implementação - Landing Page Pública Performance21

O objetivo é isolar a rota pública `/lp01` da área privada do CRM, garantindo que providers pesados não sejam carregados, e atualizar o visual com base nos assets reais da landing page original.

## 1. Isolamento de Arquitetura

Atualmente, o `App.tsx` envolve todas as rotas com `AuthProvider` e `PomodoroProvider`. Vou refatorar para que a rota pública tenha sua própria árvore de renderização.

- Criar `src/modules/public/components/PublicRouteWrapper.tsx` para prover contextos mínimos (QueryClient, Theme).
- Mover a configuração de rotas privadas para um componente `PrivateRouteWrapper.tsx`.
- No `App.tsx`, separar as árvores.

## 2. Reconstrução Visual da /lp01

Vou substituir os componentes atuais da `/lp01` pelos componentes extraídos do código-fonte original (adaptando imports e dependências).

### Componentes a serem atualizados:
- `LPNavbar.tsx`: Usar o `Navbar.tsx` original.
- `LPHero.tsx`: Usar o `Hero.tsx` original (mantendo o formulário simplificado de 3 campos).
- `LPSections.tsx`: Substituir por uma composição de `ProblemaSection`, `CasesSection`, `ServicosSection`, `MethodSection`, `CrmSection`, `SobreSection`, `FaqSection`, `CTASection` e `Footer`.

### Assets a serem integrados:
- Logo (`logo-p21.png.asset.json`)
- Foto Vitor (`vitor.png.asset.json`)
- Iceberg (`iceberg-engenharia-receita.png.asset.json`)
- Dashboard Hero (`dashboard-hero.png.asset.json`)
- Imagens de cases (Academia, Solar, etc.)

## 3. Melhorias de Performance
- Aplicar `loading="lazy"` em todas as imagens abaixo da dobra.
- Garantir que as queries de leads e sincronização do CRM não sejam disparadas na rota pública.

## 4. Validação
- Acessar `/lp01` em aba anônima.
- Verificar logs do console para garantir que providers privados não inicializaram.
- Confirmar que o CRM privado continua operando normalmente.

Technical details:
- Uso de `React.lazy` para os componentes da LP.
- Reaproveitamento da Edge Function `receive-landing-lead`.
- Manutenção da lógica de escassez em `availability.ts`.

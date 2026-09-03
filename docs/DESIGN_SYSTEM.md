# SOC Performance21 — Design System

> **Aviso (2026-09-01):** este documento descreve o sistema de cores azul/verde
> (seções 1-13), que está sendo **substituído** pelo P21 Intelligence OS
> ("mission-os") como padrão visual do CRM. Toda tela **nova** ou em
> reformulação de UX deve usar os tokens `mission-*` (seção 14), não os
> tokens desta seção. Telas ainda não migradas continuam funcionando nos
> tokens antigos até serem migradas — as duas paletas coexistem durante a
> transição. Ver seção 14 para o guia completo.

Fundação visual única do CRM. Todo componente novo deve consumir **exclusivamente** os tokens abaixo.
Nenhum estilo hard-coded (`#xxxxxx`, `text-white`, `bg-black`, `shadow-[...]`, valores arbitrários) é permitido.

Fonte da verdade:
- **CSS variables**: `src/index.css` (`:root` e `.dark`)
- **Tailwind tokens**: `tailwind.config.ts`

---

## 1. Cores (semânticas)

| Token | Uso | Estados |
|---|---|---|
| `background` / `foreground` | canvas da aplicação | — |
| `card` / `popover` | superfícies elevadas curtas | — |
| `surface-1/2/3` | níveis de elevação para painéis | — |
| `primary` | ações principais, marca | `hover`, `active` |
| `secondary` | ações secundárias | `hover` |
| `accent` | destaque (verde da marca) | `hover`, `active` |
| `muted` / `muted-foreground` | fundo neutro / texto auxiliar | — |
| `success` | feedback positivo | — |
| `warning` | feedback de atenção | — |
| `destructive` | ações destrutivas / erro | `hover` |
| `info` | comunicação informativa | — |
| `border` / `input` / `ring` | contornos, campos, foco | — |
| `sidebar-*` | tema dedicado da sidebar | — |

Uso em Tailwind: `bg-primary text-primary-foreground hover:bg-primary-hover`.

## 2. Tipografia

Fonte: **Inter**. Escala (usar diretamente as classes):

`text-display` · `text-h1` · `text-h2` · `text-h3` · `text-h4` · `text-subtitle` · `text-body` · `text-small` · `text-label` · `text-caption`.

Pesos permitidos: `font-normal (400)`, `font-medium (500)`, `font-semibold (600)`, `font-bold (700)`, `font-extrabold (800)`.

## 3. Espaçamentos (escala 4pt)

Usar exclusivamente: `0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24`.
Nunca `p-[13px]`, `mt-[7px]`, etc.

## 4. Border Radius

`rounded-xs` (4) · `rounded-sm` (6) · `rounded-md` (8) · `rounded-lg` (10, default) · `rounded-xl` (14) · `rounded-2xl` (20) · `rounded-full`.

## 5. Sombras / Elevação

`shadow-sm` · `shadow-md` · `shadow-lg` · `shadow-xl` · `shadow-focus` (anel de foco).
Elevação de superfície → `surface-1/2/3` (utilitários) combinadas com `shadow-*`.

## 6. Grid & Container

Container centralizado com padding responsivo. Breakpoints:
`sm 640` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1536`.

## 7. Motion

Durações: `duration-fast` (120ms) · `duration` (200ms) · `duration-slow` (320ms).
Easings: `ease-standard` (padrão) · `ease-emphasized` (entradas destacadas).
Helper CSS: `.transition-standard`.
Animações prontas: `animate-fade-in`, `animate-slide-in`, `animate-accordion-*`, `animate-pulse-green`.

Regras: microinterações **discretas**; nunca sobrepor performance à estética.

## 8. Z-index

`z-dropdown 40` · `z-sticky 50` · `z-overlay 60` · `z-modal 70` · `z-popover 80` · `z-toast 90` · `z-tooltip 100`.

## 9. Estados obrigatórios em componentes base

Todo componente reutilizável (Button, Input, Select, Card, Badge, Tab, etc.) deve suportar:
`default`, `hover`, `active`, `focus-visible` (anel `shadow-focus`), `disabled` (opacity 50 + cursor-not-allowed), `loading`, `error`, `success`, `warning`, `selected`.

Componentes base vivem em `src/components/ui/*` (shadcn) e devem consumir apenas os tokens acima.

## 10. Ícones

- Biblioteca única: **lucide-react**.
- Tamanhos padrão: `h-3.5 w-3.5` (inline), `h-4 w-4` (padrão), `h-5 w-5` (destaque).
- Nunca misturar com outras bibliotecas de ícones.
- Alinhamento em botões: `gap-2` entre ícone e label.

## 11. Acessibilidade

- Contraste mínimo AA para texto sobre superfícies.
- `:focus-visible` global já aplica `shadow-focus`; não removê-lo.
- Todo controle interativo precisa ser navegável por teclado.
- Estados (`disabled`, `selected`, `error`) devem ter indicador visual + `aria-*` correspondente.

## 12. Responsividade

Componentes base **nascem** responsivos. Não criar versões mobile-only. Usar breakpoints Tailwind (`sm:`, `md:`, `lg:`, `xl:`) sobre a mesma composição.

---

## Regras de manutenção

1. Novos valores visuais → **adicionar token**, nunca hard-code.
2. Estilos duplicados → extrair para variante em `src/components/ui/*`.
3. Alterou token → verificar dark mode.
4. Nunca sobrescrever `src/integrations/supabase/*`, `src/pages/*`, nem regras de negócio nesta camada.

---

## 13. Identidade Performance21 & Temas

Paleta oficial derivada do logotipo (azul + verde):

- **Azul Performance** (`brand-blue`, `brand-blue-strong`, `brand-blue-soft`) → inteligência, tecnologia, segurança. Usado como `primary` no light e como destaque interativo no dark.
- **Verde Performance** (`brand-green`, `brand-green-strong`, `brand-green-soft`) → crescimento, receita, conversão. Base do `accent`, `success` e indicadores positivos.
- **Neutros frios** (`text-*`, `border`, `border-strong`, `surface-1/2/3`) → tipografia, containers, divisores. Nunca preto absoluto.

O logotipo é **referência cromática apenas** — não replicar gradientes, formas ou efeitos do símbolo na UI.

### Tokens de tema adicionais

`background` · `card` · `popover` · `surface-1/2/3` · `surface-hover` · `surface-elevated` · `border` · `border-strong` · `primary(+hover/active)` · `secondary(+hover)` · `accent(+hover/active)` · `success` · `warning` · `danger` (destructive) · `info` · `text-primary/secondary/muted/disabled` · `icon-primary/secondary` · `overlay` · `shadow-sm/md/lg/xl`.

Todos possuem valores para **light** e **dark**. Componentes consomem apenas tokens — nunca hex.

### Light Theme
Fundo claro (`210 40% 99%`), cards em branco puro, bordas discretas, texto navy profundo. Sensação de ferramenta produtiva usada o dia inteiro.

### Dark Theme
Grafite profundo (`218 35% 8%`), nunca preto absoluto. Cards em `surface-1/2/3` com leve elevação. Destaques em azul claro e verde da marca. Inspiração visual: Linear, Vercel, Raycast, Stripe Dashboard.

### Alternância de tema

Infraestrutura pronta:

- **Provider**: `ThemeProvider` em `src/contexts/ThemeContext.tsx` (já montado em `src/App.tsx`, default `dark`).
- **Hook**: `useTheme()` → `{ theme, resolvedTheme, setTheme, toggleTheme }`.
- **Componente**: `<ThemeToggle />` em `src/components/ThemeToggle.tsx` — botão ícone Sun/Moon acessível, pronto para colar em qualquer header.
- **Persistência**: `localStorage` chave `soc-theme`; suporta `light | dark | system`.
- **Aplicação**: alterna classe `.dark` no `<html>` — todos os componentes reagem automaticamente via tokens.

---

## 14. P21 Intelligence OS (mission-os) — design system vigente

Nasceu como experimento isolado da tela Comando/Missão do Dia (Sprint 1.2) e virou o
padrão visual do CRM em 2026-09-01. Fundo com gradiente radial sutil (profundidade por
camada, não por borda), acento verde-oliva em vez do azul/verde da seção 1.

### Tokens

| Token | Uso |
|---|---|
| `--mission-bg` / `--mission-bg-elevated` | canvas da tela (gradiente radial via `.mission-os`) |
| `--mission-surface` | cards, painéis, inputs |
| `--mission-surface-2` | superfície secundária (dentro de um card, ex: linha de tabela hover) |
| `--mission-border` | contornos, divisores |
| `--mission-text` | texto principal |
| `--mission-text-muted` | texto secundário |
| `--mission-text-faint` | texto terciário/legendas (uppercase tracking, labels pequenos) |
| `--mission-accent` / `--mission-accent-strong` | ações, destaque, ícones ativos |
| `--mission-accent-soft` | fundo de badge/highlight sutil |
| `--mission-blue-glow` | glow decorativo secundário (usar com moderação — ver comentário sobre "Intelligence Core" descartado em `tailwind.config.ts`) |

Todos têm valores light e dark (`:root` e `.dark` em `src/index.css`) — nunca hardcode.

### Classes utilitárias prontas

- `.mission-os` — aplicar no container raiz da tela/seção migrada (define fundo + cor de texto base).
- `.mission-card` — substitui `bg-card border border-border rounded-lg`.
- `.mission-input` — substitui `bg-background border border-input` em inputs/selects/textareas; já inclui hover, focus (anel na cor do accent, não o `--ring` azul) e disabled.
- Dentro de `.mission-os`, `:focus-visible` já usa o accent verde-oliva automaticamente — não precisa de classe extra.

Para o resto (texto, espaçamento, ícones, motion, z-index, breakpoints), continuam valendo as
seções 2, 3, 6, 7, 8, 10 e 12 acima — só as **cores** (seção 1) e o card/input padrão mudam.

### Guia de migração (tela por tela)

| Token/classe antiga | Equivalente mission-os |
|---|---|
| `bg-background` / `text-foreground` no container raiz | classe `.mission-os` no wrapper da tela |
| `bg-card` `border-border` `rounded-lg` | `.mission-card` |
| `bg-background border-input` (Input/Select/Textarea) | `.mission-input` |
| `text-muted-foreground` | `text-[hsl(var(--mission-text-muted))]` |
| `text-muted-foreground` (legendas/uppercase pequeno) | `text-[hsl(var(--mission-text-faint))]` |
| `border-border` (divisor solto, fora de card) | `border-[hsl(var(--mission-border))]` |
| `bg-accent` / `text-accent` / `bg-primary` | `bg-[hsl(var(--mission-accent))]` / `text-[hsl(var(--mission-accent))]` |
| `ring`/`focus:ring` manual em componente customizado | remover — `:focus-visible` dentro de `.mission-os` já cobre |

Regra de ouro da migração: uma tela migrada troca **todos** os tokens de cor de uma vez
(nunca deixar mission-os e tokens antigos misturados na mesma tela) — evita uma
Frankenstein visual pior do que não ter migrado. Tipografia/espaçamento/ícones (seções 2,
3, 10) não mudam nessa migração.

### Componentes compartilhados e portais (Pipeline)

O Pipeline usa `MissionThemeProvider value={true}` e a classe `mission-theme`
no container da tela. Essa classe adapta os tokens semânticos dos controles
compartilhados (`card`, `popover`, `primary`, `muted`, `ring`, etc.) aos tokens
`mission-*`, sem mudar a aparência desses controles em telas não migradas.
`mission-os` continua responsável pelo gradiente do canvas; `mission-theme`
não acrescenta gradiente a cada menu ou formulário.

Dialog, Sheet, AlertDialog, Popover, Select, DropdownMenu e Tooltip recebem o
escopo pelo contexto React, inclusive quando renderizados em portais fora do
container. O provider deve envolver também os diálogos irmãos do quadro, como
o cadastro de Nova Oportunidade. Não adicionar `mission-theme` ao `body`.

`--mission-on-accent` define o texto sobre botões preenchidos: branco no tema
claro e fundo escuro no tema escuro. Cores de status (erro, sucesso, alerta) e
cores específicas de canais mantêm seu significado.

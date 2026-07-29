# SOC Performance21 — Design System

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

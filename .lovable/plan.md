# Plano Sprint 7: Área Única de Inteligência

Consolidação dos recursos de inteligência, IA, decisão e conhecimento em uma experiência unificada e coerente, preservando todas as regras de negócio, prompts e modelos existentes.

## 1. Arquitetura da Área
- Criar `IntelligenceShell.tsx` como layout compartilhado para todas as rotas de inteligência.
- Prover cabeçalho unificado com navegação interna entre as 5 categorias.
- Integrar breadcrumbs e estados consistentes de carregamento/erro.

## 2. Reorganização em Categorias
1. **DECISÃO** (`/central`): Central de Decisão e prioridades.
2. **CONVERSAR** (`/inteligencia/central`): Chat com especialistas e Diretor Comercial IA.
3. **CONHECIMENTO** (`/inteligencia/knowledge`): Knowledge Base e documentação RAG.
4. **MEMÓRIA** (`/memoria`): Memória Comercial (aprendizados históricos).
5. **LABORATÓRIO** (`/laboratorio`): Experimentos e rankings de performance.

## 3. Visão Geral da Inteligência
- Refatorar `/inteligencia` para ser o portal de entrada ("Visão Geral").
- Responder: "O que posso fazer nesta área?", "Qual ferramenta usar?".
- Apresentar atalhos claros sem disparar chamadas de IA automáticas.

## 4. Refatoração de Apresentação
- **Central de Decisão**: Seguir hierarquia de 5 níveis (Decisão -> Evidência -> Ação -> Detalhe -> Técnico).
- **Conversar**: Destacar contexto utilizado e estado de geração.
- **Conhecimento**: Diferenciar conteúdo manual, importado e gerado por IA.
- **Memória**: Integrar na navegação interna sem competir como página isolada.
- **Laboratório**: Organizar por Experimento -> Hipótese -> Status -> Métrica -> Resultado.

## Detalhes Técnicos
- Utilizar `Outlet` do React Router para renderizar sub-rotas dentro do Shell.
- Preservar `sessionStorage` e `localStorage` de cada módulo.
- Garantir acessibilidade (ARIA, navegação por teclado) e responsividade (mobile/tablet).
- **Não** alterar: Edge Functions, prompts, modelos, cálculos ou permissões.
- Validar se o build termina sem erros e se nenhuma rota ficou órfã.

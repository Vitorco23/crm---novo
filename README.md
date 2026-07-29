# CRM - P21

🚀 Master Prompt: CRM Performance21 (Growth & Sales)

Contexto do App: Desenvolva um CRM de Vendas de alta performance para a agência Performance21. O foco é execução lógica, métricas claras e produtividade comercial. O design deve ser moderno, utilizando as cores da marca: Azul (#152039), Verde (#9abd33) e Branco (#f1fbfd).

Estrutura de Dados e Funcionalidades:

1. Gestão de Leads (Pipeline): Crie um sistema de visualização em colunas (Kanban) para os Leads com as seguintes etapas exatas:

Novo Lead

Tentativa 1

Tentativa 2

Mensagem no WhatsApp

Tentativa 3

Reunião Marcada

Reunião Realizada

Documento de Guerra Enviado (Etapa crítica de estratégia)

Proposta Enviada

Ganho

Perdido

2. Módulo de Produtividade (Pomodoro de Call/Outreach): Crie uma aba dedicada para sessões de trabalho focado (Pomodoro).

Timer Ajustável: O usuário deve poder definir o tempo da sessão (Ex: 30, 50 ou 60 min) e o tempo de pausa.

Registro de Saída: Ao finalizar cada Pomodoro, deve abrir um formulário para registrar:

Quantidade de ligações feitas.

Quantidade de disparos de mensagens feitos.

Quantidade de reuniões agendadas naquela sessão específica.

Log de Sessões: Registrar automaticamente o horário de início e fim (Ex: 09:00 às 09:50).

3. Dashboard de Inteligência (Relatórios):

Funil de Conversão: Gráfico de funil mostrando a porcentagem de conversão entre cada etapa. Ex: quantos % passam de "Tentativa 3" para "Reuniao Marcada".

Filtros Temporais: Permitir filtrar todos os dados por Dia, Semana e Mês.

Relatório de Sessões (Golden Hour): Um gráfico ou tabela comparando as sessões de Pomodoro. O sistema deve destacar em qual horário do dia (qual sessão) o vendedor teve maior taxa de conversão (Ex: "Sessão das 15h às 15h50 gerou 3 reuniões, sendo a mais produtiva").

Requisitos Visuais e UI/UX:

Layout limpo e direto ao ponto (sem métricas de vaidade).

Barra lateral de navegação (Leads, Pomodoro, Dashboard).

Cards de leads devem mostrar o nome da empresa e o tempo que está parado na etapa.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://crmp21.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6a5a8ccb-e944-4c00-b77f-e180961ad5a4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

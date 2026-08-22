# Fase 41 - Centro Operacional

## Objetivo

Criar uma area interna para acompanhar a saude operacional do SaaS, reunindo notificacoes, fila de disparo, webhooks de provedores, tentativas de entrega e execucoes automaticas.

## Backend

Foi criada a rota autenticada:

```txt
GET /operations/summary
```

A rota exige:

- login valido;
- empresa vinculada;
- assinatura ativa;
- permissao `operations.view` ou usuario owner.

## Dados consolidados

O endpoint retorna:

- contagem de notificacoes por status;
- contagem de notificacoes por canal;
- fila atual de mensagens;
- falhas com possibilidade de nova tentativa;
- falhas permanentes recentes;
- webhooks recebidos dos provedores;
- webhooks pendentes de processamento;
- ultimas tentativas de entrega;
- ultimas execucoes de automacoes;
- ultima execucao da regua financeira;
- ultima execucao do disparo automatico.

## Banco de dados

Nova migration:

```txt
database/migrations/027_operations_center.sql
```

Permissao adicionada:

```txt
operations.view
```

## Frontend

Nova tela:

```txt
/app/operacoes
```

O menu interno recebeu o modulo:

```txt
Centro operacional
```

A tela exibe:

- metricas de fila;
- webhooks recebidos;
- automacoes com falha;
- falhas permanentes;
- status das notificacoes;
- status dos webhooks;
- automacoes recentes;
- falhas que exigem atencao;
- tentativas de entrega;
- webhooks dos provedores.

## Estados vazios

Seguindo a regra do SDD, a tela inicia sem dados ficticios.

Em modo preview ou em uma empresa sem operacao executada, o usuario ve um estado vazio explicando que o painel sera preenchido por eventos reais.

## Resultado

O ImobiFlow passa a ter uma base inicial de observabilidade operacional, necessaria para operar automacoes financeiras, webhooks, notificacoes e processos sensiveis com mais controle.

## Proxima fase recomendada

Adicionar acoes administrativas controladas:

- reprocessar notificacao com falha;
- reenfileirar evento;
- cancelar item da fila;
- marcar falha como resolvida;
- consultar payload tecnico de webhook;
- registrar auditoria da acao manual.

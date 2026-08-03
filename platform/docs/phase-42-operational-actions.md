# Fase 42 - Acoes Operacionais Auditaveis

## Objetivo

Adicionar acoes administrativas controladas ao Centro Operacional para permitir que a equipe trate falhas de notificacao sem perder historico, rastreabilidade ou isolamento multiempresa.

## Banco de dados

Nova migration:

```txt
database/migrations/028_operations_manual_actions.sql
```

Alteracoes criadas:

- permissao `operations.manage`;
- colunas de resolucao operacional em `notification_events`;
- tabela `operation_audit_logs`;
- indices por empresa, entidade e data;
- RLS habilitado na tabela de auditoria;
- acesso de leitura apenas para a empresa vinculada.

## Backend

Novos endpoints autenticados:

```txt
POST /operations/notifications/:id/requeue
POST /operations/notifications/:id/dispatch
POST /operations/notifications/:id/cancel
POST /operations/notifications/:id/resolve
```

Todas as rotas exigem:

- login valido;
- empresa vinculada;
- assinatura ativa;
- permissao `operations.manage` ou usuario owner.

## Acoes implementadas

### Reenfileirar

Volta uma notificacao para a fila, limpando falha anterior e mantendo o numero de tentativas.

### Reprocessar

Executa uma nova tentativa de envio usando o dispatcher ja existente.

### Cancelar

Cancela notificacoes ainda nao enviadas. Notificacoes enviadas, entregues ou lidas nao podem ser canceladas.

### Resolver falha

Marca uma falha como revisada sem apagar o historico e sem fingir que a entrega foi bem-sucedida.

## Auditoria

Toda acao manual gera registro em:

```txt
operation_audit_logs
```

Campos registrados:

- empresa;
- usuario;
- acao executada;
- entidade;
- status anterior;
- novo status;
- justificativa;
- metadados;
- data/hora.

## Frontend

A tela `/app/operacoes` agora exibe botoes nas falhas ativas:

- Reenfileirar;
- Reprocessar;
- Resolver;
- Cancelar.

Tambem foi adicionada a secao:

```txt
Auditoria operacional
```

com historico das acoes manuais recentes.

## Regras importantes

- Falhas resolvidas deixam de aparecer como falhas ativas.
- Historico tecnico nao e apagado.
- Nenhuma acao manual bypassa empresa, assinatura ou permissao.
- O painel continua sem dados ficticios.

## Resultado

O ImobiFlow passa a ter uma camada inicial de operacao assistida, permitindo tratar problemas reais de entrega, fila e automacao com seguranca e rastreabilidade.

## Proxima fase recomendada

Avancar para o painel financeiro operacional:

- conciliacao de cobrancas;
- inconsistencias de gateway;
- repasses pendentes;
- falhas de transferencia;
- fila de notificacoes financeiras;
- auditoria financeira por cobranca.

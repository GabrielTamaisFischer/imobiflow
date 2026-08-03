# Fase 43 - Painel Financeiro Operacional

## Objetivo

Adicionar uma camada de leitura operacional ao modulo financeiro para que a imobiliaria acompanhe riscos de cobranca, gateway, conciliacao e repasse sem depender de planilhas ou conferencia manual.

## Backend

Novo endpoint:

```txt
GET /finance/operations-summary
```

A rota exige:

- login valido;
- empresa vinculada;
- assinatura ativa;
- permissao `finance.view` ou usuario owner.

## Dados consolidados

O endpoint consolida:

- cobrancas vencidas;
- cobrancas em processamento ou aguardando compensacao;
- inconsistencias de gateway;
- repasses pendentes;
- webhooks financeiros com erro ou pendentes de processamento;
- cobrancas pagas sem repasse associado;
- ultimos webhooks financeiros;
- ultimos logs de auditoria financeira.

## Regras de alerta

Uma cobranca entra em inconsistencias de gateway quando:

- esta com status `failed`;
- esta com status `disputed`;
- usa gateway, mas nao possui `gateway_charge_id`;
- possui metadata de emissao/sincronizacao com status `blocked` ou `failed`.

Uma cobranca entra em pendencia de compensacao quando:

- status `processing`;
- status `waiting_compensation`.

Uma cobranca entra em vencidas quando:

- a data de vencimento passou;
- o status ainda esta aberto, aguardando pagamento, em processamento, vencido, falho ou em disputa.

## Frontend

A tela `/app/financeiro` agora exibe o bloco:

```txt
Painel financeiro operacional
```

Ele mostra:

- quantidade e valor de cobrancas vencidas;
- quantidade e valor aguardando compensacao;
- quantidade e valor com inconsistencias de gateway;
- quantidade e valor de repasses pendentes;
- lista de alertas de gateway e conciliacao;
- lista de cobrancas/repasses pendentes;
- webhooks financeiros recentes;
- auditoria financeira recente.

## Sem dados ficticios

O painel usa apenas dados reais do banco ou dados locais do modo preview. Em empresas sem movimentacao, mostra estado saudavel/vazio.

## Resultado

O ImobiFlow ganha uma visao operacional financeira inicial, aproximando o produto de um ERP imobiliario real: o gestor passa a enxergar onde o dinheiro esta travado, onde o gateway falhou, onde ha compensacao pendente e quais repasses ainda precisam ser tratados.

## Proxima fase recomendada

Adicionar acoes financeiras controladas:

- marcar inconsistencia como revisada;
- reenviar cobranca ao gateway;
- reprocessar webhook financeiro;
- gerar repasse ausente;
- criar tarefa de cobranca;
- registrar auditoria da acao manual.

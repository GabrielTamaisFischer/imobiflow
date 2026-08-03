# Fase 47 - Conciliacao financeira avancada

## Objetivo

Criar a base da conciliacao financeira avancada do ImobiFlow, permitindo que a imobiliaria enxergue divergencias entre cobrancas, pagamentos, comissoes, repasses e eventos recebidos dos gateways financeiros.

Esta fase da continuidade ao modulo financeiro avancado descrito no SDD, especialmente nos pontos de cobranca, PIX, boleto, webhook, comissao, repasse e auditoria.

## Problema que esta fase resolve

Em uma operacao imobiliaria real, o pagamento recebido no gateway nao basta por si so. A imobiliaria precisa saber se todo o ciclo financeiro esta consistente:

```txt
Cobranca gerada
↓
Pagamento confirmado
↓
Comissao calculada
↓
Repasse calculado
↓
Repasse executado
↓
Comprovante registrado
↓
Auditoria preservada
```

Qualquer quebra nesse fluxo pode gerar erro financeiro, atraso ao proprietario, retrabalho, perda de confianca ou divergencia contabil.

## Entidades envolvidas

A conciliacao deve cruzar informacoes entre:

- `financial_charges`
- `financial_entries`
- `financial_payments`
- `commissions`
- `owner_transfers`
- `financial_webhook_events`
- `financial_operation_actions`
- `financial_audit_logs`

Todas as consultas devem respeitar `company_id`.

## Regras de conciliacao

O sistema deve identificar, no minimo, os seguintes cenarios:

### 1. Cobranca paga sem pagamento registrado

Uma cobranca esta marcada como paga ou aguardando repasse, mas nao existe registro correspondente em `financial_payments`.

Acao esperada:

- destacar como divergencia critica;
- permitir reprocessar webhook;
- permitir criar tarefa operacional;
- registrar auditoria.

### 2. Pagamento recebido sem cobranca liquidada

Existe pagamento confirmado, mas a cobranca vinculada continua pendente, processando, vencida ou aguardando compensacao.

Acao esperada:

- sugerir atualizacao da cobranca;
- permitir reconciliacao assistida;
- registrar auditoria.

### 3. Pagamento confirmado sem comissao aprovada

O aluguel foi pago, mas a comissao da imobiliaria continua pendente ou ausente.

Acao esperada:

- recalcular comissao;
- permitir aprovacao administrativa;
- registrar log financeiro.

### 4. Pagamento confirmado sem repasse ao proprietario

A cobranca foi paga, mas nao existe repasse criado ou o repasse permanece travado sem justificativa.

Acao esperada:

- criar alerta operacional;
- permitir criar repasse;
- permitir revisar bloqueios;
- exibir no dashboard financeiro.

### 5. Webhook recebido sem cobranca vinculada

O gateway enviou evento financeiro, mas o sistema nao conseguiu localizar a cobranca interna.

Acao esperada:

- classificar como divergencia de integracao;
- permitir vinculo manual assistido;
- permitir reprocessamento depois da correcao;
- registrar auditoria.

### 6. Valores divergentes

O valor bruto recebido, valor liquido, taxa, comissao ou repasse calculado nao bate com a regra do contrato.

Acao esperada:

- exibir diferenca em centavos;
- classificar gravidade;
- impedir baixa silenciosa;
- exigir revisao administrativa.

## Status de conciliacao

Cada item analisado deve receber um status operacional:

```txt
ok
attention
critical
resolved
ignored
```

Descricao:

- `ok`: ciclo financeiro consistente.
- `attention`: existe ponto a revisar, mas nao bloqueia operacao imediatamente.
- `critical`: existe risco financeiro real, como valor divergente ou pagamento sem baixa.
- `resolved`: divergencia ja tratada.
- `ignored`: divergencia aceita por decisao administrativa com auditoria.

## Indicadores do painel

O painel de conciliacao deve apresentar:

- total de cobrancas analisadas;
- cobrancas consistentes;
- divergencias de atencao;
- divergencias criticas;
- pagamentos sem baixa;
- repasses pendentes;
- webhooks sem vinculo;
- valor total em divergencia;
- tempo medio de conciliacao;
- ultima execucao de conciliacao.

## Filtros esperados

A tela deve permitir filtrar por:

- periodo;
- gateway;
- metodo de pagamento;
- status da cobranca;
- status de conciliacao;
- proprietario;
- contrato;
- inquilino;
- tipo de divergencia;
- severidade.

## Acoes operacionais

A partir de uma divergencia, o usuario com permissao adequada deve conseguir:

- reprocessar webhook;
- criar acao operacional;
- criar repasse;
- recalcular comissao;
- marcar como resolvido;
- marcar como ignorado com justificativa;
- abrir trilha de auditoria;
- acessar a cobranca vinculada.

## Segurança e auditoria

Toda acao de conciliacao deve registrar:

- usuario;
- empresa;
- data e hora;
- IP quando disponivel;
- entidade afetada;
- status anterior;
- status novo;
- justificativa;
- origem da acao;
- snapshot dos valores financeiros.

Nenhuma divergencia financeira deve ser apagada definitivamente. Resolucao, cancelamento e ignorar divergencia devem preservar historico.

## Multiempresa

Todas as consultas e operacoes da conciliacao devem ser isoladas por `company_id`.

O sistema nunca deve permitir que um usuario visualize cobrancas, pagamentos, webhooks ou repasses de outra imobiliaria.

## Proposta tecnica

Criar uma rota de resumo operacional:

```txt
GET /finance/reconciliation
```

Resposta esperada:

```txt
summary
items
filters
last_run_at
```

Cada item deve conter:

```txt
id
company_id
type
severity
status
charge_id
payment_id
webhook_event_id
owner_transfer_id
commission_id
title
description
gross_amount_cents
expected_amount_cents
actual_amount_cents
difference_amount_cents
created_at
resolved_at
metadata
```

## Tela sugerida

Adicionar uma aba ou secao em Financeiro:

```txt
Conciliação
```

Com:

- cards de indicadores;
- tabela de divergencias;
- filtros;
- acoes rapidas;
- empty state quando nao houver divergencias;
- mensagem clara para cobrancas ainda em compensacao bancaria.

## Empty state

Quando nao houver divergencias:

```txt
Nenhuma divergência financeira encontrada.

As cobranças, pagamentos, comissões e repasses analisados estão consistentes para o período selecionado.
```

## Proxima etapa de implementacao

Implementar:

- endpoint `GET /finance/reconciliation`;
- modelo de resposta de conciliacao;
- deteccao inicial de divergencias;
- componente visual no financeiro;
- acoes basicas de resolucao;
- documentacao complementar;
- build, commit, push e deploy.

## Macroetapas restantes

Apos esta fase, ainda restam aproximadamente 11 macroetapas para uma versao 100% completa:

1. Conciliacao financeira visual e acoes de resolucao.
2. Integracao real com gateway financeiro.
3. Portais do proprietario e inquilino.
4. Contratos e assinatura digital.
5. Vistoria inteligente completa.
6. Automacoes WhatsApp e reguas operacionais.
7. IA imobiliaria em producao.
8. Mobile/PWA e fluxo offline.
9. Admin SaaS, custos por tenant e billing interno.
10. Auditoria, LGPD, backups e hardening.
11. Beta real com imobiliaria piloto, ajustes e homologacao.

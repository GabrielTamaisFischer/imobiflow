# Fase 29 - Preparacao de emissao de PIX e boleto no gateway

## Objetivo

Esta fase cria a camada operacional entre a cobranca financeira do ImobiFlow e a futura emissao real em gateways como Asaas, PJBank, Iugu, Mercado Pago ou Stripe.

O sistema ainda nao gera QR Code PIX, linha digitavel, codigo de barras ou link de pagamento falso. Esses dados so devem existir quando retornarem de uma API real do provedor.

## Backend

Novo endpoint:

```txt
POST /finance/charges/:id/issue-payment
```

Protecoes:

```txt
login valido
empresa vinculada
assinatura ativa
permissao finance.manage
```

## Regras

O endpoint:

- valida se a cobranca pertence a empresa;
- bloqueia cobranca manual;
- bloqueia cobrancas pagas, canceladas, estornadas ou ja repassadas;
- exige gateway ativo ou em teste;
- vincula a cobranca ao gateway;
- muda o status para `processing`;
- registra auditoria financeira;
- prepara o payload que sera usado pelo conector real do provedor.

## Payload preparado

O sistema registra em `financial_charges.metadata.gateway_issue`:

```txt
provider
gateway_account_id
gateway_account_name
environment
status
prepared_at
request_payload
real_api_call
next_step
```

O campo:

```txt
real_api_call = false
```

deixa explicito que a cobranca foi preparada internamente, mas ainda nao foi emitida em um provedor externo.

## Auditoria

Cada preparacao gera log em:

```txt
financial_audit_logs
```

Evento:

```txt
charge.gateway_issue_prepared
```

## Frontend

Na tela:

```txt
/app/financeiro
```

as cobrancas com PIX, boleto ou hibrido agora exibem a acao:

```txt
Preparar gateway
```

Se nao houver gateway configurado, o sistema orienta a configurar um provedor financeiro antes da emissao.

## Sem dados ficticios

Esta fase nao cria:

- QR Code PIX falso;
- copia e cola PIX falso;
- linha digitavel falsa;
- boleto PDF falso;
- link de pagamento falso.

O sistema apenas prepara o envio tecnico e registra o estado correto.

## Proxima etapa

A proxima fase natural e implementar o primeiro conector real de gateway.

Recomendacao para a operacao piloto:

```txt
Asaas ou PJBank
```

Motivo:

- foco em boleto e PIX;
- API REST;
- webhooks;
- boa aderencia ao financeiro imobiliario brasileiro.

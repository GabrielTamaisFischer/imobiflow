# Fase 34 - Webhook financeiro, baixa automatica e repasse pendente

## Objetivo

Esta fase fortalece a automacao financeira iniciada no SDD:

- receber eventos reais do gateway financeiro;
- identificar a cobranca vinculada;
- registrar o evento de forma idempotente;
- atualizar o status da cobranca sem regredir estados ja liquidados;
- registrar pagamento automaticamente;
- marcar lancamento financeiro como pago;
- aprovar comissao;
- colocar repasse do proprietario em estado pendente/aprovado;
- manter auditoria completa.

## Webhook financeiro

Endpoint:

```txt
POST /webhooks/payments/:provider
```

O endpoint continua protegido por `PAYMENT_GATEWAY_WEBHOOK_SECRET`.

O sistema aceita provedores como:

```txt
asaas
pjbank
iugu
mercado_pago
stripe
other
```

## Idempotencia

Para evitar processamento duplicado, a fase adiciona:

- `payload_hash` em `financial_webhook_events`;
- indice unico por `provider + payload_hash`;
- `gateway_event_id` em `financial_payments`;
- indice unico por `company_id + gateway_event_id`.

Resultado:

```txt
Webhook repetido
↓
Evento reconhecido
↓
Pagamento nao duplica
↓
Auditoria preservada
```

## Normalizacao de status

Eventos financeiros passam a ser normalizados para os status internos:

```txt
waiting_payment
processing
waiting_compensation
paid
overdue
cancelled
refunded
failed
disputed
transfer_pending
transferred
```

## Regra de boleto

Eventos de confirmacao, como `PAYMENT_CONFIRMED`, entram como:

```txt
waiting_compensation
```

Isso evita considerar boleto como totalmente liquidado antes do recebimento definitivo.

Eventos de recebimento, como `PAYMENT_RECEIVED`, entram como:

```txt
paid
```

Quando a cobranca possui proprietario vinculado, o status operacional da cobranca passa para:

```txt
transfer_pending
```

## Baixa automatica

Quando o gateway confirma recebimento definitivo:

```txt
Webhook recebido
↓
Cobranca localizada
↓
financial_charges.paid_at preenchido
↓
financial_entries marcado como paid
↓
financial_payments criado
↓
comissao aprovada
↓
repasse aprovado/pendente
↓
auditoria registrada
```

## Vinculo de cobranca com comissao e repasse

A fase adiciona `charge_id` em:

- `commissions`;
- `owner_transfers`.

Assim, cada cobranca consegue movimentar seus registros financeiros vinculados sem depender de busca textual em observacoes.

## Protecao contra regressao de status

O webhook nao deve rebaixar cobrancas ja liquidadas.

Exemplo:

```txt
Cobranca em transfer_pending
↓
Gateway reenvia PAYMENT_CONFIRMED antigo
↓
Sistema registra evento
↓
Status da cobranca nao volta para waiting_compensation
```

## Resultado

O ImobiFlow passa a ter uma base real de conciliacao automatica:

```txt
cobranca emitida
↓
webhook do gateway
↓
baixa automatica
↓
comissao aprovada
↓
repasse pendente
↓
auditoria financeira
```

## Proxima fase sugerida

Criar a rotina visual e operacional de repasse ao proprietario:

- listar repasses pendentes;
- confirmar repasse;
- registrar comprovante;
- bloquear exclusao de movimentacoes financeiras pagas;
- preparar notificacao ao proprietario.

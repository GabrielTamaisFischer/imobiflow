# Fase 15 - Webhooks Kiwify e confiabilidade de assinatura

## Objetivo

Avancar o controle de assinatura para receber eventos reais de pagamento e manter `subscriptions`, `payments` e `gateway_events` sincronizados.

## O que foi implementado

- Endpoint existente `/webhooks/kiwify` ficou mais tolerante ao formato real de payloads JSON.
- Validacao aceita segredo por header ou query string:
  - `x-imobiflow-webhook-secret`
  - `x-kiwify-webhook-secret`
  - `x-webhook-secret`
  - `Authorization: Bearer <secret>`
  - `?token=<secret>` ou `?secret=<secret>`
- Eventos Kiwify normalizados para status de assinatura:
  - `compra_aprovada` e `subscription_renewed` liberam acesso como `active`.
  - `boleto_gerado`, `pix_gerado` e pendencias ficam como `pending`.
  - `subscription_late`, recusas e falhas ficam como `past_due`.
  - `subscription_canceled`, reembolso e chargeback bloqueiam como `cancelled`.
- Resolucao de empresa por `company_id` no payload ou por e-mail do cliente.
- Resolucao de plano por `plan_slug`, nome do produto/link ou valor do pedido.
- Persistencia de evento antes do processamento, preservando payload bruto.
- Idempotencia por `external_event_id` e por hash do payload.
- Pagamentos ligados ao evento do gateway quando a migration 009 estiver aplicada.
- Fallbacks de compatibilidade para ambientes onde a migration ainda nao foi aplicada.

## Migration

Arquivo: `database/migrations/009_billing_webhook_reliability.sql`

Ela adiciona:

- `external_event_id`, `gateway_order_id`, `gateway_subscription_id`, `payload_hash` e `processing_error` em `gateway_events`.
- `gateway_event_id` em `payments`.
- Indices unicos para evitar duplicidade de eventos e pagamentos.

## Como configurar na Kiwify

URL recomendada:

`https://<api-do-imobiflow>/webhooks/kiwify?token=<KIWIFY_WEBHOOK_SECRET>`

Eventos recomendados:

- `compra_aprovada`
- `compra_recusada`
- `compra_reembolsada`
- `chargeback`
- `boleto_gerado`
- `pix_gerado`
- `subscription_renewed`
- `subscription_late`
- `subscription_canceled`

## Regra de negocio preservada

O acesso interno continua dependendo de:

- login valido;
- empresa vinculada;
- assinatura ativa;
- permissao do usuario.

Status de pagamento irregular continua bloqueando o app interno.

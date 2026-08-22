# Fase 76 - Asaas webhook financeiro

## Objetivo

Fechar a validacao do webhook financeiro do Asaas para que a confirmacao automatica de pagamento possa ser usada no modulo financeiro sem depender de baixa manual.

## O que foi ajustado

- `ASAAS_WEBHOOK_SECRET` passou a ser resolvido como segredo especifico do provedor `asaas`.
- O endpoint `POST /webhooks/payments/:provider` agora aceita os headers oficiais de webhook do Asaas:
  - `asaas-access-token`
  - `asaas_access_token`
- O normalizador financeiro foi coberto por teste com payload Asaas `PAYMENT_RECEIVED`.
- O webhook continua sem marcar pagamento como pago quando a validacao do segredo falha.

## Fluxo esperado

```txt
Asaas envia PAYMENT_RECEIVED
↓
Backend valida asaas-access-token contra ASAAS_WEBHOOK_SECRET
↓
Backend identifica financial_charges por payment.externalReference
↓
Backend registra financial_webhook_events
↓
Backend atualiza financial_charges
↓
Backend registra financial_payments
↓
Backend aprova comissao e repasse quando aplicavel
↓
Backend grava financial_audit_logs
```

## Regras mantidas

- O frontend nao confirma pagamento.
- Pagamento real depende de webhook valido ou excecao administrativa auditada.
- Se a cobranca tiver proprietario vinculado, pagamento recebido vira `transfer_pending`.
- Eventos duplicados sao tratados por `payload_hash`.
- Falhas de identificacao ficam registradas para conciliacao.

## Pendencias para uso real

- Configurar `ASAAS_API_KEY` e `ASAAS_WEBHOOK_SECRET` no ambiente de producao.
- Configurar o webhook no painel Asaas apontando para:

```txt
https://<backend>/webhooks/payments/asaas
```

- Ativar `enable_real_api=true` somente na conta de gateway validada.
- Testar primeiro em sandbox antes de producao.

# Fase 31 - Adaptador Asaas para cobrancas financeiras

## Objetivo

Esta fase evolui a base de gateways financeiros para preparar o primeiro adaptador real de emissao de cobrancas pelo Asaas, mantendo a regra central do SDD:

```txt
Nao gerar PIX, boleto, QR Code, link ou comprovante ficticio.
```

## O que foi implementado

- Adapter HTTP inicial para Asaas em `backend/src/services/payment-gateways.ts`.
- Conversao do metodo interno para `billingType` do Asaas:
  - `pix` -> `PIX`
  - `boleto` -> `BOLETO`
  - `credit_card` -> `CREDIT_CARD`
  - `hybrid` -> `UNDEFINED`
- Payload real para `POST /v3/payments`, usando:
  - `customer`
  - `billingType`
  - `value`
  - `dueDate`
  - `description`
  - `externalReference`
- Persistencia do retorno do provedor quando a emissao for real:
  - `gateway_charge_id`
  - `payment_url`
  - `boleto_pdf_url`
  - linha digitavel/codigo de boleto quando retornado
- Resposta tecnica da emissao para a interface:
  - `prepared`
  - `blocked`
  - `issued`
  - `failed`
- Auditoria com status do conector, HTTP status e erro do provedor quando houver.
- Interface financeira passa a exibir links reais de cobranca e boleto quando retornados pelo gateway.

## Seguranca operacional

A chamada real ao Asaas so acontece quando todas as condicoes abaixo forem verdadeiras:

1. Gateway da imobiliaria esta ativo ou em teste.
2. `provider = asaas`.
3. `credentials_ref` aponta para uma variavel de ambiente existente.
4. Existe `customer_id` real do Asaas associado ao inquilino ou configuracao.
5. `settings.enable_real_api = true`.

Sem isso, o sistema nao chama o provedor e registra o motivo:

- `credentials_missing`
- `missing_customer_reference`
- `real_call_disabled`
- `adapter_not_enabled`
- `provider_error`

## Configuracao esperada do gateway

Exemplo de `payment_gateway_accounts`:

```json
{
  "provider": "asaas",
  "name": "Asaas Sandbox",
  "status": "testing",
  "credentials_ref": "ASAAS_API_KEY",
  "settings": {
    "environment": "sandbox",
    "enable_real_api": false
  }
}
```

Para emissao real, depois de validar credenciais e webhook:

```json
{
  "settings": {
    "environment": "sandbox",
    "enable_real_api": true
  }
}
```

## Customer ID do inquilino

O Asaas exige um `customer` real para criar cobrancas. Nesta fase o sistema aceita:

- `settings.asaas_customer_id`
- `settings.default_customer_id`
- `charge.metadata.gateway_customer_id`
- `charge.metadata.tenant.gateway_customer_id`
- `charge.metadata.tenant.asaas_customer_id`

Na fase seguinte, o ideal e criar o cadastro/sincronizacao de clientes do gateway por inquilino, evitando `default_customer_id`.

## Referencia tecnica

A implementacao segue o modelo oficial do Asaas para criar cobrancas:

- `POST https://api-sandbox.asaas.com/v3/payments`
- Header `access_token`
- Campos `customer`, `billingType`, `value`, `dueDate` e `externalReference`

Fonte principal: documentacao oficial Asaas, Create new payment / Criar nova cobranca.

## Proxima fase sugerida

Criar sincronizacao de clientes do gateway:

```txt
Inquilino do contrato
↓
Valida nome, CPF/CNPJ, email e telefone
↓
Cria ou localiza customer no Asaas
↓
Salva gateway_customer_id no ImobiFlow
↓
Permite emissao de PIX/boleto por contrato real
```

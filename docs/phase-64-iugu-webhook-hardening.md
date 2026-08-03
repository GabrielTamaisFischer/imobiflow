# Fase 64 - Iugu e Webhooks Financeiros

## Objetivo

Fortalecer a base de emissao e conciliacao de cobrancas via gateway, com foco no primeiro provedor escolhido para PIX/boleto: Iugu.

## Implementado

- Webhook financeiro agora aceita segredo especifico por provedor:
  - `IUGU_WEBHOOK_SECRET` para `/webhooks/payments/iugu`;
  - `PJBANK_WEBHOOK_SECRET` para futuro `/webhooks/payments/pjbank`;
  - `PAYMENT_GATEWAY_WEBHOOK_SECRET` como fallback geral.
- Parser de webhook financeiro passou a reconhecer payloads com `invoice` e `data`, formatos comuns em gateways de fatura.
- Parser de webhook passou a ler `custom_variables` no formato `{ name, value }`, permitindo localizar `imobiflow_charge_id` retornado pela Iugu.
- Emissao Iugu passou a enviar mais referencias internas na invoice:
  - `imobiflow_charge_id`;
  - `imobiflow_company_id`;
  - `imobiflow_contract_id`;
  - `imobiflow_property_id`, quando existir;
  - `imobiflow_owner_id`, quando existir;
  - `imobiflow_tenant_party_id`, quando existir;
  - `imobiflow_rental_id`, quando a cobranca veio de locacao.
- Payload da fatura Iugu usa `payable_with` como lista de metodos (`pix`, `bank_slip`, `credit_card` ou `all`), alinhado ao contrato da API de invoices.
- Payload da fatura envia objeto `payer` quando houver dados reais do inquilino, necessario para boleto e PIX.
- Resposta da Iugu agora e normalizada com mais formatos possiveis de boleto e PIX:
  - URL segura da fatura;
  - PDF/link de boleto;
  - codigo de barras;
  - linha digitavel;
  - QR Code PIX;
  - PIX copia e cola.

## Regras preservadas

- A cobranca interna nao vira paga no momento da emissao.
- Pagamento confirmado continua dependendo de webhook validado ou acao administrativa auditada.
- O frontend nao decide status financeiro.
- A conciliacao segue vinculada a `company_id` e aos IDs internos enviados no gateway.

## Pendencias

- Validar payload real da Iugu em sandbox com credenciais de producao/sandbox configuradas fora do repositorio.
- Aplicar migrations no Supabase real antes do teste completo.
- Configurar `IUGU_API_KEY`, `IUGU_WEBHOOK_SECRET` e conta ativa em `payment_gateway_accounts`.
- Criar teste automatizado especifico para webhook Iugu valido e invalido.

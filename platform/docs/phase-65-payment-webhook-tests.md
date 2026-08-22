# Fase 65 - Testes do Webhook Financeiro

## Objetivo

Adicionar cobertura automatizada para a parte mais sensivel do financeiro: identificar a cobranca interna quando o gateway envia eventos de pagamento.

## Implementado

- Criado servico puro `payment-webhook-normalizer` para normalizar payloads financeiros sem depender de Supabase, Express ou variaveis reais.
- A rota `/webhooks/payments/:provider` agora usa o mesmo normalizador coberto por teste.
- Adicionados testes para:
  - prioridade de segredo especifico da Iugu;
  - fallback para segredo financeiro geral;
  - identificacao de `imobiflow_charge_id` dentro de `custom_variables`;
  - status Iugu pago via PIX marcado como `paid`;
  - boleto criado/pendente mantido como `waiting_payment`, sem liquidacao indevida;
  - normalizacao de valor monetario em centavos.

## Regras preservadas

- Webhook invalido continua recusado antes de consultar ou alterar dados.
- Boleto pendente nao vira pago.
- O parser aceita payloads reais de invoice com `data`, `invoice` e `custom_variables`.
- O frontend continua sem poder confirmar pagamento.

## Pendencias

- Criar teste integrado com mock de Supabase para garantir atualizacao completa de `financial_charges`, `financial_payments`, `commissions` e `owner_transfers`.
- Rodar teste real em sandbox Iugu apos configurar credenciais fora do repositorio.

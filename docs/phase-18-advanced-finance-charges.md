# Fase 18 - Financeiro avancado: cobrancas, comissao e repasse

## Objetivo

Avancar o modulo financeiro de lancamentos manuais para uma base de cobranca imobiliaria real, preparando o ImobiFlow para PIX, boleto, webhooks financeiros, comissao da imobiliaria, taxa operacional e repasse ao proprietario.

## Implementado

- Documento SDD complementar em `docs/sdd-financeiro-avancado.md`.
- Migration `012_advanced_finance_charges.sql` com:
  - regras financeiras por contrato;
  - `payment_gateway_accounts`;
  - `financial_charges`;
  - `financial_webhook_events`;
  - `financial_audit_logs`.
- API protegida:
  - `GET /finance/charges`;
  - `POST /finance/charges/from-contract`;
  - `POST /finance/charges/:id/confirm-payment`.
- Webhook financeiro preparado:
  - `POST /webhooks/payments/:provider`;
  - validacao por `PAYMENT_GATEWAY_WEBHOOK_SECRET`;
  - idempotencia por `provider + gateway_event_id`;
  - atualizacao automatica de cobranca e lancamento quando o pagamento for confirmado.
- Tela `/app/financeiro` agora permite:
  - gerar cobranca por contrato de locacao;
  - selecionar PIX, boleto, hibrido ou manual;
  - configurar taxa operacional;
  - definir se a taxa e paga pelo inquilino ou pela imobiliaria/proprietario;
  - calcular comissao percentual ou fixa;
  - visualizar valor cobrado, comissao, taxa e repasse liquido;
  - confirmar pagamento manual como excecao auditada.

## Regras de negocio

- Usuario logado ainda nao basta: todas as rotas exigem empresa, assinatura ativa e permissao financeira.
- A cobranca nasce vinculada a contrato, imovel, proprietario e inquilino quando esses dados existem.
- A confirmacao automatica deve vir por webhook do gateway.
- A confirmacao manual existe apenas como excecao operacional e gera auditoria.
- Cobranças pagas nao devem ser apagadas; o historico deve ser preservado.

## Proximos passos

1. Configurar um provedor real, como Asaas, PJBank, Iugu ou Mercado Pago.
2. Criar adaptadores por provedor para emitir boleto e PIX reais.
3. Criar portal do inquilino para pagar cobrancas.
4. Criar portal do proprietario para acompanhar repasses.
5. Implementar regua de inadimplencia e notificacoes automaticas.

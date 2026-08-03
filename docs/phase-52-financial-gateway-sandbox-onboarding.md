# Fase 52 - Homologacao sandbox do primeiro gateway financeiro

## Objetivo

Preparar o ImobiFlow para homologar o primeiro provedor financeiro real em ambiente sandbox antes de permitir operacao em producao.

Esta fase cria um checklist auditavel para garantir que PIX, boleto, webhook, cancelamento, conciliacao e logs estejam funcionando antes de movimentar dinheiro real.

## Por que esta fase existe

Gateways financeiros nao podem ser ativados diretamente em producao sem validacao.

Em uma operacao imobiliaria, uma falha pode causar:

- cobranca duplicada;
- pagamento nao baixado;
- boleto compensado sem repasse;
- PIX recebido sem comissao calculada;
- webhook invalido aceito como pagamento;
- repasse incorreto ao proprietario;
- divergencia contabil;
- perda de confianca da imobiliaria.

Por isso, o ImobiFlow precisa de uma homologacao formal antes de liberar producao.

## Migration criada

```txt
database/migrations/034_financial_gateway_onboarding.sql
```

Ela adiciona duas tabelas.

## 1. Checklist de homologacao

Tabela:

```txt
financial_gateway_onboarding_checks
```

Cada item representa uma etapa que precisa ser validada para uma conexao de gateway.

Campos principais:

```txt
company_id
gateway_connection_id
provider
check_type
status
required_for_production
started_at
completed_at
failed_at
completed_by
evidence_url
external_reference
result_message
error_message
metadata
```

## Checks previstos

```txt
credentials_configured
healthcheck_passed
webhook_endpoint_configured
webhook_signature_validated
pix_charge_created
pix_payment_webhook_received
boleto_charge_created
boleto_settlement_flow_validated
charge_cancellation_validated
financial_reconciliation_validated
audit_log_validated
production_approval
```

## Status dos checks

```txt
pending
running
passed
failed
skipped
cancelled
```

## 2. Revisao de ativacao

Tabela:

```txt
financial_gateway_activation_reviews
```

Ela registra pedidos para ativar um gateway em sandbox ou producao.

Campos principais:

```txt
company_id
gateway_connection_id
provider
requested_environment
status
requested_by
reviewed_by
requested_at
reviewed_at
approved_at
rejected_at
review_notes
missing_checks
risk_level
metadata
```

## Status da revisao

```txt
pending
approved
rejected
cancelled
```

## Niveis de risco

```txt
low
medium
high
critical
```

## Fluxo de homologacao

```txt
Criar conexao do gateway em sandbox
↓
Configurar credenciais seguras
↓
Gerar endpoint de webhook
↓
Executar healthcheck
↓
Criar cobranca PIX de teste
↓
Receber webhook PIX
↓
Criar boleto de teste
↓
Validar fluxo de compensacao
↓
Validar cancelamento
↓
Rodar conciliacao financeira
↓
Verificar auditoria
↓
Solicitar revisao de ativacao
↓
Aprovar producao
```

## Regras para liberar producao

Um gateway so deve ser ativado em producao quando:

- credenciais estiverem configuradas;
- healthcheck tiver passado;
- endpoint de webhook estiver criado;
- assinatura de webhook tiver sido validada;
- cobranca PIX de teste tiver sido criada;
- webhook PIX tiver sido recebido;
- boleto de teste tiver sido criado;
- fluxo de compensacao do boleto tiver sido validado;
- cancelamento de cobranca tiver sido validado;
- conciliacao financeira tiver sido validada;
- auditoria tiver sido validada;
- revisao de producao tiver sido aprovada.

## Experiencia esperada no painel

Na tela:

```txt
Financeiro > Gateways
```

Adicionar uma secao:

```txt
Homologacao
```

Com:

- lista de checks;
- status visual de cada etapa;
- botao executar check;
- botao anexar evidencia;
- botao solicitar ativacao;
- alerta de checks obrigatorios pendentes;
- historico de aprovacoes e recusas.

## Empty state

Quando nao houver homologacao iniciada:

```txt
Nenhuma homologação iniciada.

Inicie a validação em sandbox antes de liberar cobranças reais para esta imobiliária.
```

## Primeiro provedor real recomendado

Para a operacao piloto, a recomendacao e escolher o provedor com melhor combinacao de:

- PIX com webhook confiavel;
- boleto com compensacao clara;
- API REST bem documentada;
- ambiente sandbox funcional;
- custo operacional previsivel;
- suporte a repasse ou split futuro;
- documentacao de assinatura de webhook;
- boa experiencia para segunda via.

O SDD deve permitir Asaas, PJBank, Iugu, Mercado Pago ou Stripe, mas a primeira integracao deve ser escolhida com base na operacao real da imobiliaria piloto.

## Regras multiempresa

Cada checklist pertence a uma unica `company_id`.

O sistema deve impedir que:

- uma empresa veja homologacao de outra;
- uma revisao aprove gateway de outra imobiliaria;
- um webhook de uma empresa valide check de outra;
- uma conexao em sandbox seja confundida com producao.

## Auditoria

Cada check deve preservar:

- usuario responsavel;
- horario;
- status anterior;
- resultado;
- evidencia;
- referencia externa;
- mensagem de erro;
- metadados do gateway.

## Proxima etapa

Quando o shell voltar, implementar:

```txt
GET /finance/gateways/:id/onboarding
POST /finance/gateways/:id/onboarding/checks/:checkType/run
POST /finance/gateways/:id/onboarding/checks/:checkType/complete
POST /finance/gateways/:id/activation-reviews
POST /finance/gateways/:id/activation-reviews/:reviewId/approve
POST /finance/gateways/:id/activation-reviews/:reviewId/reject
```

E adicionar a secao visual de homologacao na tela de gateways.

## Macroetapas restantes

Apos esta fase, restam aproximadamente 6 macroetapas para a versao 100% completa:

1. Implementar tela/endpoints de gateways e homologacao.
2. Integrar primeiro provedor financeiro real em sandbox.
3. Portais do proprietario e inquilino.
4. Contratos, assinatura digital e vistoria inteligente completa.
5. Automacoes WhatsApp, IA imobiliaria, mobile/PWA e offline.
6. Hardening, LGPD, custos por tenant, beta piloto e homologacao final.

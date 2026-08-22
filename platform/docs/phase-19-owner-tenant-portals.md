# Fase 19 - Portais do proprietario e inquilino

## Objetivo

Iniciar os portais externos do ImobiFlow para que proprietarios e inquilinos acompanhem informacoes financeiras e contratuais sem acessar a area administrativa da imobiliaria.

## Implementado

- Migration `013_owner_tenant_portals.sql`:
  - `portal_token`, `portal_enabled` e `portal_last_access_at` em `property_owners`;
  - `portal_token`, `portal_enabled` e `portal_last_access_at` em `contract_parties`;
  - `portal_access_logs` com RLS por `company_id`.
- Backend publico:
  - `GET /public/portals/owners/:token`;
  - `GET /public/portals/tenants/:token`.
- Frontend publico:
  - `/portal/proprietario/$token`;
  - `/portal/inquilino/$token`.
- Estados vazios:
  - proprietario sem imoveis;
  - proprietario sem cobrancas;
  - proprietario sem repasses;
  - inquilino sem cobrancas abertas;
  - inquilino sem historico de pagamentos.

## Regras de acesso

- O portal nao usa login interno.
- O acesso e liberado por `portal_token` especifico do proprietario ou do inquilino.
- O backend usa o token apenas para localizar registros habilitados.
- Dados retornados sempre ficam presos ao `company_id` do registro encontrado.
- Acesso ao portal gera log em `portal_access_logs`.
- O token pode ser desabilitado com `portal_enabled = false`.

## Portal do proprietario

O proprietario visualiza:

- imoveis vinculados;
- cobrancas de locacao;
- comissao descontada;
- taxa operacional;
- valor liquido calculado;
- repasses pendentes e pagos.

## Portal do inquilino

O inquilino visualiza:

- dados principais do contrato;
- imovel locado;
- cobrancas em aberto;
- status do pagamento;
- PIX copia e cola, quando existir;
- link de boleto/PDF, quando existir;
- historico de pagamentos confirmados.

## Proximos passos

1. Gerar botao interno para copiar/enviar link do portal ao proprietario e ao inquilino.
2. Conectar cobrancas reais de gateway com `payment_url`, PIX e boleto PDF.
3. Criar recibos de pagamento em PDF.
4. Adicionar notificacoes automaticas por WhatsApp/e-mail.
5. Criar area de segunda via e solicitacoes do inquilino.

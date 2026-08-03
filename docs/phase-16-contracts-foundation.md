# Fase 16 - Base de contratos imobiliarios

## Objetivo

Iniciar o modulo de contratos do ImobiFlow como parte do fluxo operacional do SDD: imovel, lead, contrato, assinatura e financeiro.

## O que foi implementado

- Migration `010_contracts_foundation.sql` com estrutura multiempresa:
  - `contract_templates`
  - `contracts`
  - `contract_parties`
  - `contract_documents`
- Todas as tabelas criticas usam `company_id` e RLS por empresa.
- API protegida por login, empresa, assinatura ativa e permissoes:
  - `GET /contracts`
  - `POST /contracts`
  - `GET /contracts/:id`
  - `PATCH /contracts/:id`
  - `POST /contracts/:id/parties`
- Validacao para impedir vincular imovel, lead ou modelo de outra empresa.
- Tela `/app/contratos` deixou de ser apenas estado vazio e passou a listar/criar contratos reais.
- Contratos podem ser vinculados a imoveis reais existentes.
- Cadastro inicial de partes do contrato, como inquilino, proprietario, comprador ou vendedor.
- Modo preview preservado para visualizacao sem gravar no banco real.

## Regras de negocio aplicadas

- Usuario logado nao basta para acessar contratos.
- O modulo exige empresa vinculada, assinatura ativa e permissao `contracts.view` ou `contracts.manage`.
- O sistema continua iniciando vazio; nenhum contrato ficticio e inserido.
- Contratos, partes e documentos ficam isolados por `company_id`.

## Proxima etapa recomendada

Avancar para financeiro operacional:

- lancamentos financeiros por contrato;
- parcelas, vencimentos e status de recebimento;
- comissoes;
- repasses a proprietarios;
- base para inadimplencia e fluxo de caixa.

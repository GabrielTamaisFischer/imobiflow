# Fase 17 - Financeiro operacional

## Objetivo

Criar a base financeira do ImobiFlow conectada ao fluxo imobiliario real: contratos, recebiveis, despesas, pagamentos, comissoes e repasses.

## O que foi implementado

- Migration `011_finance_foundation.sql` com tabelas multiempresa:
  - `financial_accounts`
  - `financial_entries`
  - `financial_payments`
  - `commissions`
  - `owner_transfers`
- Todas as tabelas financeiras usam `company_id` e RLS por empresa.
- API protegida por login, empresa, assinatura ativa e permissoes:
  - `GET /finance/summary`
  - `GET /finance/entries`
  - `POST /finance/entries`
  - `POST /finance/entries/:id/payments`
- Resumo financeiro com:
  - recebido;
  - a receber;
  - despesas pagas;
  - a pagar;
  - vencido.
- Tela `/app/financeiro` deixou de ser apenas estado vazio.
- Cadastro de lancamentos reais de receita ou despesa.
- Vinculo opcional com contrato.
- Acao para marcar lancamento como pago.
- Modo preview preservado para visualizacao sem gravar no banco real.

## Regras de negocio aplicadas

- Usuario logado nao basta para acessar financeiro.
- O modulo exige empresa vinculada, assinatura ativa e permissao `finance.view` ou `finance.manage`.
- O sistema continua iniciando vazio, sem dados financeiros ficticios.
- Nenhum contrato, imovel, proprietario ou conta financeira de outra empresa pode ser vinculado.

## Proxima etapa recomendada

Avancar de financeiro manual para financeiro automatizado:

- gerar recebiveis automaticamente a partir de contrato de locacao;
- criar comissoes a partir de venda ou locacao;
- gerar repasses de proprietario;
- marcar inadimplencia automaticamente por vencimento;
- preparar relatorios financeiros e DRE simplificada.

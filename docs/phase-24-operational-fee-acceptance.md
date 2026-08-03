# Fase 24 - Responsabilidade da taxa operacional e aceite contratual

## Objetivo

Adicionar ao financeiro a regra juridica e operacional para taxas de boleto, PIX e emissao.

O sistema passa a diferenciar:

- taxa paga pela imobiliaria;
- taxa paga pelo inquilino;
- taxa paga pelo proprietario.

## Banco de dados

Nova migracao:

- `database/migrations/016_operational_fee_responsibility.sql`

Alteracoes:

- `contracts.operational_fee_payer` agora aceita `company`, `tenant` e `owner`;
- `financial_charges.fee_payer` agora aceita `company`, `tenant` e `owner`;
- `contracts` recebeu campos de aceite de taxa;
- `financial_charges` recebeu campos de aceite de taxa;
- criada tabela `operational_fee_acceptance_logs`.

## Regra implementada

Quando a taxa e paga pela imobiliaria:

- o valor cobrado do inquilino nao aumenta;
- o repasse do proprietario nao e reduzido pela taxa;
- a taxa fica como custo/margem operacional da imobiliaria.

Quando a taxa e paga pelo inquilino:

- o valor cobrado soma aluguel + taxa;
- exige aceite contratual;
- registra auditoria.

Quando a taxa e paga pelo proprietario:

- o inquilino paga apenas o aluguel;
- a taxa reduz o repasse liquido do proprietario;
- exige aceite contratual;
- registra auditoria.

## Backend

Na geracao de cobranca por contrato, o backend agora:

- valida `fee_payer`;
- calcula corretamente aluguel, taxa, comissao e repasse;
- bloqueia repasse de taxa para inquilino/proprietario sem aceite;
- registra `fee_acceptance_json`;
- cria log em `operational_fee_acceptance_logs`;
- inclui o aceite na auditoria financeira.

## Interface

Na tela `/app/financeiro`, o formulario de cobranca agora permite:

- selecionar responsavel pela taxa;
- marcar aceite contratual;
- informar referencia do aceite.

As cobrancas exibem:

- quem paga a taxa;
- se o aceite foi registrado;
- se o aceite esta pendente.

## Proximos passos

- permitir configurar regra de taxa diretamente no contrato;
- criar tela de historico de aceites;
- anexar documento/clausula ao aceite;
- registrar IP real em todas as mutacoes financeiras;
- automatizar validacao de aceite antes da emissao no gateway.

# Fase 63 - Recorrencia de cobrancas de locacao

## Objetivo

Esta fase transforma a locacao em um fluxo financeiro recorrente. A locacao agora pode gerar novas cobrancas mensais de aluguel sem depender de cadastro manual repetitivo.

## Banco de dados

Foi criada a migration:

```txt
045_rental_recurring_charges.sql
```

Ela adiciona:

- `financial_entries.rental_id`;
- `financial_charges.rental_id`;
- indice de lancamentos por locacao;
- indice de cobrancas por locacao e vencimento;
- trava de duplicidade para impedir duas cobrancas ativas da mesma locacao no mesmo vencimento.

## API

Novos endpoints:

```txt
POST /rentals/:id/generate-charge
POST /rentals/generate-due-charges
```

As rotas exigem:

- login valido;
- empresa vinculada;
- assinatura ativa;
- permissao `rentals.manage`.

## Geracao individual

O endpoint `POST /rentals/:id/generate-charge`:

1. valida se a locacao pertence a empresa;
2. valida se a locacao esta ativa;
3. identifica o proximo vencimento;
4. verifica se ja existe cobranca ativa para aquele vencimento;
5. cria `financial_entries`;
6. cria `financial_charges`;
7. calcula comissao;
8. calcula taxa operacional;
9. calcula valor liquido previsto ao proprietario;
10. atualiza `last_charge_due_date`;
11. atualiza `next_charge_due_date`;
12. registra evento `rental.charge_generated`.

## Geracao em lote

O endpoint `POST /rentals/generate-due-charges`:

- busca locacoes ativas com `next_charge_due_date` ate a data informada;
- gera cobrancas para cada locacao elegivel;
- ignora locacoes que ja possuem cobranca ativa no mesmo vencimento;
- devolve listas de geradas e ignoradas.

## Regras financeiras

O valor da cobranca considera:

- aluguel mensal;
- condominio;
- IPTU;
- seguro;
- taxa operacional, quando repassada ao inquilino.

A comissao e calculada sobre o aluguel mensal. O valor liquido do proprietario considera aluguel + adicionais, menos comissao e taxa quando ela fica sob responsabilidade da imobiliaria/proprietario.

## Frontend

A tela `/app/agenda` agora permite:

- gerar a proxima cobranca de uma locacao ativa;
- gerar cobrancas do periodo para locacoes vencendo;
- atualizar a locacao com o novo vencimento;
- impedir que o usuario dependa de dados ficticios.

## Pendencias

- Aplicar migrations no Supabase real.
- Enviar cobrancas geradas para o gateway Iugu.
- Criar job agendado para rodar `generate-due-charges` automaticamente.
- Exibir historico detalhado de cobrancas dentro da pagina individual da locacao.

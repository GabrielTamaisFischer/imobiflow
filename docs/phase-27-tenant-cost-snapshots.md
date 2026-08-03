# Fase 27 - Fechamento mensal de custos por imobiliaria

## Objetivo

Esta fase transforma os eventos brutos de consumo operacional em fechamentos mensais por imobiliaria.

O SDD define que o ImobiFlow precisa controlar margem, consumo de APIs, boletos, PIX, IA, armazenamento, usuarios ativos e outros custos por tenant. Para isso, os eventos individuais continuam sendo registrados em `tenant_usage_events`, mas agora podem ser consolidados em `tenant_cost_snapshots`.

## Backend

Novo endpoint:

```txt
POST /usage-costs/snapshots
```

Protecoes:

```txt
login valido
empresa vinculada
assinatura ativa
permissao costs.manage
```

Entrada opcional:

```json
{
  "month": "2026-05"
}
```

Tambem e possivel informar:

```json
{
  "period_start": "2026-05-01",
  "period_end": "2026-05-31"
}
```

## Dados consolidados

O fechamento soma eventos reais do periodo para:

- armazenamento em MB;
- fotos;
- PDFs;
- IA;
- mensagens WhatsApp;
- cobrancas;
- PIX;
- boletos;
- usuarios ativos;
- requisicoes de API;
- custo estimado;
- receita estimada da assinatura;
- margem estimada.

## Regra de receita

A receita estimada usa o preco do plano vinculado a assinatura mais recente da imobiliaria.

Isso prepara a operacao piloto Enterprise para comparar:

```txt
mensalidade recebida
-
custo operacional real
=
margem estimada
```

## Upsert por competencia

O fechamento utiliza a chave unica:

```txt
company_id + period_start + period_end
```

Se o gestor gerar novamente o fechamento do mesmo periodo, o snapshot e atualizado. Isso permite recalcular a competencia conforme novos eventos reais forem registrados.

## Frontend

A tela:

```txt
/app/custos
```

agora possui:

- botao para gerar fechamento do mes;
- listagem de fechamentos mensais;
- resumo de custo, receita e margem por snapshot;
- historico de cobrancas, PIX, boletos e PDFs consolidados.

## Sem dados ficticios

Nenhum snapshot e criado automaticamente com numeros inventados.

O fechamento usa apenas eventos reais ja gravados no banco da imobiliaria.

## Resultado

O ImobiFlow passa a ter a base de controle financeiro interno do SaaS:

```txt
evento operacional
↓
custo unitario do catalogo
↓
evento de consumo
↓
fechamento mensal
↓
margem por imobiliaria
```

Essa etapa e essencial para validar margem, precificacao, plano Enterprise piloto e escalabilidade operacional.

# Fase 62 - Agenda, visitas e locacao formal

## Objetivo

Esta fase implementa a base operacional de agenda e locacao prevista no SDD:

- compromissos reais com `company_id`;
- visitas vinculadas a lead, imovel e corretor;
- mudanca de status de visita com historico no CRM;
- follow-up automatico apos visita concluida;
- locacao formal com contrato, partes, imovel, proprietario, inquilino e primeira cobranca preparada.

## Banco de dados

Foi criada a migration:

```txt
044_appointments_rentals_foundation.sql
```

Ela adiciona:

- `appointments`;
- `rental_agreements`;
- `rental_events`;
- permissoes `appointments.view`, `appointments.manage`, `rentals.view`, `rentals.manage`;
- indices por empresa, status, imovel, lead e periodo;
- RLS por `company_id`;
- triggers de `updated_at`.

## API

Novos endpoints:

```txt
GET /appointments
POST /appointments
PATCH /appointments/:id/status

GET /rentals
POST /rentals
```

Todas as rotas exigem:

- token valido;
- usuario com empresa;
- assinatura ativa;
- permissao do modulo.

## Agenda

O cadastro de compromisso permite:

- tipo: visita, retorno, reuniao, vistoria, assinatura ou follow-up;
- lead vinculado;
- imovel vinculado;
- responsavel;
- data/hora inicial;
- data/hora final;
- local;
- lembrete;
- observacoes.

Quando o compromisso muda de status, o sistema registra evento em `lead_events` se houver lead vinculado.

Quando uma visita e marcada como realizada, o backend cria automaticamente uma tarefa:

```txt
Follow-up pos-visita
```

## Locacao

Ao criar uma locacao, o backend:

1. valida se o imovel pertence a empresa;
2. valida proprietario e lead, quando informados;
3. cria contrato de locacao ativo;
4. cria parte proprietaria quando houver proprietario;
5. cria parte inquilina;
6. cria registro em `rental_agreements`;
7. muda o status do imovel para `rented`;
8. registra evento em `rental_events`;
9. prepara a primeira cobranca quando solicitado.

A primeira cobranca criada inclui:

- lancamento em `financial_entries`;
- cobranca em `financial_charges`;
- valor bruto;
- taxa operacional;
- responsavel pela taxa;
- comissao;
- valor liquido previsto do proprietario;
- metodo preferido: PIX, boleto, hibrido ou manual.

## Frontend

A tela `/app/agenda` agora possui:

- painel de KPIs operacionais;
- listagem de compromissos;
- listagem de locacoes;
- formulario de agendamento;
- formulario de nova locacao;
- estado vazio sem dados ficticios;
- modo preview isolado em localStorage.

## Pendencias

- Aplicar a migration no Supabase real.
- Evoluir recorrencia mensal automatica das cobrancas de locacao.
- Adicionar tela especifica de detalhes da locacao.
- Integrar emissao real de PIX/boleto pelo adapter Iugu no fluxo financeiro.

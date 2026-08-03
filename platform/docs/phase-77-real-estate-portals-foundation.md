# Fase 77 - Portais imobiliarios

## Objetivo

Preparar o ImobiFlow para publicar imoveis reais em portais e receber leads externos no CRM com origem rastreavel.

Esta fase cobre:

- ZAP Imoveis
- OLX
- Viva Real

## O que foi criado

- Tabela `portal_property_publications` para controlar publicacao por imovel e provedor.
- Tabela `portal_leads` para auditar leads recebidos de portais.
- Endpoint protegido `GET /portal-integrations/publications`.
- Endpoint protegido `POST /portal-integrations/publications`.
- Endpoint publico `GET /portal-integrations/:provider/:companyId/feed.json`.
- Endpoint publico seguro `POST /portal-integrations/:provider/leads`.
- Normalizador de leads externos para entrada no CRM.
- Gerador de feed JSON sem expor endereco completo do imovel.
- Testes automatizados para lead externo e item de feed.

## Fluxo de publicacao

```txt
Usuario seleciona imovel disponivel
↓
Sistema cria publicacao por provedor
↓
Feed publico lista apenas imoveis publicados
↓
Portal consome feed ou usa adapter futuro
↓
Status externo pode ser salvo na publicacao
```

## Fluxo de lead

```txt
Portal envia webhook de lead
↓
Backend valida PORTAL_INTEGRATIONS_WEBHOOK_SECRET
↓
Sistema identifica empresa e imovel
↓
Lead entra no CRM com source do portal
↓
Evento lead.created_from_portal e portal_leads sao registrados
```

## Regras mantidas

- Nenhum dado ficticio e criado.
- Feed mostra apenas imoveis reais, publicados e disponiveis/reservados.
- Leads externos entram como dados reais vindos do portal.
- O endpoint de lead exige segredo de webhook.
- Cada publicacao e cada lead externo ficam isolados por `company_id`.

## Variavel obrigatoria para webhook

```txt
PORTAL_INTEGRATIONS_WEBHOOK_SECRET
```

## Pendencias futuras

- Adapter especifico por contrato/API oficial de cada portal.
- Sincronizacao de status externo de publicacao.
- Tela visual para publicar/despublicar em massa.
- Reprocessamento de leads duplicados e fila de retry.

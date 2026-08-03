# Fase 22 - Base de notificacoes e historico de envios

## Objetivo

Preparar o ImobiFlow para notificacoes reais por WhatsApp, e-mail e futuramente SMS, sem simular integracao com provedor externo antes da configuracao oficial.

Esta fase cria a camada auditavel para registrar mensagens preparadas, enviadas, entregues ou com falha.

## Banco de dados

Nova migracao:

- `database/migrations/014_notification_foundation.sql`

Tabelas criadas:

- `notification_templates`
- `notification_events`

Permissoes adicionadas:

- `notifications.view`
- `notifications.manage`

Regras importantes:

- todas as notificacoes operacionais possuem `company_id`;
- templates globais podem existir com `company_id` nulo;
- eventos possuem destinatario, canal, conteudo, status, provedor e entidade relacionada;
- RLS permite leitura apenas da propria empresa;
- indices foram criados por empresa, data, status e destinatario.

## Backend

Novo roteador:

- `backend/src/routes/notifications.ts`

Endpoints:

- `GET /notifications/templates`
- `GET /notifications/events`
- `POST /notifications/events`

Todos exigem:

- login valido;
- empresa vinculada;
- assinatura ativa;
- permissao adequada.

## Produto web

Novo modulo interno:

- `/app/notificacoes`

O modulo mostra:

- total de notificacoes preparadas;
- total de notificacoes enviadas/entregues;
- total de falhas;
- historico operacional com canal, destinatario, conteudo, status e data.

## Integração com portais

As telas de proprietarios e contratos agora registram um evento quando o usuario:

- copia link do portal;
- abre envio por WhatsApp;
- abre envio por e-mail.

Nesta etapa o envio ainda e manual, usando `wa.me` e `mailto`. O objetivo e manter rastreabilidade imediata e deixar o sistema pronto para conectar um provedor real.

## Proximos passos

- configurar provedor oficial de e-mail transacional;
- configurar provedor WhatsApp Business/API;
- criar templates editaveis por empresa;
- registrar webhooks de entrega/falha;
- automatizar regua de cobranca financeira;
- permitir notificacoes automáticas de boleto, PIX, inadimplencia, repasse e assinatura.

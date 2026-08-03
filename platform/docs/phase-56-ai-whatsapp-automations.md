# Fase 56 - Automacoes WhatsApp, IA imobiliaria e reguas operacionais

## Objetivo

Criar a fundacao das automacoes de comunicacao do ImobiFlow, com foco em WhatsApp, IA imobiliaria, follow-up comercial, cobranca, vistoria, contratos, repasses e atendimento operacional.

Essa fase prepara o produto para automatizar tarefas repetitivas sem perder controle, auditoria e respeito ao opt-in dos contatos.

## Migration criada

```txt
database/migrations/038_ai_whatsapp_automations.sql
```

## Estruturas criadas

### 1. Canais de comunicacao

Tabela:

```txt
communication_channels
```

Representa conexoes com provedores de WhatsApp, SMS, email, push ou outros canais.

Provedores previstos:

```txt
whatsapp_cloud_api
zapi
evolution_api
twilio
manual
other
```

Status:

```txt
inactive
active
error
pending_review
disabled
```

## 2. Templates de mensagem

Tabela:

```txt
message_templates
```

Categorias previstas:

```txt
lead_followup
visit_reminder
proposal
contract
inspection
billing
payment_confirmation
overdue_notice
owner_transfer
support
marketing
other
```

Status:

```txt
draft
pending_approval
active
rejected
archived
```

## 3. Contatos de comunicacao

Tabela:

```txt
communication_contacts
```

Representa leads, clientes, proprietarios, inquilinos, corretores, fornecedores e outros contatos.

O contato guarda:

- email;
- telefone;
- documento;
- tipo;
- opt-in WhatsApp;
- opt-in email;
- opt-in SMS;
- origem do consentimento;
- data de opt-in;
- data de opt-out;
- status.

## 4. Conversas

Tabela:

```txt
communication_threads
```

Organiza conversas por canal, contato e responsavel interno.

Status:

```txt
open
pending
resolved
archived
blocked
```

## 5. Mensagens

Tabela:

```txt
communication_messages
```

Registra mensagens recebidas e enviadas.

Direcao:

```txt
inbound
outbound
```

Status:

```txt
queued
sent
delivered
read
failed
cancelled
received
```

## 6. Fluxos de automacao

Tabela:

```txt
automation_flows
```

Gatilhos previstos:

```txt
lead_created
lead_no_followup
visit_scheduled
proposal_sent
contract_pending_signature
inspection_scheduled
charge_created
charge_due_soon
charge_overdue
payment_confirmed
owner_transfer_completed
manual
scheduled
```

Status:

```txt
draft
active
paused
archived
```

## 7. Execucoes de automacao

Tabela:

```txt
automation_runs
```

Registra cada execucao de um fluxo.

Status:

```txt
queued
running
completed
failed
cancelled
skipped
```

## 8. Uso de IA por tenant

Tabela:

```txt
ai_usage_events
```

Registra consumo de IA por empresa, usuario, recurso e entidade.

Recursos previstos:

```txt
property_description
lead_scoring
whatsapp_reply
inspection_summary
contract_summary
financial_analysis
support_assistant
other
```

## Regras de opt-in

O sistema nao deve enviar mensagens automatizadas por WhatsApp, email ou SMS sem permissao adequada.

Para WhatsApp:

- `opt_in_whatsapp` deve ser verdadeiro;
- origem do consentimento deve ser registrada;
- data de opt-in deve ser preservada;
- opt-out deve bloquear novas automacoes;
- mensagens de marketing devem ser tratadas com maior rigor;
- mensagens transacionais devem respeitar regras do provedor.

## Fluxos comerciais esperados

### Lead novo

```txt
Lead criado
↓
Sistema verifica opt-in
↓
IA sugere primeira resposta
↓
Mensagem e enviada ou fica pendente de aprovacao
↓
Corretor recebe tarefa de follow-up
↓
Historico fica salvo no CRM
```

### Lead sem follow-up

```txt
Lead parado no funil
↓
Automacao detecta atraso
↓
Sistema envia lembrete ao corretor
↓
Mensagem padrao pode ser enviada ao lead
↓
Gestor visualiza gargalo
```

## Fluxos financeiros esperados

### Cobrança gerada

```txt
Cobranca criada
↓
Sistema verifica canal do inquilino
↓
Envia aviso com boleto/PIX
↓
Registra mensagem
↓
Atualiza historico financeiro
```

### Vencimento proximo

```txt
3 dias antes do vencimento
↓
Sistema envia lembrete amigavel
↓
Registra automacao
↓
Evita inadimplencia
```

### Inadimplencia

```txt
Cobranca vencida
↓
Regua de cobranca e iniciada
↓
Mensagem leve
↓
Mensagem firme
↓
Alerta critico para imobiliaria
↓
Tarefa operacional
```

## Fluxos de vistoria e contratos

### Vistoria agendada

```txt
Vistoria marcada
↓
Sistema envia lembrete
↓
Confirma responsavel
↓
Link do portal ou informacoes sao enviadas
```

### Contrato pendente

```txt
Contrato enviado para assinatura
↓
Signatario nao assina
↓
Sistema envia lembrete
↓
Gestor acompanha pendencias
```

## IA imobiliaria

A IA deve apoiar:

- descricao de imoveis;
- respostas de atendimento;
- lead scoring;
- resumo de vistoria;
- resumo de contrato;
- analise financeira;
- suporte interno.

Regra essencial:

```txt
IA sugere.
Usuario ou automacao autorizada decide.
Sistema audita.
```

## Controle de custo por imobiliaria

Cada uso de IA deve registrar:

- empresa;
- usuario;
- recurso;
- modelo;
- tokens de entrada;
- tokens de saida;
- custo estimado;
- entidade relacionada;
- status;
- erro quando houver.

Isso alimenta o painel de custos por tenant e evita prejuizo operacional do SaaS.

## Segurança

Todas as estruturas possuem `company_id`.

O sistema deve impedir:

- envio por empresa errada;
- uso de canal de outra imobiliaria;
- contato de uma empresa receber mensagem de outra;
- IA acessar dados de outro tenant;
- automacao ativa sem permissao;
- envio para contato sem opt-in;
- exposicao de tokens no frontend.

## Permissoes sugeridas

```txt
communications.view
communications.manage
communications.templates.manage
communications.channels.manage
automations.view
automations.manage
ai.use
ai.costs.view
```

## Empty states

### Sem canal

```txt
Nenhum canal de comunicação configurado.

Configure WhatsApp, email ou outro canal para centralizar conversas, enviar notificações e automatizar follow-ups.
```

### Sem templates

```txt
Nenhum modelo de mensagem criado.

Crie mensagens padronizadas para leads, visitas, contratos, cobranças, vistorias e repasses.
```

### Sem automações

```txt
Nenhuma automação ativa.

Crie fluxos para reduzir tarefas repetitivas, acelerar atendimento e manter a operação sempre acompanhada.
```

## Telas esperadas

```txt
/app/comunicacao
/app/comunicacao/canais
/app/comunicacao/templates
/app/comunicacao/conversas
/app/automacoes
/app/automacoes/nova
/app/automacoes/:id
/app/ia
/app/ia/custos
```

## Endpoints esperados

```txt
GET /communications/channels
POST /communications/channels
POST /communications/channels/:id/healthcheck
GET /communications/templates
POST /communications/templates
POST /communications/messages
GET /communications/threads
GET /communications/threads/:id/messages
GET /automations
POST /automations
POST /automations/:id/activate
POST /automations/:id/pause
GET /automations/runs
POST /ai/property-description
POST /ai/lead-scoring
POST /ai/inspection-summary
POST /ai/whatsapp-reply
GET /ai/usage
```

## Proxima etapa

Quando o shell voltar:

- validar migration;
- implementar endpoints de comunicacao;
- criar telas vazias;
- criar conector manual de WhatsApp;
- preparar provider real em sandbox;
- implementar rastreamento de custo de IA;
- rodar build;
- commitar e publicar pacote acumulado.

## Macroetapas restantes

Apos esta fase, restam aproximadamente 2 macroetapas para a versao 100% completa:

1. Implementar telas/endpoints acumulados, conectores reais, mobile/PWA e offline.
2. Hardening, LGPD, custos por tenant, beta piloto, homologacao final e ajustes de producao.

# Fase 58 - Hardening, LGPD, custos por tenant, beta piloto e homologacao final

## Objetivo

Criar a fundacao final de governanca do ImobiFlow para operar como SaaS imobiliario em ambiente real.

Essa fase fecha o SDD estrutural preparando:

- LGPD;
- retencao de dados;
- resposta a incidentes;
- controle de custos por imobiliaria;
- margem operacional;
- feedback do beta piloto;
- checklist de release;
- homologacao final.

## Migration criada

```txt
database/migrations/040_hardening_lgpd_tenant_costs_beta.sql
```

## Estruturas criadas

### 1. Solicitações LGPD

Tabela:

```txt
lgpd_data_subject_requests
```

Permite registrar pedidos de titulares de dados:

```txt
access
correction
deletion
portability
consent_withdrawal
processing_information
objection
other
```

Status:

```txt
open
in_review
waiting_verification
resolved
rejected
cancelled
```

O sistema deve registrar:

- quem solicitou;
- tipo de titular;
- documento;
- verificação de identidade;
- prazo;
- resolução;
- responsável;
- vínculo com usuário, proprietário, inquilino ou lead.

## 2. Políticas de retenção

Tabela:

```txt
data_retention_policies
```

Define por quanto tempo cada tipo de dado deve ser mantido e o que fazer após o prazo.

Ações:

```txt
archive
anonymize
delete
manual_review
```

Exemplos:

- leads antigos sem conversão;
- logs técnicos;
- documentos contratuais;
- comprovantes financeiros;
- dados de comunicação;
- eventos de auditoria;
- mídias de vistoria.

## 3. Incidentes de segurança

Tabela:

```txt
security_incidents
```

Tipos previstos:

```txt
unauthorized_access
data_leak
payment_gateway_failure
webhook_abuse
credential_exposure
suspicious_login
rls_policy_risk
availability
other
```

Severidade:

```txt
low
medium
high
critical
```

Status:

```txt
open
triaging
contained
resolved
false_positive
cancelled
```

## 4. Eventos de custo por tenant

Tabela:

```txt
tenant_cost_events
```

Registra custos operacionais por imobiliária.

Tipos:

```txt
storage
image_upload
pdf_generation
ai_tokens
whatsapp_message
email
sms
gateway_charge
pix
boleto
webhook
api_request
other
```

Isso permite calcular margem real do SaaS por cliente.

## 5. Resumo de custos por tenant

Tabela:

```txt
tenant_cost_summaries
```

Agrupa custos por período:

- armazenamento;
- IA;
- comunicação;
- gateway;
- documentos;
- outros;
- receita estimada;
- margem estimada.

## 6. Feedback beta

Tabela:

```txt
beta_feedback_items
```

Usada durante a operação piloto da primeira imobiliária.

Tipos:

```txt
bug
improvement
question
training_need
data_issue
performance
other
```

Status:

```txt
open
triaging
planned
in_progress
resolved
wont_fix
duplicate
```

## 7. Checklist de release

Tabela:

```txt
release_readiness_checks
```

Categorias:

```txt
security
lgpd
billing
database
performance
observability
backup
support
training
product
integration
other
```

Status:

```txt
pending
passed
failed
skipped
blocked
```

## Checklist final de homologação

Antes de considerar o ImobiFlow pronto para operação comercial, validar:

### Segurança

- RLS aplicada nas tabelas multiempresa;
- endpoints validando empresa e permissão;
- assinatura ativa obrigatória;
- MFA planejado ou implementado;
- tokens e segredos fora do frontend;
- logs de auditoria preservados;
- webhooks validados;
- dispositivos revogáveis;
- incidentes registráveis.

### LGPD

- política de privacidade publicada;
- termos SaaS publicados;
- consentimento de comunicação registrado;
- opt-out funcionando;
- solicitações de titular registráveis;
- retenção/anonymização planejada;
- dados sensíveis protegidos;
- logs de acesso auditáveis.

### Financeiro

- cobrança;
- PIX;
- boleto;
- webhook;
- compensação bancária;
- comissão;
- repasse;
- conciliação;
- divergência;
- auditoria;
- taxa operacional transparente.

### Gateway

- sandbox validado;
- healthcheck;
- webhook assinado;
- PIX teste;
- boleto teste;
- cancelamento;
- conciliação;
- aprovação para produção.

### Portais

- proprietário visualiza repasses;
- proprietário visualiza demonstrativos;
- inquilino visualiza cobranças;
- inquilino baixa boleto;
- inquilino copia PIX;
- documentos publicados;
- logs de atividade.

### Contratos

- templates;
- geração;
- aprovação;
- signatários;
- envio para assinatura;
- evento de assinatura;
- PDF final;
- publicação no portal.

### Vistoria

- template;
- vistoria por cômodo;
- fotos;
- vídeos;
- offline;
- comparação entrada/saída;
- PDF;
- assinatura;
- portal.

### Comunicação e IA

- opt-in;
- templates;
- conversas;
- automações;
- régua de cobrança;
- IA com auditoria;
- custo por tenant;
- limites operacionais.

### Mobile/PWA

- manifest;
- service worker;
- cache seguro;
- dispositivo registrado;
- sync offline;
- conflito resolvível;
- push notification;
- logout limpando dados sensíveis.

### Observabilidade

- logs de erro;
- monitoramento de API;
- monitoramento de jobs;
- monitoramento de webhook;
- alertas de falha financeira;
- rastreamento de custo;
- métricas por tenant.

## Operação piloto

A primeira imobiliária deve ser tratada como beta real controlado.

Objetivos:

- validar fluxo comercial;
- validar locação;
- validar financeiro;
- validar boletos/PIX;
- validar vistoria;
- validar contratos;
- medir custos reais;
- medir suporte necessário;
- medir gargalos de UX;
- medir margem do plano Enterprise.

## Métricas do beta

Acompanhar:

- quantidade de usuários ativos;
- imóveis cadastrados;
- leads criados;
- vistorias realizadas;
- contratos gerados;
- cobranças emitidas;
- pagamentos confirmados;
- repasses calculados;
- mensagens enviadas;
- uso de IA;
- custo total da empresa;
- margem estimada;
- bugs críticos;
- tempo de resolução.

## Regras finais

O sistema só deve liberar uso completo quando:

```txt
login valido
+
empresa vinculada
+
assinatura ativa
+
permissao adequada
+
dados isolados por company_id
+
modulo habilitado no plano
```

Usuário logado não significa usuário autorizado.

## Proxima etapa operacional

Quando o shell voltar, o trabalho crítico é:

1. Validar todas as migrations acumuladas.
2. Rodar build do backend.
3. Rodar build do frontend.
4. Corrigir eventuais incompatibilidades.
5. Criar um commit grande e bem descrito ou dividir por blocos.
6. Fazer push.
7. Publicar na Vercel.
8. Aplicar migrations no Supabase.
9. Testar login, assinatura, financeiro, portais, contratos e vistorias.
10. Abrir ciclo de beta piloto.

## Estado do SDD

Com esta fase, o SDD estrutural chega ao fechamento de macroarquitetura.

Ainda existe uma diferença importante:

```txt
Arquitetura e banco preparados
≠
Produto 100% implementado em telas, endpoints, workers e integrações reais
```

O próximo ciclo deve trocar de foco:

```txt
de "preparar arquitetura"
para
"implementar funcionalidade executável ponta a ponta"
```

## Macroetapas restantes

As macroetapas de arquitetura do SDD estão fechadas.

Agora restam ciclos de implementação executável:

1. Validar e publicar pacote acumulado.
2. Implementar endpoints/telas dos módulos preparados.
3. Conectar provedores reais em sandbox.
4. Rodar beta piloto.
5. Homologar produção.

# Fase 54 - Contratos e assinatura digital

## Objetivo

Criar a fundacao documental do ImobiFlow para gerar contratos, aprovar documentos, enviar para assinatura digital, acompanhar signatarios e preservar auditoria juridica.

Essa fase conecta diretamente:

- CRM;
- imoveis;
- proprietarios;
- inquilinos;
- contratos de locacao;
- financeiro;
- vistoria;
- portais externos;
- assinatura digital.

## Migration criada

```txt
database/migrations/036_contracts_digital_signatures.sql
```

Ela adiciona quatro estruturas principais.

## 1. Templates de contrato

Tabela:

```txt
contract_templates
```

Objetivo:

- armazenar modelos aprovados;
- versionar textos juridicos;
- permitir variaveis dinamicas;
- separar rascunho de template ativo;
- arquivar modelos antigos sem apagar historico.

Tipos:

```txt
rental
sale
management
inspection
proposal
owner_authorization
tenant_notice
other
```

Status:

```txt
draft
active
archived
```

## 2. Documentos contratuais gerados

Tabela:

```txt
contract_documents
```

Representa um contrato ou documento juridico especifico gerado a partir de um template.

Ele pode estar ligado a:

- imovel;
- proprietario;
- inquilino;
- lead;
- negociacao;
- contrato de locacao;
- proposta;
- vistoria.

Status:

```txt
draft
pending_review
approved
sent_for_signature
partially_signed
signed
cancelled
expired
archived
```

## 3. Signatarios

Tabela:

```txt
contract_signers
```

Representa cada pessoa que precisa assinar.

Tipos:

```txt
owner
tenant
guarantor
witness
broker
company_representative
other
```

Status:

```txt
pending
invited
viewed
signed
declined
cancelled
expired
```

## 4. Eventos de assinatura

Tabela:

```txt
contract_signature_events
```

Preserva eventos recebidos ou gerados durante o processo de assinatura:

- envio;
- abertura;
- visualizacao;
- assinatura;
- recusa;
- expiracao;
- cancelamento;
- webhook do provedor;
- atualizacao de status.

## Fluxo principal

```txt
Imobiliaria cria template
↓
Template e revisado e aprovado
↓
Sistema gera contrato com variaveis reais
↓
Documento entra em revisao
↓
Usuario aprova envio
↓
Sistema cria signatarios
↓
Contrato e enviado ao provedor de assinatura
↓
Signatarios assinam
↓
Webhook atualiza status
↓
PDF final e armazenado
↓
Documento fica disponivel no portal
↓
Auditoria e preservada
```

## Variaveis esperadas

Os templates devem suportar variaveis como:

```txt
{{owner_name}}
{{tenant_name}}
{{property_address}}
{{rent_amount}}
{{due_day}}
{{commission_percentage}}
{{contract_start_date}}
{{contract_end_date}}
{{deposit_amount}}
{{inspection_report_url}}
```

O documento gerado deve salvar `variables_snapshot`, garantindo que a versao assinada preserve os dados usados no momento da geracao.

## Regra juridica importante

Um contrato assinado nao pode ser alterado silenciosamente.

Se houver mudanca apos assinatura:

- criar aditivo;
- criar nova versao;
- cancelar documento anterior quando cabivel;
- preservar assinatura e PDF original;
- registrar auditoria.

## Integração com assinatura digital

A arquitetura deve permitir provedores como:

- ZapSign;
- D4Sign;
- Clicksign;
- DocuSign;
- Gov.br ou outro provedor futuro;
- operacao manual assistida.

O sistema deve armazenar:

- `external_signature_id`;
- `signature_provider`;
- `signature_url`;
- eventos externos;
- payload bruto;
- status antes/depois;
- data de assinatura;
- IP e user-agent quando disponiveis.

## Integração com portais

Quando o contrato for assinado, ele deve poder ser publicado em:

- portal do proprietario;
- portal do inquilino;
- historico do imovel;
- historico da locacao.

O portal deve exibir:

- contrato assinado;
- data da assinatura;
- signatarios;
- status;
- PDF final;
- documentos relacionados.

## Segurança

O sistema deve validar:

```txt
login valido
+
empresa vinculada
+
assinatura ativa
+
permissao do usuario
+
acesso ao documento da mesma company_id
```

Permissoes sugeridas:

```txt
contracts.view
contracts.manage
contracts.approve
contracts.send_signature
contracts.cancel
contracts.templates.manage
```

## Auditoria obrigatoria

Registrar:

- quem criou o template;
- quem aprovou o template;
- quem gerou o contrato;
- quem aprovou envio;
- quem enviou para assinatura;
- quem assinou;
- quando assinou;
- eventos do provedor;
- IP e user-agent;
- status anterior;
- status novo;
- payload recebido.

## Empty states

### Sem templates

```txt
Nenhum modelo de contrato cadastrado.

Crie modelos juridicos reutilizaveis para gerar contratos de locacao, propostas, autorizacoes e comunicados com mais velocidade e padronizacao.
```

### Sem contratos

```txt
Nenhum contrato gerado.

Quando uma proposta ou locacao avancar, os contratos gerados aparecerao aqui para revisao, envio e assinatura.
```

### Sem signatarios

```txt
Nenhum signatario adicionado.

Adicione proprietario, inquilino, testemunhas ou representantes antes de enviar para assinatura.
```

## Telas esperadas

```txt
/app/contratos
/app/contratos/templates
/app/contratos/novo
/app/contratos/:id
/app/contratos/:id/signatarios
/app/contratos/:id/auditoria
```

## Endpoints esperados

```txt
GET /contracts/templates
POST /contracts/templates
POST /contracts/templates/:id/approve
GET /contracts/documents
POST /contracts/documents
GET /contracts/documents/:id
POST /contracts/documents/:id/approve
POST /contracts/documents/:id/send-signature
POST /contracts/documents/:id/cancel
POST /contracts/documents/:id/signers
GET /contracts/documents/:id/events
```

## Proxima etapa

Quando o shell voltar:

- validar a migration;
- implementar endpoints de templates e documentos;
- criar telas vazias de contratos;
- conectar contratos aos portais;
- preparar conector de assinatura digital;
- rodar build;
- commitar e publicar o pacote acumulado.

## Macroetapas restantes

Apos esta fase, restam aproximadamente 4 macroetapas para a versao 100% completa:

1. Implementar telas/endpoints de gateways, portais e contratos.
2. Integrar primeiro gateway e primeiro provedor de assinatura em sandbox.
3. Vistoria inteligente completa, automacoes WhatsApp, IA imobiliaria e mobile/offline.
4. Hardening, LGPD, custos por tenant, beta piloto e homologacao final.

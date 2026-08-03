# Fase 53 - Portais do proprietario e do inquilino

## Objetivo

Criar a fundacao dos portais externos do ImobiFlow para proprietarios e inquilinos.

Esses portais sao uma parte essencial do ERP imobiliario, porque reduzem atendimento manual, aumentam transparencia financeira e permitem que a imobiliaria entregue uma experiencia profissional para todos os envolvidos na locacao.

## Problema resolvido

Sem portal, a imobiliaria precisa responder manualmente perguntas como:

- meu boleto ja venceu?
- onde baixo a segunda via?
- meu PIX esta disponivel?
- meu pagamento foi confirmado?
- onde esta meu recibo?
- quando recebo o repasse?
- quanto foi descontado de comissao?
- qual taxa foi cobrada?
- onde esta o laudo de vistoria?
- onde esta o contrato?

O portal organiza essas informacoes em um ambiente seguro e auditavel.

## Migration criada

```txt
database/migrations/035_owner_tenant_portals.sql
```

Ela adiciona tres estruturas principais.

## 1. Membros do portal

Tabela:

```txt
portal_memberships
```

Representa o acesso externo de proprietarios e inquilinos.

Campos principais:

```txt
company_id
user_id
portal_type
owner_id
tenant_id
display_name
email
phone
document_number
status
permissions
invite_token_hash
invitation_sent_at
invitation_expires_at
accepted_at
suspended_at
revoked_at
last_login_at
created_by
metadata
```

Tipos:

```txt
owner
tenant
```

Status:

```txt
invited
active
suspended
revoked
expired
```

## 2. Documentos publicados no portal

Tabela:

```txt
portal_documents
```

Representa documentos, cobranças, recibos, contratos, laudos e comunicados visiveis para o proprietario ou inquilino.

Tipos previstos:

```txt
charge
receipt
owner_transfer
owner_statement
contract
inspection_report
property_document
notice
invoice
payment_slip
pix_code
other
```

Status:

```txt
draft
published
read
archived
revoked
```

## 3. Logs de atividade

Tabela:

```txt
portal_activity_logs
```

Registra atividades relevantes dentro dos portais.

Acoes previstas:

```txt
invite_sent
invite_accepted
login
logout
document_viewed
charge_viewed
boleto_downloaded
pix_copied
receipt_downloaded
statement_viewed
support_requested
access_suspended
access_revoked
```

## Portal do proprietario

O proprietario deve conseguir visualizar:

- imoveis vinculados;
- contratos ativos;
- alugueis recebidos;
- repasses pendentes;
- repasses realizados;
- comissao da imobiliaria;
- taxas operacionais;
- descontos;
- manutencoes;
- comprovantes;
- demonstrativos mensais;
- historico financeiro;
- previsao de proximos recebimentos;
- documentos do imovel;
- laudos de vistoria;
- comunicados da imobiliaria.

## Exemplo de demonstrativo do proprietario

```txt
Aluguel recebido: R$ 3.000,00
Comissao imobiliaria: -R$ 300,00
Taxa operacional: -R$ 3,79
Manutencao: -R$ 150,00
Valor liquido: R$ 2.546,21
Status: Repasse realizado
```

## Portal do inquilino

O inquilino deve conseguir:

- visualizar cobranças abertas;
- pagar via PIX;
- copiar codigo PIX;
- baixar boleto;
- solicitar segunda via;
- acompanhar status da compensacao;
- baixar recibos;
- consultar historico de pagamentos;
- visualizar contrato;
- visualizar laudos de vistoria;
- receber comunicados;
- solicitar suporte ou atendimento.

## Experiencia de cobranca do inquilino

O portal deve deixar claro:

- valor do aluguel;
- multas;
- juros;
- descontos;
- taxas operacionais, quando existirem;
- responsavel pela taxa;
- vencimento;
- status;
- metodo de pagamento;
- prazo de compensacao do boleto;
- confirmacao quase instantanea do PIX.

## Regras de transparencia

Taxas nao podem ficar ocultas.

Quando houver taxa operacional, o portal deve exibir:

```txt
Aluguel: R$ 3.000,00
Taxa operacional: R$ 3,79
Total: R$ 3.003,79
```

Se a taxa for paga pelo proprietario, ela deve aparecer no demonstrativo do proprietario.

Se for paga pela imobiliaria, deve aparecer apenas no controle interno financeiro.

## Segurança

Os portais devem obedecer a regra principal do sistema:

```txt
login valido
+
empresa vinculada
+
portal ativo
+
permissao adequada
+
assinatura ativa da imobiliaria
```

O proprietario ou inquilino nao pode acessar dados se:

- a imobiliaria estiver sem assinatura ativa;
- o acesso dele estiver suspenso;
- o convite estiver expirado;
- a permissao nao permitir aquele documento;
- o documento tiver sido revogado;
- o dado pertencer a outra empresa.

## Multiempresa

Todas as tabelas possuem `company_id`.

O sistema deve impedir:

- proprietario ver dados de outra imobiliaria;
- inquilino acessar cobranca de outro contrato;
- documento publicado em uma empresa aparecer em outra;
- usuario externo acessar area interna da imobiliaria sem permissao.

## Empty states

### Proprietario sem repasses

```txt
Nenhum repasse encontrado.

Quando os alugueis forem confirmados e os repasses calculados, eles aparecerao aqui com demonstrativo detalhado.
```

### Inquilino sem cobranças

```txt
Nenhuma cobrança em aberto.

Quando uma cobrança for gerada pela imobiliária, voce podera pagar por PIX, baixar boleto e acompanhar o status por aqui.
```

### Sem documentos

```txt
Nenhum documento publicado.

Contratos, recibos, laudos e comunicados ficarao disponiveis aqui quando forem publicados pela imobiliaria.
```

## Telas esperadas

### Proprietario

```txt
/portal/proprietario
/portal/proprietario/repasses
/portal/proprietario/imoveis
/portal/proprietario/documentos
/portal/proprietario/extratos
```

### Inquilino

```txt
/portal/inquilino
/portal/inquilino/cobrancas
/portal/inquilino/pagamentos
/portal/inquilino/documentos
/portal/inquilino/vistorias
```

## Endpoints esperados

```txt
GET /portal/me
GET /portal/documents
GET /portal/activity
POST /portal/invites/:token/accept
POST /portal/documents/:id/read
POST /portal/charges/:id/copy-pix
POST /portal/charges/:id/download-boleto
POST /portal/receipts/:id/download
```

## Permissoes sugeridas

```txt
portal.owner.view
portal.owner.financial.view
portal.owner.documents.view
portal.tenant.view
portal.tenant.charges.view
portal.tenant.documents.view
portal.tenant.payments.view
```

## Proxima etapa

Quando o shell voltar:

- validar migrations acumuladas;
- implementar endpoints de portal;
- criar telas vazias dos portais;
- conectar cobranças e repasses reais;
- criar fluxo de convite;
- rodar build;
- commitar e publicar o pacote acumulado.

## Macroetapas restantes

Apos esta fase, restam aproximadamente 5 macroetapas para a versao 100% completa:

1. Implementar telas/endpoints dos portais e gateways.
2. Integrar primeiro gateway real em sandbox.
3. Contratos, assinatura digital e vistoria inteligente completa.
4. Automacoes WhatsApp, IA imobiliaria, mobile/PWA e offline.
5. Hardening, LGPD, custos por tenant, beta piloto e homologacao final.

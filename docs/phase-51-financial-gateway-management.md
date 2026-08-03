# Fase 51 - Gerenciamento de gateways financeiros

## Objetivo

Preparar a camada operacional para que cada imobiliaria conecte, teste, monitore e proteja seu gateway financeiro dentro do ImobiFlow.

A Fase 49 criou a base de conexoes e logs de chamadas. A Fase 50 criou a interface tecnica dos conectores. A Fase 51 adiciona a fundacao de seguranca e define a tela/endpoints de gerenciamento que serao usados pelo modulo Financeiro.

## Nova base de banco

Foi criada a migration:

```txt
database/migrations/033_financial_gateway_security.sql
```

Com tres novas estruturas.

## 1. Rotacao de credenciais

Tabela:

```txt
financial_gateway_credential_rotations
```

Objetivo:

- registrar solicitacoes de troca de token;
- controlar aprovacao;
- acompanhar execucao;
- registrar falha;
- preservar historico;
- evitar troca silenciosa de credenciais financeiras.

Status:

```txt
planned
approved
running
completed
failed
cancelled
```

Campos principais:

```txt
company_id
gateway_connection_id
provider
status
reason
requested_by
approved_by
started_at
completed_at
failed_at
error_message
old_secret_hint
new_secret_hint
metadata
```

## 2. Endpoints de webhook

Tabela:

```txt
financial_gateway_webhook_endpoints
```

Objetivo:

- gerar endpoint unico por conexao;
- identificar qual empresa/gateway recebeu o evento;
- controlar eventos esperados;
- permitir pausa ou rotacao;
- registrar tentativas invalidas;
- preservar hints de seguranca sem expor segredo.

Status:

```txt
active
paused
rotating
disabled
```

Campos principais:

```txt
company_id
gateway_connection_id
provider
endpoint_token
status
expected_events
allowed_ips
signature_header
secret_hint
last_event_at
last_valid_event_at
last_invalid_event_at
invalid_attempts
created_by
rotated_at
metadata
```

## 3. Tentativas de webhook

Tabela:

```txt
financial_gateway_webhook_attempts
```

Objetivo:

- registrar toda tentativa recebida;
- separar evento recebido de evento processado;
- identificar eventos invalidos;
- registrar assinatura valida/invalida;
- ajudar suporte e auditoria;
- detectar duplicidades e ataques simples.

Status:

```txt
received
validated
rejected
processed
failed
duplicate
```

Campos principais:

```txt
company_id
gateway_connection_id
webhook_endpoint_id
provider
endpoint_token
gateway_event_id
event_type
status
http_status
signature_valid
ip_address
user_agent
error_message
raw_payload
normalized_payload
processed_at
```

## Tela esperada

Adicionar no produto:

```txt
Financeiro > Gateways
```

Essa tela deve exibir:

- gateway padrao da imobiliaria;
- ambiente atual;
- status da conexao;
- metodos suportados;
- status das credenciais;
- endpoint de webhook;
- ultimo evento recebido;
- ultimos erros;
- ultimo healthcheck;
- chamadas recentes;
- tentativas invalidas de webhook;
- rotacoes de credenciais.

## Cards da tela

Indicadores sugeridos:

```txt
Gateway ativo
Ambiente
Credenciais
Ultimo healthcheck
Ultimo webhook valido
Tentativas invalidas
Chamadas com erro
```

## Empty state

Quando nao houver gateway configurado:

```txt
Nenhum gateway financeiro configurado.

Configure um provedor para emitir PIX, boletos, receber confirmacoes automaticas e preparar o fluxo de repasse ao proprietario.
```

## Endpoints esperados

### Listar gateways

```txt
GET /finance/gateways
```

Retorna conexoes da empresa, gateway padrao e metadados de status.

### Criar gateway

```txt
POST /finance/gateways
```

Cria uma conexao em sandbox ou producao.

Campos esperados:

```txt
provider
display_name
environment
supports_pix
supports_boleto
supports_transfer
supports_split
```

### Testar conexao

```txt
POST /finance/gateways/:id/healthcheck
```

Executa `healthcheck` no conector registrado.

### Ativar gateway

```txt
POST /finance/gateways/:id/activate
```

Regras:

- credenciais devem estar configuradas;
- healthcheck recente deve estar OK;
- webhook deve existir;
- apenas um gateway pode ficar como padrao.

### Desativar gateway

```txt
POST /finance/gateways/:id/deactivate
```

Desativa emissao de novas cobrancas pelo gateway.

### Listar chamadas

```txt
GET /finance/gateways/requests
```

Retorna historico de chamadas ao provedor.

### Criar endpoint de webhook

```txt
POST /finance/gateways/:id/webhook-endpoint
```

Gera token unico e URL operacional.

### Rotacionar webhook

```txt
POST /finance/gateways/:id/webhook-endpoint/rotate
```

Gera novo token e preserva historico.

### Listar tentativas de webhook

```txt
GET /finance/gateways/webhook-attempts
```

Mostra eventos recebidos, rejeitados, duplicados ou processados.

## Permissoes

Sugestao:

```txt
finance.view
finance.manage
finance.gateway.manage
finance.gateway.security
```

Regras:

- `finance.view`: visualiza status e logs basicos.
- `finance.manage`: pode testar conexao.
- `finance.gateway.manage`: cria, ativa e desativa gateway.
- `finance.gateway.security`: rotaciona credenciais e webhooks.

## Segurança obrigatoria

O sistema deve:

- nunca mostrar token completo;
- mascarar payload sensivel;
- registrar tentativas invalidas;
- validar assinatura de webhook;
- impedir webhook sem endpoint ativo;
- isolar por `company_id`;
- preservar auditoria;
- nao permitir baixa financeira sem evento validado ou excecao auditada.

## Fluxo de ativacao recomendado

```txt
Criar gateway em sandbox
↓
Configurar credenciais seguras
↓
Gerar endpoint de webhook
↓
Testar healthcheck
↓
Emitir cobranca teste
↓
Receber webhook teste
↓
Validar conciliacao
↓
Marcar gateway como ativo
↓
Usar na operacao piloto
```

## Proxima etapa

Quando o executor de comandos voltar, implementar:

- rotas reais em backend;
- tela `Financeiro > Gateways`;
- cliente frontend para listar/testar gateway;
- empty state;
- healthcheck usando registry de conectores;
- logs de requests;
- testes de build;
- commit, push e deploy acumulado.

## Macroetapas restantes

Apos esta fase, restam aproximadamente 7 macroetapas para a versao 100% completa:

1. Implementar tela/endpoints de gateways.
2. Integrar primeiro provedor real em sandbox.
3. Portais do proprietario e inquilino.
4. Contratos e assinatura digital.
5. Vistoria inteligente completa.
6. Automacoes WhatsApp, IA imobiliaria e mobile/offline.
7. Hardening, LGPD, beta piloto, homologacao e ajustes finais.

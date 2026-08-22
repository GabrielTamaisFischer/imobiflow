# Fase 49 - Integracoes com gateways financeiros

## Objetivo

Preparar o ImobiFlow para integracao real com gateways financeiros capazes de emitir cobrancas PIX, boletos, consultar status, cancelar cobrancas, receber webhooks e futuramente executar repasses ou split financeiro.

Esta fase nao fixa o produto em um unico provedor. A arquitetura fica preparada para:

- Asaas;
- PJBank;
- Iugu;
- Mercado Pago;
- Stripe;
- outro gateway compativel com API REST e webhooks.

## Principio do modulo

O ImobiFlow deve tratar o gateway como uma camada substituivel.

O produto nao deve espalhar regras especificas de Asaas, PJBank, Iugu ou Mercado Pago por toda a aplicacao. Cada provedor deve ser encapsulado por um conector, mantendo uma interface financeira comum.

```txt
ImobiFlow
↓
Camada comum de gateway
↓
Conector do provedor
↓
API externa
↓
Webhook de retorno
↓
Conciliacao financeira
```

## Nova estrutura de banco

Foram criadas duas tabelas principais.

### `financial_gateway_connections`

Representa a conexao de uma imobiliaria com um gateway financeiro.

Campos principais:

```txt
id
company_id
provider
display_name
environment
status
is_default
supports_pix
supports_boleto
supports_card
supports_transfer
supports_split
external_account_id
webhook_url
webhook_secret_hint
credentials_status
last_healthcheck_at
last_healthcheck_status
last_error_message
activated_at
deactivated_at
created_by
updated_by
metadata
```

### `financial_gateway_requests`

Registra chamadas enviadas ou recebidas do gateway.

Campos principais:

```txt
id
company_id
gateway_connection_id
provider
operation
direction
entity_type
entity_id
idempotency_key
external_id
request_status
http_status
request_payload
response_payload
error_message
started_at
finished_at
```

## Operacoes suportadas

A base ja considera as seguintes operacoes:

```txt
create_charge
cancel_charge
get_charge
create_pix
create_boleto
create_transfer
get_transfer
webhook_receive
healthcheck
other
```

## Ambientes

Cada conexao pode operar em:

```txt
sandbox
production
```

O ambiente sandbox deve ser usado para homologacao e testes sem impacto financeiro real.

O ambiente production deve ser liberado apenas quando:

- credenciais estiverem configuradas;
- webhook estiver validado;
- healthcheck estiver aprovado;
- operacao piloto estiver autorizada;
- logs e auditoria estiverem funcionando.

## Status da conexao

```txt
inactive
active
error
pending_review
disabled
```

Descricao:

- `inactive`: conexao cadastrada, mas nao operacional.
- `active`: pronta para emitir cobrancas e receber eventos.
- `error`: falha detectada em credenciais, API ou webhook.
- `pending_review`: aguardando revisao administrativa.
- `disabled`: desativada intencionalmente.

## Status das credenciais

```txt
missing
configured
invalid
rotating
expired
```

As credenciais sensiveis nao devem ser armazenadas em texto puro no banco.

Recomendacao:

- usar variaveis de ambiente seguras;
- usar cofre de segredos quando disponivel;
- armazenar no banco apenas metadados, hints e status;
- nunca exibir token completo no frontend;
- registrar rotacao e invalidacao.

## Idempotencia

Toda operacao critica deve usar `idempotency_key`.

Exemplos:

- criar boleto;
- gerar PIX;
- cancelar cobranca;
- criar repasse;
- processar webhook.

Isso evita duplicidade em caso de timeout, retry ou clique repetido.

## Webhooks

O recebimento de webhook deve seguir este fluxo:

```txt
Gateway envia evento
↓
Backend valida autenticidade
↓
Evento bruto e salvo
↓
Sistema registra financial_gateway_requests
↓
Sistema salva/atualiza financial_webhook_events
↓
Sistema atualiza cobranca quando seguro
↓
Sistema dispara conciliacao
↓
Sistema registra auditoria
```

Eventos esperados:

```txt
payment.created
payment.pending
payment.received
payment.confirmed
payment.overdue
payment.cancelled
payment.refunded
pix.received
boleto.paid
transfer.created
transfer.completed
transfer.failed
```

## Regras de seguranca

Cada conexao pertence a uma unica `company_id`.

O sistema deve impedir:

- uma imobiliaria usar credenciais de outra;
- um webhook atualizar cobranca de outra empresa;
- uma chamada de gateway misturar entidades de tenants diferentes;
- exposicao de token no frontend;
- baixa financeira sem auditoria.

## Auditoria obrigatoria

Toda chamada ao gateway deve registrar:

- empresa;
- provedor;
- operacao;
- entidade relacionada;
- status da requisicao;
- payload enviado quando seguro;
- resposta recebida quando seguro;
- erro;
- data de inicio;
- data de fim;
- chave de idempotencia.

Payloads com dados sensiveis devem ser mascarados antes de exibicao em tela.

## Provedor padrao

Cada imobiliaria pode ter apenas uma conexao marcada como `is_default`.

Essa conexao sera usada para:

- emissao padrao de boleto;
- geracao padrao de PIX;
- consulta de cobranca;
- webhook principal;
- repasse futuro.

## Experiencia esperada no painel

No painel administrativo da imobiliaria, futuramente deve existir uma tela:

```txt
Financeiro > Gateways
```

Com:

- gateway ativo;
- ambiente;
- metodos suportados;
- status das credenciais;
- ultimo healthcheck;
- ultimo erro;
- botao testar conexao;
- botao ativar/desativar;
- historico de chamadas;
- instrucoes do webhook.

## Operacao piloto

Na operacao piloto Enterprise, a recomendacao e iniciar em sandbox e validar:

- criacao de cobranca;
- PIX;
- boleto;
- webhook de pagamento;
- compensacao de boleto;
- baixa automatica;
- comissao;
- repasse calculado;
- conciliacao.

Somente apos isso o gateway deve ser migrado para producao.

## Proxima etapa

Implementar a camada de servico:

```txt
backend/src/services/financial-gateways/
```

Com interface comum:

```txt
createCharge
createPix
createBoleto
cancelCharge
getCharge
createTransfer
verifyWebhook
normalizeWebhookEvent
healthcheck
```

E endpoints:

```txt
GET /finance/gateways
POST /finance/gateways
POST /finance/gateways/:id/healthcheck
POST /finance/gateways/:id/activate
POST /finance/gateways/:id/deactivate
GET /finance/gateways/requests
```

## Macroetapas restantes

Apos esta fase, restam aproximadamente 9 macroetapas para a versao 100% completa.

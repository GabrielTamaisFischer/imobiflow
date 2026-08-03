# Fase 32 - Sincronizacao de inquilino com gateway financeiro

## Objetivo

Esta fase cria a base para vincular o inquilino do contrato ao cliente real do gateway financeiro antes da emissao de PIX ou boleto.

No Asaas, a cobranca depende de um `customer` real. Portanto, o ImobiFlow passa a ter um fluxo operacional correto:

```txt
Contrato de locacao
↓
Inquilino cadastrado
↓
Cliente sincronizado no gateway
↓
Customer ID salvo no ImobiFlow
↓
PIX/boleto emitido usando customer real
↓
Webhook confirma pagamento
```

## Banco de dados

Nova migration:

```txt
database/migrations/020_gateway_customer_sync.sql
```

Novas colunas em `contract_parties`:

- `gateway_provider`
- `gateway_customer_id`
- `gateway_customer_status`
- `gateway_synced_at`
- `gateway_metadata`

Tambem foram criados indices por empresa e status de gateway, mantendo a arquitetura multiempresa.

## Backend

Foi adicionada a funcao:

```ts
syncGatewayCustomer()
```

Ela prepara a sincronizacao de cliente e, para Asaas, usa:

- `GET /v3/customers?externalReference=...`
- `POST /v3/customers`

O sistema consulta antes de criar, pois a propria documentacao do Asaas informa que clientes duplicados podem ser criados se a aplicacao nao armazenar ou consultar os identificadores.

## Endpoint operacional

Novo endpoint:

```txt
POST /finance/charges/:id/sync-gateway-customer
```

Regras:

- exige usuario autenticado;
- exige empresa vinculada;
- exige assinatura ativa;
- exige permissao `finance.manage`;
- exige cobranca real nao manual;
- exige inquilino vinculado ao contrato;
- exige gateway ativo ou em teste;
- nao cria `customer_id` falso.

## Protecoes

A chamada real ao Asaas so acontece quando:

```txt
provider = asaas
credentials_ref aponta para env real
settings.enable_real_api = true
inquilino possui CPF/CNPJ
```

Sem isso, o sistema registra status tecnico:

- `credentials_missing`
- `adapter_not_enabled`
- `document_required`
- `real_call_disabled`
- `provider_error`
- `synced`

## Interface

Na tela financeira, a cobranca passa a ter o botao:

```txt
Sincronizar cliente
```

Esse botao prepara ou executa a sincronizacao do inquilino com o gateway, exibindo uma mensagem clara sobre o proximo passo.

## Resultado

Com esta fase, a emissao de PIX/boleto deixa de depender de configuracao manual de `customer_id` no gateway e passa a ter caminho operacional para gerar o cliente real a partir do inquilino do contrato.

## Proxima fase sugerida

Evoluir a emissao para buscar QR Code PIX e detalhes de boleto apos criar a cobranca no Asaas:

```txt
Criar cobranca
↓
Persistir payment id
↓
Consultar QR Code PIX quando metodo for PIX
↓
Consultar linha digitavel/PDF quando metodo for boleto
↓
Exibir no portal do inquilino
```

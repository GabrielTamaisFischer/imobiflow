# Fase 28 - Configuracao de gateways financeiros

## Objetivo

Esta fase prepara o ImobiFlow para conectar provedores financeiros reais sem armazenar credenciais sensiveis no frontend.

O SDD define que o sistema deve suportar bancos e gateways como:

- PJBank;
- Asaas;
- Iugu;
- Mercado Pago;
- Stripe;
- outros provedores compativeis com API e webhook.

## Backend

Foram adicionados endpoints ao modulo financeiro:

```txt
GET /finance/gateway-accounts
POST /finance/gateway-accounts
```

Protecoes:

```txt
login valido
empresa vinculada
assinatura ativa
permissao finance.view ou finance.manage
```

## Dados armazenados

Cada gateway fica vinculado a uma imobiliaria por:

```txt
company_id
```

Campos principais:

- provedor;
- nome interno;
- status;
- ambiente sandbox/producao;
- metodo padrao;
- referencia da credencial;
- referencia do segredo de webhook;
- URL de webhook;
- configuracoes operacionais.

## Regra de seguranca

O sistema nao armazena a chave real do gateway no frontend.

O campo `credentials_ref` deve guardar somente uma referencia segura, por exemplo:

```txt
vercel:ASAAS_API_KEY
vault:PJBANK_SECRET
```

As chaves reais devem ficar em ambiente seguro, como variaveis protegidas da Vercel ou cofre de segredo.

## Vinculo com cobrancas

Ao gerar uma cobranca de aluguel por contrato, o backend procura uma conta de gateway ativa ou em teste da empresa.

Se encontrada, a cobranca passa a receber:

```txt
gateway_account_id
gateway_provider
gateway_environment
```

Isso deixa a cobranca pronta para a proxima fase: emissao real de PIX/boleto via API do provedor.

## Frontend

A tela:

```txt
/app/configuracoes
```

agora possui uma secao de gateways financeiros.

Ela permite:

- listar gateways da imobiliaria;
- cadastrar provedor;
- definir ambiente;
- definir metodo padrao;
- registrar referencia segura da credencial;
- registrar URL de webhook.

## Sem dados ficticios

Nenhum gateway e criado automaticamente.

O sistema inicia vazio e a imobiliaria precisa cadastrar uma configuracao real ou de teste.

## Resultado

O ImobiFlow avanca da etapa de financeiro interno para a etapa de integracao bancaria preparada:

```txt
empresa
↓
gateway configurado
↓
cobranca vinculada ao gateway
↓
proxima etapa: emitir PIX/boleto real
↓
webhook confirma pagamento
```

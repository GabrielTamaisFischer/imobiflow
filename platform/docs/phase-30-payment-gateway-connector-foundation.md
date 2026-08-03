# Fase 30 - Fundacao de conectores de gateway financeiro

## Objetivo

Esta fase separa a regra de integracao bancaria da rota financeira.

Antes, a acao de preparar gateway montava o payload diretamente no endpoint. Agora existe uma camada de servico dedicada para provedores financeiros.

## Servico criado

```txt
backend/src/services/payment-gateways.ts
```

Responsabilidades:

- receber uma cobranca financeira;
- receber a conta de gateway da imobiliaria;
- normalizar o payload de emissao;
- resolver referencia de credencial em ambiente seguro;
- identificar provedor suportado;
- devolver status tecnico do conector;
- impedir retorno falso de dados bancarios.

## Provedores previstos

O servico reconhece como provedores com adaptador planejado:

- Asaas;
- PJBank;
- Iugu;
- Mercado Pago;
- Stripe.

Provedores manuais ou customizados continuam possiveis, mas retornam status de adaptador nao habilitado.

## Resolucao de credenciais

O campo `credentials_ref` da conta de gateway pode apontar para uma variavel de ambiente:

```txt
ASAAS_API_KEY
vercel:ASAAS_API_KEY
vault:ASAAS_API_KEY
```

O backend extrai o nome final e busca em:

```txt
process.env
```

Nenhuma credencial real e enviada para o frontend.

## Status do conector

O metadata da cobranca agora registra:

```txt
connector_status
```

Valores possiveis:

```txt
ready_for_credentials
credentials_missing
adapter_not_enabled
```

## Sem dados ficticios

Mesmo quando existe credencial configurada, esta fase ainda nao chama a API externa.

O campo permanece:

```txt
real_api_call = false
```

Isso evita gerar PIX, boleto, link ou linha digitavel falsos.

## Proxima fase

A proxima fase natural e implementar o primeiro adaptador real.

Sugestao:

```txt
Asaas
```

Motivo:

- PIX e boleto;
- webhooks;
- API REST;
- bom encaixe para a operacao piloto.

Quando o adaptador real for ativado, o fluxo esperado sera:

```txt
Cobrança ImobiFlow
↓
Payload normalizado
↓
Conector Asaas/PJBank/Iugu
↓
API externa
↓
Retorno real do provedor
↓
financial_charges atualizado com QR Code, link ou boleto real
↓
Webhook confirma pagamento
```

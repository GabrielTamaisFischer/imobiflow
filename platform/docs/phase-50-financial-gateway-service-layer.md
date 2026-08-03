# Fase 50 - Camada de servico dos gateways financeiros

## Objetivo

Criar a camada comum de servico dos gateways financeiros do ImobiFlow.

A Fase 49 preparou o banco para conexoes e logs de gateway. A Fase 50 cria a interface tecnica que o backend deve usar para conversar com provedores externos sem espalhar regras especificas de cada provedor pelo sistema.

## Arquitetura criada

Foi adicionada a pasta:

```txt
backend/src/services/financial-gateways
```

Com os arquivos:

```txt
types.ts
errors.ts
manual-gateway.ts
registry.ts
index.ts
```

## Interface comum

Todo conector financeiro deve implementar:

```txt
createCharge
cancelCharge
getCharge
createTransfer
verifyWebhook
normalizeWebhookEvent
healthcheck
```

Isso permite que o restante do produto trabalhe com uma camada padronizada, independentemente do provedor usado pela imobiliaria.

## Provedores preparados

A tipagem ja considera:

```txt
asaas
pjbank
iugu
mercado_pago
stripe
manual
other
```

O provedor real sera escolhido pela conexao ativa da empresa em `financial_gateway_connections`.

## Conector manual

Foi criado um conector `manual`.

Ele existe para permitir operacao assistida e desenvolvimento seguro antes da ativacao de um gateway real.

Importante:

- ele nao confirma pagamento automaticamente;
- ele nao executa repasse automatico;
- ele nao simula dinheiro real;
- ele apenas cria uma referencia operacional manual;
- ele permite healthcheck positivo para ambiente assistido;
- ele normaliza payloads manuais quando necessario.

## Por que isso e importante

Sem uma camada comum, cada tela ou endpoint acabaria falando diretamente com APIs diferentes:

```txt
Financeiro -> Asaas
Financeiro -> PJBank
Financeiro -> Iugu
Financeiro -> Mercado Pago
```

Isso deixaria o sistema dificil de manter.

Com a camada comum:

```txt
Financeiro
↓
FinancialGatewayConnector
↓
Provider especifico
```

O produto ganha:

- manutencao mais simples;
- troca de provedor com menor impacto;
- testes mais seguros;
- idempotencia padronizada;
- webhooks normalizados;
- auditoria mais consistente;
- menor risco de misturar regras de tenants diferentes.

## Tipos principais

Foram definidos tipos para:

- provedor;
- ambiente;
- metodo de pagamento;
- status de cobranca;
- status de repasse;
- pagador;
- endereco;
- criacao de cobranca;
- resultado de cobranca;
- cancelamento de cobranca;
- criacao de transferencia;
- resultado de transferencia;
- verificacao de webhook;
- evento normalizado;
- healthcheck.

## Registro de conectores

O arquivo `registry.ts` permite:

```txt
registerFinancialGatewayConnector
getFinancialGatewayConnector
listFinancialGatewayProviders
```

O conector manual ja fica registrado por padrao.

Quando um provedor real for implementado, ele deve ser registrado nessa camada.

## Regras de seguranca

A camada de gateway nao deve:

- receber dados de outra empresa;
- expor tokens no frontend;
- armazenar segredo em texto puro;
- confirmar pagamentos sem webhook validado;
- executar repasses sem trilha de auditoria;
- ignorar idempotencia em operacoes financeiras.

## Fluxo futuro de cobranca

```txt
Usuario cria cobranca
↓
Backend identifica company_id
↓
Backend carrega gateway default da empresa
↓
Backend seleciona conector pelo provider
↓
Conector cria PIX/boleto no gateway
↓
Sistema registra financial_gateway_requests
↓
Sistema atualiza financial_charges
↓
Gateway envia webhook
↓
Sistema normaliza evento
↓
Sistema baixa pagamento
↓
Sistema concilia financeiro
```

## Fluxo futuro de webhook

```txt
Gateway envia webhook
↓
Backend seleciona conector
↓
Conector valida assinatura
↓
Conector normaliza payload
↓
Sistema salva financial_webhook_events
↓
Sistema atualiza cobranca
↓
Sistema calcula comissao e repasse
↓
Sistema registra auditoria
```

## Proxima etapa

Implementar endpoints de gerenciamento:

```txt
GET /finance/gateways
POST /finance/gateways
POST /finance/gateways/:id/healthcheck
POST /finance/gateways/:id/activate
POST /finance/gateways/:id/deactivate
GET /finance/gateways/requests
```

Depois disso, implementar o primeiro provedor real em sandbox.

## Macroetapas restantes

Apos esta fase, restam aproximadamente 8 macroetapas para uma versao 100% completa:

1. Endpoints e tela de gateways financeiros.
2. Primeiro provedor real em sandbox.
3. Portais do proprietario e inquilino.
4. Contratos e assinatura digital.
5. Vistoria inteligente completa.
6. Automacoes WhatsApp e IA imobiliaria em producao.
7. Mobile/PWA, offline e operacao piloto.
8. Hardening final, LGPD, auditoria, custos por tenant e homologacao.

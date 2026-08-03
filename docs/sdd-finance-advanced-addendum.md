# Adendo SDD - Financeiro avancado, taxas, piloto e custos por tenant

## Objetivo

Este adendo consolida as regras complementares do modulo financeiro avancado do ImobiFlow.

O modulo deve transformar o produto em um ERP imobiliario completo, com cobranca, PIX, boleto, confirmacao automatica, comissao, repasse, inadimplencia, notificacoes, auditoria, automacoes e integracao bancaria por API/webhook.

## Gateways financeiros

O sistema deve estar preparado para provedores como PJBank, Asaas, Iugu, Mercado Pago, Stripe e outros gateways compativeis com API REST e webhooks.

As integracoes devem permitir:

- emitir boletos;
- gerar PIX com QR Code e copia e cola;
- cancelar cobrancas;
- gerar segunda via;
- consultar status;
- receber webhooks;
- calcular taxas;
- preparar repasse automatico;
- evoluir para split financeiro.

## Boleto e compensacao bancaria

Boleto bancario nao pode ser tratado como liquidado imediatamente apos pagamento pelo inquilino.

Fluxo correto:

```txt
Boleto gerado
↓
Inquilino realiza pagamento
↓
Banco processa compensacao
↓
Gateway envia webhook
↓
Sistema confirma pagamento
↓
Financeiro atualizado
```

Enquanto nao houver confirmacao oficial do gateway, o status deve permanecer como `processing` ou `waiting_compensation`.

## PIX integrado

PIX deve ser priorizado operacionalmente por permitir confirmacao quase instantanea, melhor conciliacao e menor inadimplencia.

Cada PIX deve conter:

- QR Code;
- copia e cola;
- valor;
- vencimento;
- identificacao da cobranca;
- status em tempo real.

## Taxas operacionais

O sistema deve permitir taxas por boleto, PIX ou emissao financeira. O valor inicial de referencia para boleto e:

```txt
R$ 3,79 por boleto emitido
```

## Responsavel pela taxa

O sistema nao deve adicionar taxa ao inquilino ou proprietario sem configuracao explicita.

Responsaveis possiveis:

- imobiliaria;
- inquilino;
- proprietario.

Caso a taxa seja atribuida ao inquilino ou proprietario, o sistema deve exigir:

- aceite contratual;
- referencia documental;
- registro de usuario;
- data e hora;
- IP;
- auditoria;
- historico de alteracoes.

## Transparencia

Taxas repassadas devem aparecer separadas do aluguel.

Exemplo:

```txt
Aluguel: R$ 3.000,00
Taxa operacional: R$ 3,79
Total: R$ 3.003,79
```

## Comissao e repasse

Cada contrato deve permitir comissao percentual ou fixa, personalizada por contrato, imovel, proprietario ou regra comercial.

O repasse liquido ao proprietario deve considerar aluguel, comissao, taxas, despesas, manutencoes, retencoes e ajustes financeiros.

## Webhooks e auditoria

Eventos esperados:

- `payment.created`
- `payment.pending`
- `payment.received`
- `payment.confirmed`
- `payment.overdue`
- `payment.cancelled`
- `payment.refunded`
- `pix.received`
- `boleto.paid`
- `transfer.completed`
- `transfer.failed`

Toda movimentacao financeira deve gerar log. Nenhuma cobranca paga ou movimentacao financeira deve ser apagada definitivamente.

## Portais

O Portal do Proprietario deve mostrar repasses, descontos, taxas, comprovantes, previsoes, comissoes e valor liquido.

O Portal do Inquilino deve mostrar cobrancas, boleto, PIX, segunda via, historico, recibos e status.

## Notificacoes e inadimplencia

A regua inicial deve contemplar:

- 3 dias antes: lembrete amigavel;
- no vencimento: aviso automatico;
- 3 dias apos vencimento: cobranca leve;
- 7 dias apos vencimento: cobranca firme;
- 15 dias apos vencimento: alerta critico.

## Multiempresa

Toda entidade operacional deve ser multiempresa desde o inicio, usando vinculo com a imobiliaria. No codigo atual o identificador padrao e `company_id`.

Entidades que devem conter vinculo:

- imoveis;
- contratos;
- pagamentos;
- cobrancas;
- usuarios;
- leads;
- mensagens;
- repasses;
- vistorias;
- financeiro;
- automacoes.

## Operacao piloto

A primeira operacao oficial sera a imobiliaria da mae do desenvolvedor, como ambiente beta real.

Plano piloto:

```txt
ImobiFlow Enterprise Completo
R$ 497/mes
```

Escopo do piloto:

- CRM;
- vistoria inteligente;
- contratos;
- assinatura digital;
- financeiro;
- boletos;
- PIX;
- repasse automatico;
- automacoes;
- IA;
- WhatsApp;
- dashboards;
- ranking;
- captacao;
- locacao.

## Controle interno de custos por imobiliaria

O painel administrativo do ImobiFlow deve medir custo operacional por tenant:

- armazenamento;
- fotos;
- PDFs;
- IA;
- mensagens WhatsApp;
- cobrancas;
- PIX;
- usuarios ativos;
- consumo de API;
- custo estimado;
- margem real.

Objetivo:

- evitar prejuizo operacional;
- validar margem;
- definir precificacao futura;
- controlar clientes de alto consumo;
- escalar o SaaS com saude financeira.

## Resultado esperado

O ImobiFlow deve evoluir de CRM para:

```txt
ERP imobiliario completo
+
financeiro automatizado
+
motor operacional imobiliario
```

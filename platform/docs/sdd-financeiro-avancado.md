# Modulo Financeiro Avancado - Cobranca, PIX, Boleto, Comissao e Repasse Automatico

## 1. Objetivo do modulo

O modulo financeiro avancado do ImobiFlow sera responsavel por automatizar todo o processo de cobranca de aluguel, recebimento de pagamentos, calculo da comissao da imobiliaria, separacao de taxas, controle de inadimplencia e repasse automatico ao proprietario.

Esse modulo tem como objetivo eliminar controles manuais, planilhas, conferencias bancarias e erros operacionais, permitindo que a imobiliaria gerencie toda a operacao financeira da locacao dentro do sistema.

O funcionamento sera semelhante a plataformas imobiliarias que integram com bancos/gateways como PJBank, Asaas, Iugu, Mercado Pago ou outros provedores financeiros capazes de emitir boletos, gerar cobrancas PIX, receber pagamentos e enviar notificacoes por webhook.

## 2. Fluxo geral da cobranca

```txt
Contrato de locacao ativo
↓
Sistema identifica data de vencimento do aluguel
↓
Gera cobranca automaticamente
↓
Inquilino recebe boleto e/ou PIX
↓
Inquilino realiza pagamento
↓
Banco/gateway confirma pagamento por webhook
↓
Sistema atualiza status financeiro
↓
Sistema calcula comissao da imobiliaria
↓
Sistema desconta taxas operacionais, se aplicavel
↓
Sistema calcula valor liquido do proprietario
↓
Sistema agenda ou executa repasse
↓
Sistema gera comprovante e historico
```

## 3. Integracao com banco/gateway de pagamento

O sistema devera ser preparado para integracao com bancos ou gateways financeiros, como PJBank, Asaas, Iugu, Mercado Pago, Stripe ou outro provedor compativel com API e webhook.

A integracao devera permitir emissao de boleto bancario, geracao de cobranca PIX, QR Code PIX, codigo PIX copia e cola, confirmacao automatica de pagamento, consulta de status da cobranca, cancelamento de cobranca, segunda via, eventos por webhook, separacao de valores para comissao e repasse, registro de taxas bancarias e historico financeiro completo.

## 4. Boleto bancario

Cada boleto devera conter nome e documento do inquilino, endereco do imovel locado, valor do aluguel, taxas adicionais, vencimento, juros, multa, desconto, codigo de barras, linha digitavel, status da cobranca, link de pagamento e PDF.

O boleto nao deve ser considerado pago imediatamente apos o inquilino realizar o pagamento. O sistema deve considerar que boletos podem levar ate 3 dias uteis para compensacao, dependendo do banco/gateway.

```txt
Boleto gerado
↓
Aguardando pagamento
↓
Pagamento realizado pelo inquilino
↓
Aguardando compensacao bancaria
↓
Pagamento confirmado pelo gateway
↓
Cobranca marcada como paga
```

Enquanto o gateway nao confirmar o pagamento via webhook, o sistema deve manter a cobranca como processando ou aguardando compensacao.

## 5. PIX

O PIX sera uma das formas principais de pagamento, pois permite confirmacao quase instantanea.

Cada cobranca PIX devera gerar QR Code PIX, codigo copia e cola, vencimento, valor, identificacao do contrato, identificacao do imovel, identificacao do inquilino e status em tempo real.

```txt
Sistema gera cobranca PIX
↓
Inquilino paga
↓
Gateway confirma em segundos
↓
Webhook e enviado ao ImobiFlow
↓
Sistema marca como pago
↓
Sistema calcula comissao e repasse
↓
Sistema atualiza financeiro automaticamente
```

O PIX devera ter prioridade dentro da experiencia do usuario, pois reduz atraso, melhora a conciliacao financeira e evita o problema de compensacao demorada do boleto.

## 6. Taxa de boleto ou taxa operacional

O sistema devera permitir configurar uma taxa por boleto ou por cobranca gerada. Essa taxa podera ser paga pela imobiliaria ou pelo inquilino.

### Taxa paga pela imobiliaria

```txt
Aluguel: R$ 3.000,00
Comissao imobiliaria: 10% = R$ 300,00
Taxa boleto: R$ 3,49

Proprietario recebe:
R$ 3.000,00 - R$ 300,00 - R$ 3,49 = R$ 2.696,51
```

### Taxa paga pelo inquilino

```txt
Aluguel: R$ 3.000,00
Taxa boleto: R$ 3,49

Valor cobrado do inquilino:
R$ 3.003,49

Comissao imobiliaria:
R$ 300,00

Proprietario recebe:
R$ 2.700,00
```

O sistema devera permitir configurar essa regra por contrato, por imovel ou de forma global pela imobiliaria.

## 7. Comissao da imobiliaria

Cada contrato de locacao devera ter uma regra de comissao administrativa configuravel. A comissao podera ser percentual sobre o aluguel, valor fixo, percentual por imovel, percentual por proprietario, percentual por contrato, comissao sobre aluguel ou comissao sobre taxas adicionais, se configurado.

```txt
Aluguel: R$ 3.500,00
Taxa administrativa: 8%

Comissao da imobiliaria:
R$ 280,00

Repasse bruto ao proprietario:
R$ 3.220,00
```

O sistema devera armazenar a comissao separadamente para relatorios financeiros, dashboard, controle de faturamento e historico da imobiliaria.

## 8. Repasse automatico ao proprietario

Apos a confirmacao do pagamento, o sistema devera calcular automaticamente o valor liquido a ser repassado ao proprietario.

O calculo deve considerar valor do aluguel, comissao da imobiliaria, taxa de boleto/PIX, despesas vinculadas ao imovel, descontos, juros, multa, valores adicionais, retencoes e ajustes manuais autorizados.

```txt
Valor liquido do proprietario =
Valor pago pelo inquilino
- comissao da imobiliaria
- taxas operacionais
- despesas/descontos vinculados
```

```txt
Valor pago: R$ 4.000,00
Comissao imobiliaria: 10% = R$ 400,00
Taxa boleto: R$ 3,49
Manutencao descontada: R$ 150,00

Repasse proprietario:
R$ 3.446,51
```

O sistema devera registrar todos os detalhes do calculo para auditoria.

## 9. Status financeiros

```txt
Pendente
Aguardando pagamento
Processando
Aguardando compensacao
Pago
Vencido
Cancelado
Estornado
Falhou
Em disputa
Repasse pendente
Repasse realizado
```

Esses status devem atualizar automaticamente com base nos eventos recebidos do gateway financeiro.

## 10. Webhooks

O backend do ImobiFlow devera possuir endpoints seguros para receber webhooks do gateway financeiro.

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

Ao receber um webhook, o sistema devera validar autenticidade do evento, identificar a cobranca, contrato e inquilino, atualizar o status do pagamento, calcular comissao, calcular repasse, atualizar dashboard, gerar comprovantes e enviar notificacoes.

## 11. Seguranca e auditoria

Toda movimentacao financeira devera gerar logs com usuario responsavel, data e horario, evento recebido, ID da cobranca no gateway, ID interno da cobranca, valor bruto, valor liquido, comissao, taxa, proprietario, contrato, status anterior e novo status.

Nenhuma cobranca paga podera ser apagada definitivamente. O sistema podera permitir cancelamento ou estorno, mas devera preservar o historico.

## 12. Portal do proprietario

O proprietario devera visualizar imoveis vinculados, alugueis recebidos, repasses pendentes, repasses realizados, descontos aplicados, comissao da imobiliaria, taxas, comprovantes, historico financeiro e previsao de proximos recebimentos.

```txt
Aluguel recebido: R$ 3.000,00
Comissao imobiliaria: -R$ 300,00
Taxa operacional: -R$ 3,49
Valor liquido: R$ 2.696,51
Status: Repasse realizado
```

## 13. Portal do inquilino

O inquilino devera visualizar cobrancas, pagar via PIX, baixar boleto, copiar codigo PIX, solicitar segunda via, visualizar status do pagamento, baixar recibos, consultar historico de pagamentos e receber avisos de vencimento.

## 14. Notificacoes automaticas

O sistema devera notificar o inquilino sobre cobranca gerada, boleto disponivel, PIX disponivel, lembretes antes do vencimento, cobranca vencida, pagamento confirmado e recibo disponivel.

O proprietario devera ser notificado sobre aluguel recebido, repasse calculado, repasse realizado e comprovante disponivel.

A imobiliaria devera ser notificada sobre pagamento recebido, boleto vencido, PIX confirmado, repasse pendente, falha no repasse e inadimplencia.

## 15. Regras de inadimplencia

Caso a cobranca venca e nao seja paga, o sistema devera alterar status para vencido, calcular multa, calcular juros diarios, gerar segunda via, notificar o inquilino, alertar a imobiliaria, criar tarefa de cobranca, exibir no dashboard financeiro e permitir regua automatica de cobranca.

```txt
3 dias antes do vencimento: lembrete amigavel
No dia do vencimento: aviso de vencimento
3 dias apos vencimento: cobranca leve
7 dias apos vencimento: cobranca firme
15 dias apos vencimento: alerta critico para imobiliaria
```

## 16. Dashboard financeiro

O dashboard financeiro devera exibir total recebido no mes, total pendente, total vencido, total de comissoes da imobiliaria, total a repassar, total ja repassado, inadimplencia, quantidade de boletos gerados, quantidade de PIX pagos, tempo medio de compensacao, imoveis com maior inadimplencia e proprietarios com repasses pendentes.

## 17. Estrutura tecnica sugerida

Tabelas principais:

```txt
payments
charges
transfers
commissions
repasse
owners
tenants
rental_contracts
financial_transactions
webhook_events
payment_gateway_accounts
```

Entidade `charges`:

```txt
id
contract_id
tenant_id
property_id
owner_id
gateway_charge_id
payment_method
gross_amount
fee_amount
commission_amount
net_owner_amount
due_date
paid_at
status
created_at
updated_at
```

Entidade `repasse`:

```txt
id
owner_id
contract_id
charge_id
gross_amount
commission_amount
fees_amount
discounts_amount
net_amount
scheduled_date
paid_at
status
gateway_transfer_id
created_at
updated_at
```

## 18. Regra essencial

O sistema nao deve depender de conferencia manual para identificar pagamentos.

Toda confirmacao de pagamento deve ocorrer por integracao automatica via webhook.

A conferencia manual podera existir apenas como recurso administrativo de excecao, com registro obrigatorio de auditoria.

## 19. Resultado esperado

Com esse modulo, o ImobiFlow passa a controlar todo o ciclo financeiro da locacao:

```txt
cobranca
↓
pagamento
↓
confirmacao
↓
comissao
↓
repasse
↓
comprovante
↓
historico
```

Esse recurso aumenta o valor percebido do sistema, melhora a retencao dos clientes, reduz erros operacionais e torna o ImobiFlow uma plataforma imobiliaria completa, capaz de competir com ERPs imobiliarios profissionais.

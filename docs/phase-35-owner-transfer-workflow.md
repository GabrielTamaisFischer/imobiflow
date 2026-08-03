# Fase 35 - Repasses ao proprietario

## Objetivo

Esta fase transforma o repasse ao proprietario em um fluxo operacional visivel no produto.

Depois da cobranca ser paga e o webhook financeiro aprovar o repasse, a equipe da imobiliaria passa a conseguir:

- listar repasses pendentes;
- visualizar valor bruto, descontos e valor liquido;
- confirmar pagamento do repasse;
- registrar forma de pagamento;
- registrar referencia ou autenticacao do comprovante;
- registrar link externo do comprovante, quando existir;
- manter auditoria financeira.

## Estrutura de banco

A tabela `owner_transfers` recebeu campos para comprovante e conciliacao:

```txt
payment_method
receipt_url
receipt_reference
gateway_transfer_id
metadata
```

Tambem foram criados indices para:

- consulta por repasses pagos;
- evitar duplicidade futura de transferencias via gateway.

## Backend

Novos endpoints:

```txt
GET /finance/owner-transfers
POST /finance/owner-transfers/:id/confirm-payment
```

O endpoint de confirmacao:

1. valida empresa e permissao;
2. impede confirmar repasse ja pago ou cancelado;
3. marca o repasse como `paid`;
4. registra data de pagamento;
5. salva metodo e comprovante;
6. atualiza a cobranca vinculada para `transferred`;
7. cria log em `financial_audit_logs`.

## Frontend

O modulo Financeiro passa a carregar e exibir uma secao:

```txt
Repasses ao proprietario
```

Cada card mostra:

- proprietario, imovel ou contrato vinculado;
- previsao de repasse;
- valor bruto;
- descontos;
- valor liquido;
- status;
- formulario de confirmacao;
- comprovante quando informado.

## Regras importantes

Confirmar repasse manualmente continua sendo uma excecao administrativa auditada.

O fluxo ideal futuro sera:

```txt
pagamento confirmado
↓
repasse aprovado
↓
gateway executa transferencia
↓
webhook confirma transferencia
↓
repasse vira pago automaticamente
```

## Resultado

O financeiro passa a cobrir mais uma parte critica do SDD:

```txt
cobranca
↓
pagamento
↓
comissao
↓
repasse ao proprietario
↓
comprovante
↓
auditoria
```

## Proxima fase sugerida

Adicionar notificacao do proprietario para:

- repasse calculado;
- repasse pendente;
- repasse realizado;
- comprovante disponivel.

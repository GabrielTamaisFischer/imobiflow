# Fase 46 - Reprocessamento financeiro de webhooks

## Objetivo

Transformar o reprocessamento de webhooks financeiros em uma acao operacional real dentro do ImobiFlow, permitindo que eventos salvos em `financial_webhook_events` sejam processados novamente com seguranca quando houver falha, atraso de gateway, conciliacao pendente ou necessidade de ajuste operacional.

Esta fase complementa o painel financeiro operacional criado nas fases anteriores. Antes, o painel permitia solicitar o reprocesso. Agora, o sistema tambem executa o reprocessamento e atualiza as entidades financeiras vinculadas.

## Escopo implementado

- Criacao de endpoint autenticado para executar reprocessamento de webhook financeiro.
- Validacao por permissao `finance.manage`.
- Reprocessamento idempotente baseado no evento salvo.
- Localizacao da cobranca por `charge_id` interno ou `gateway_charge_id`.
- Normalizacao de status financeiro recebido do gateway.
- Atualizacao segura da cobranca vinculada.
- Marcacao de entrada financeira como paga quando aplicavel.
- Registro de pagamento financeiro quando o evento representa pagamento confirmado.
- Atualizacao de comissoes pendentes vinculadas.
- Atualizacao de repasses pendentes ao proprietario quando a cobranca foi liquidada.
- Fechamento automatico de acoes operacionais abertas do tipo `webhook_reprocess_requested`.
- Registro de auditoria financeira do reprocessamento.
- Botao para reprocessar webhook diretamente no painel de webhooks.
- Botao para reprocessar a partir da acao operacional aberta.

## Regras de negocio

O reprocessamento respeita a regra central do financeiro:

```txt
Webhook recebido
↓
Evento salvo
↓
Operador solicita ou executa reprocesso
↓
Sistema localiza cobranca
↓
Sistema valida status recebido
↓
Sistema atualiza cobranca e registros vinculados
↓
Sistema registra auditoria
↓
Acao operacional e encerrada
```

O sistema nao deve depender de conferencia manual para reconhecer pagamentos. A conferencia manual continua sendo apenas uma excecao administrativa, com trilha de auditoria.

## Idempotencia

O reprocessamento foi desenhado para nao duplicar pagamentos quando o mesmo webhook for executado mais de uma vez.

Para isso:

- o evento financeiro e preservado em `financial_webhook_events`;
- o pagamento usa `gateway_payment_id` derivado do evento do gateway;
- erros de duplicidade sao tratados como execucao ja processada;
- o status anterior e o novo status sao registrados;
- o resultado do reprocessamento e salvo em `metadata.reprocess_execution`.

## Atualizacoes financeiras

Quando o webhook indica pagamento confirmado, o sistema pode atualizar:

- `financial_charges`;
- `financial_entries`;
- `financial_payments`;
- `commissions`;
- `owner_transfers`;
- `financial_operation_actions`;
- `financial_audit_logs`.

Quando a cobranca possui proprietario vinculado e o pagamento foi confirmado, o status operacional pode avancar para `transfer_pending`, mantendo o fluxo de repasse ao proprietario visivel no painel financeiro.

## Interface

Foram adicionadas duas acoes no painel financeiro:

- `Reprocessar agora`, dentro da lista de webhooks recentes.
- `Reprocessar`, dentro da lista de acoes operacionais abertas.

Essas acoes chamam o backend real e deixam de ser apenas marcadores administrativos.

## Segurança

O endpoint exige:

- usuario autenticado;
- empresa vinculada;
- permissao `finance.manage`;
- evento pertencente a mesma empresa;
- cobranca pertencente a mesma empresa.

Toda execucao gera log de auditoria financeira.

## Arquivos alterados

- `backend/src/routes/finance.ts`
- `src/product/finance.ts`
- `src/routes/app.financeiro.tsx`

## Proxima etapa sugerida

A proxima fase do SDD deve seguir para conciliacao financeira mais ampla:

- tela dedicada de conciliacao;
- filtros por gateway, status, metodo e periodo;
- reconciliacao entre cobranca, pagamento, comissao e repasse;
- alertas de divergencia;
- aprovacao operacional de repasse;
- preparacao para integracao real com gateway financeiro.

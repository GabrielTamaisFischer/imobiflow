# Fase 48 - Motor de conciliacao financeira

## Objetivo

Criar a base do motor de conciliacao financeira do ImobiFlow, responsavel por executar varreduras sobre cobrancas, pagamentos, webhooks, comissoes e repasses para identificar divergencias financeiras de forma auditavel.

A Fase 47 criou a estrutura dos itens de conciliacao. A Fase 48 adiciona o conceito de execucao de conciliacao, permitindo que cada analise tenha historico, periodo, origem, status, totais e rastreabilidade.

## Por que isso e necessario

Em uma imobiliaria real, a conciliacao nao deve ser apenas uma lista estatica de problemas. Ela precisa responder perguntas operacionais:

- Quando a ultima conciliacao foi executada?
- Quem executou?
- Qual periodo foi analisado?
- Quantas cobrancas foram avaliadas?
- Quantos pagamentos foram encontrados?
- Quantos webhooks entraram no periodo?
- Quantas divergencias criticas existem?
- Qual valor total esta divergente?
- O problema ja foi resolvido ou ignorado com justificativa?

Sem esse historico, a imobiliaria perde confianca no financeiro e volta a depender de planilhas.

## Nova tabela

Foi criada a tabela:

```txt
financial_reconciliation_runs
```

Ela registra cada execucao do motor de conciliacao.

## Campos principais

```txt
id
company_id
requested_by
period_start
period_end
status
source
total_charges
total_payments
total_webhooks
total_items
total_attention
total_critical
total_resolved
total_ignored
total_difference_amount_cents
started_at
finished_at
error_message
metadata
created_at
updated_at
```

## Vinculo com divergencias

A tabela `financial_reconciliation_items` passa a ter:

```txt
reconciliation_run_id
```

Com isso, cada divergencia pode ser ligada a uma execucao especifica.

## Status da execucao

```txt
running
completed
failed
cancelled
```

Descricao:

- `running`: conciliacao em andamento.
- `completed`: conciliacao concluida com sucesso.
- `failed`: conciliacao falhou e deve exibir erro.
- `cancelled`: execucao cancelada administrativamente.

## Origem da execucao

```txt
manual
scheduled
webhook
system
```

Descricao:

- `manual`: usuario disparou pelo painel financeiro.
- `scheduled`: rotina agendada executou automaticamente.
- `webhook`: evento de gateway disparou verificacao.
- `system`: sistema executou por regra interna.

## Fluxo operacional

```txt
Usuario acessa Financeiro
↓
Clica em rodar conciliacao
↓
Sistema cria financial_reconciliation_runs
↓
Sistema varre cobrancas, pagamentos, webhooks, comissoes e repasses
↓
Sistema cria ou atualiza financial_reconciliation_items
↓
Sistema calcula totais da execucao
↓
Sistema marca run como completed
↓
Painel exibe resumo e divergencias
```

## Regras de idempotencia

O motor deve evitar duplicar divergencias abertas.

Regras:

- divergencias abertas do mesmo tipo e mesma cobranca devem ser reutilizadas;
- divergencias abertas do mesmo tipo e mesmo webhook devem ser reutilizadas;
- divergencias resolvidas permanecem no historico;
- uma nova execucao pode apontar novamente para um problema recorrente;
- toda resolucao deve registrar usuario, data e justificativa quando necessario.

## Casos iniciais que o motor deve detectar

### Cobranca paga sem pagamento registrado

Detectar quando `financial_charges.status` indica pagamento ou repasse pendente, mas nao existe registro em `financial_payments`.

### Pagamento confirmado sem baixa da cobranca

Detectar quando existe pagamento confirmado, mas a cobranca permanece pendente, vencida ou em compensacao.

### Webhook sem cobranca vinculada

Detectar quando `financial_webhook_events.charge_id` esta vazio e o gateway informou identificador externo sem match interno.

### Pagamento confirmado sem comissao

Detectar quando a cobranca foi liquidada, mas nao existe comissao vinculada ao contrato/cobranca.

### Pagamento confirmado sem repasse

Detectar quando a cobranca foi paga e existe proprietario vinculado, mas nenhum repasse foi criado.

### Divergencia de valores

Detectar diferenca entre valor da cobranca, valor do pagamento, comissao esperada e repasse liquido calculado.

## Indicadores esperados no painel

O dashboard de conciliacao deve apresentar:

- ultima conciliacao;
- status da ultima conciliacao;
- periodo analisado;
- divergencias criticas;
- divergencias de atencao;
- valor total divergente;
- pagamentos sem baixa;
- webhooks sem vinculo;
- repasses travados;
- tempo desde a ultima conciliacao.

## Seguranca

Todas as execucoes sao isoladas por `company_id`.

O motor nunca deve analisar dados de outra imobiliaria, mesmo em rotinas agendadas.

## Auditoria

Cada execucao deve deixar rastros suficientes para auditoria:

- quem disparou;
- quando iniciou;
- quando terminou;
- quantos registros analisou;
- quais divergencias criou;
- quais divergencias foram resolvidas;
- erro, caso tenha falhado.

## Proxima implementacao

Quando o executor de comandos estiver estavel, a proxima etapa tecnica e implementar:

```txt
GET /finance/reconciliation
POST /finance/reconciliation/run
POST /finance/reconciliation/items/:id/resolve
POST /finance/reconciliation/items/:id/ignore
```

E adicionar no modulo Financeiro:

```txt
Aba Conciliação
Cards de resumo
Tabela de divergencias
Botao Rodar conciliacao
Acoes Resolver / Ignorar / Reprocessar
```

## Macroetapas restantes

Apos esta fase, restam aproximadamente 10 macroetapas para a versao 100% completa do sistema.

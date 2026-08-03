# Fase 26 - Eventos automaticos de custo operacional

## Objetivo

Esta fase conecta o controle interno de custos por imobiliaria aos fluxos reais do produto.

Antes desta etapa, o painel de custos ja possuia estrutura, catalogo e endpoints, mas dependia de registros manuais. Agora o backend passa a registrar eventos de consumo automaticamente quando a operacao gera recursos que impactam o custo do SaaS.

## Servico central

Foi criado o servico:

```txt
backend/src/services/usage-costs.ts
```

Responsabilidades:

- localizar a metrica ativa no catalogo `cost_catalog_items`;
- calcular custo unitario e custo total;
- inserir evento em `tenant_usage_events`;
- vincular evento ao `company_id`;
- armazenar origem, entidade relacionada e metadados de auditoria;
- nao bloquear a operacao principal caso o registro de custo falhe.

## Eventos registrados automaticamente

### Financeiro

Ao criar uma cobranca a partir de contrato:

```txt
charge_generated
```

Se a forma de pagamento possuir PIX:

```txt
pix_generated
```

Se a forma de pagamento possuir boleto:

```txt
boleto_generated
```

Origem:

```txt
finance_charge_created
```

### Notificacoes financeiras

Ao preparar uma notificacao via WhatsApp para uma cobranca:

```txt
whatsapp_message
```

Origem:

```txt
finance_notification_prepared
```

Observacao: nesta fase o evento representa a mensagem preparada pelo sistema. Quando houver provedor real de envio, o mesmo fluxo podera ser ajustado para contabilizar apenas mensagens efetivamente enviadas.

### Vistoria inteligente

Ao gerar PDF de vistoria:

```txt
pdf_generated
```

Origem:

```txt
inspection_pdf_generated
```

Ao registrar uma foto de vistoria:

```txt
photo_upload
```

Origem:

```txt
inspection_media_registered
```

Ao registrar midia com tamanho conhecido:

```txt
storage_mb
```

O calculo usa:

```txt
file_size / 1024 / 1024
```

## Multiempresa

Todos os eventos sao gravados com:

```txt
company_id
```

Isso mantem o isolamento multiempresa e permite calcular margem, custo e consumo por imobiliaria.

## Sem dados ficticios

Nenhum evento artificial foi criado.

O painel `/app/custos` continua iniciando vazio e passa a ser preenchido somente quando houver operacoes reais no sistema.

## Resultado

O ImobiFlow passa a medir custo operacional real por tenant/imobiliaria para:

- cobrancas geradas;
- PIX gerados;
- boletos gerados;
- mensagens WhatsApp preparadas;
- PDFs de vistoria;
- fotos de vistoria;
- armazenamento consumido.

Essa base prepara o SaaS para acompanhar margem real, precificacao futura e consumo da operacao piloto Enterprise.

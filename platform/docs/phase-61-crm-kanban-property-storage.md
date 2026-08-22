# Fase 61 - Kanban do CRM e Storage de Imoveis

## Objetivo

Esta fase avanca dois pontos pendentes do SDD:

- movimentacao real de leads no Kanban do CRM, com historico de mudanca de etapa;
- upload real de midias de imoveis usando Supabase Storage, sem dados ficticios.

## CRM Kanban

Foi criado o endpoint:

```txt
PATCH /crm/leads/:id/stage
```

O endpoint valida:

- autenticacao;
- empresa do usuario;
- assinatura ativa;
- permissao para editar leads;
- se a etapa pertence a mesma `company_id`;
- se o lead pertence a mesma `company_id`.

Quando o lead muda de etapa, o backend:

1. atualiza `leads.stage_id`;
2. grava evento em `lead_events`;
3. registra origem e destino da etapa no payload;
4. devolve o lead atualizado.

No frontend, o CRM agora permite:

- arrastar cards entre colunas;
- mover lead por seletor;
- rollback visual se a API recusar a alteracao;
- abrir WhatsApp via `wa.me` com dados reais do lead.

## Storage de imoveis

Foi criada uma migration para preparar os buckets:

```txt
imobiflow-property-media
imobiflow-property-documents
```

Tambem foram adicionados metadados nas tabelas de arquivos:

- `storage_bucket`;
- `storage_path`;
- `mime_type`;
- `file_size`;
- `is_cover` para midias.

O endpoint criado foi:

```txt
POST /real-estate/properties/:id/media
```

O backend valida:

- se o imovel pertence a empresa do usuario;
- tipo de arquivo permitido;
- tamanho maximo de 10 MB;
- integridade entre `size_bytes` informado e arquivo recebido;
- caminho isolado por `company_id` e `property_id`.

O frontend de imoveis agora permite:

- selecionar foto ou video do imovel;
- enviar para a API;
- marcar a primeira midia como capa;
- atualizar o card do imovel apos upload;
- exibir estado vazio visual quando o imovel ainda nao possui midia.

## Observacoes

As migrations precisam ser aplicadas no Supabase real com credenciais de producao configuradas fora do repositorio. Nenhum dado ficticio foi criado.

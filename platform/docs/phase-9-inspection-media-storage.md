# ImobiFlow - Fase 9: Fotos e anexos de vistorias

## Objetivo desta entrega

Evoluir o módulo de vistorias para aceitar registros fotográficos e anexos vinculados à vistoria, aos ambientes e aos itens técnicos do checklist.

Esta fase prepara a operação para o laudo profissional descrito no SDD: fotos por cômodo, evidências de avarias, anexos técnicos e geração futura de PDF.

## Banco de dados

Migração adicionada:

- `database/migrations/006_inspection_media_storage.sql`

Alterações:

- `inspection_media.file_url` passa a aceitar `null`;
- `inspection_media` recebe campos de Storage:
  - `storage_bucket`;
  - `storage_path`;
  - `file_name`;
  - `mime_type`;
  - `file_size`;
- criação do bucket privado `imobiflow-inspections`;
- políticas RLS em `storage.objects` restringindo acesso pelo primeiro segmento do caminho, que deve ser o `company_id`.

Estrutura esperada de arquivos:

- `{company_id}/inspections/{inspection_id}/{uuid}-{file_name}`

## API

Endpoints adicionados em `backend/src/routes/inspections.ts`:

- `GET /inspections/:id/media`
- `POST /inspections/:id/media`
- `POST /inspections/:id/media/upload-url`

O endpoint `GET /inspections/:id/rooms` agora também retorna:

- `media`

Para arquivos em bucket privado, a API tenta gerar `signed_url` temporária via Supabase Storage.

Todas as rotas continuam protegidas por:

- login válido;
- empresa ativa;
- assinatura ativa;
- permissão `inspections.view` ou `inspections.manage`.

## Interface interna

Tela evoluída:

- `/app/vistorias`

Comportamento:

- cada vistoria mostra uma área de `Fotos e anexos`;
- permite vincular o registro a um ambiente;
- permite vincular o registro a um item técnico;
- permite informar legenda;
- permite anexar imagem/PDF no modo visualização;
- permite registrar URL externa;
- mostra estado vazio quando não há mídia cadastrada.

## Modo visualização

O preview usa `localStorage`:

- `imobiflow.preview.inspection_media`

Quando o usuário escolhe um arquivo no modo visualização, ele é lido no navegador como `data URL`. Isso permite visualizar o comportamento sem enviar arquivo real para produção.

## Observação de implantação

O bucket privado e as políticas RLS foram preparados em migração. Para upload real em produção, a API precisa estar publicada com as variáveis Supabase e o frontend deve usar o fluxo de URL assinada.

## Próxima etapa recomendada

1. Ver `docs/phase-10-inspection-report-detail.md`.
2. Conectar upload real do frontend ao fluxo `createSignedUploadUrl`.
3. Criar geração real de PDF no backend.
4. Criar comparação entrada vs saída.
5. Preparar assinatura digital.

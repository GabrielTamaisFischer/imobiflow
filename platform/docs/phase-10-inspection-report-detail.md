# ImobiFlow - Fase 10: Detalhe da vistoria e base do laudo

## Objetivo desta entrega

Criar uma tela própria para cada vistoria, consolidando dados do imóvel, partes envolvidas, ambientes, checklist técnico, fotos/anexos e preparação para PDF.

Essa fase transforma a vistoria de um card operacional em uma base de laudo profissional.

## API

Endpoint adicionado em `backend/src/routes/inspections.ts`:

- `GET /inspections/:id`

Resposta consolidada:

- `inspection`;
- `rooms`;
- `items`;
- `media`.

O endpoint valida:

- login válido;
- empresa vinculada;
- assinatura ativa;
- permissão `inspections.view`;
- `company_id` da vistoria.

## Interface interna

Rota adicionada:

- `/app/vistorias/$inspectionId`

Comportamento:

- cabeçalho do laudo;
- status da vistoria;
- indicação de PDF em preparação;
- indicadores técnicos;
- resumo técnico;
- partes do laudo;
- ambientes e itens técnicos;
- contagem de reparos, danos, itens verificados e mídias;
- galeria de fotos/anexos;
- checklist de prontidão para PDF;
- ação de impressão do laudo pelo navegador.

## Lista de vistorias

Cada card da tela `/app/vistorias` agora possui ação:

- `Abrir laudo`

## Modo visualização

O detalhe funciona com os dados existentes no `localStorage`:

- vistorias;
- ambientes;
- itens;
- fotos/anexos.

Nenhum dado fictício é criado automaticamente.

## Próxima etapa recomendada

Etapa concluida na Fase 11:

- geracao inicial de PDF no backend;
- salvamento de `pdf_url` na vistoria;
- acao para abrir PDF gerado;
- suporte do fluxo no modo preview.

Proximas evolucoes:

1. Criar modelo visual final do laudo.
2. Preparar assinatura digital das partes.
3. Criar comparacao entrada vs saida.
4. Criar link publico seguro por `public_token`.

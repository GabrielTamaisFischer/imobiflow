# ImobiFlow - Fase 8: Checklist técnico de vistorias

## Objetivo desta entrega

Evoluir o módulo de vistorias para permitir trabalho técnico dentro do laudo: ambientes, itens vistoriados, condição de conservação e marcação de reparo necessário.

## API

Endpoints adicionados em `backend/src/routes/inspections.ts`:

- `PATCH /inspections/:id/rooms/:roomId`
- `PATCH /inspections/:id/items/:itemId`

Endpoints já existentes e agora conectados pela interface:

- `POST /inspections/:id/rooms`
- `POST /inspections/:id/items`
- `GET /inspections/:id/rooms`

Todas as rotas continuam protegidas por:

- login válido;
- empresa ativa;
- assinatura ativa;
- permissão `inspections.manage` ou `inspections.view`.

## Interface interna

Tela evoluída:

- `/app/vistorias`

Comportamento:

- cada vistoria mostra ambientes e itens;
- permite adicionar novo ambiente;
- permite adicionar item técnico a um ambiente;
- permite marcar condição do ambiente;
- permite marcar condição do item;
- permite marcar item com reparo necessário;
- mostra itens sem ambiente quando existirem.

## Modo visualização

O preview usa `localStorage` para ambientes e itens:

- `imobiflow.preview.inspection_rooms`
- `imobiflow.preview.inspection_items`

Isso permite testar a experiência sem criar dados no banco de produção.

## Próxima etapa recomendada

1. Ver `docs/phase-9-inspection-media-storage.md`.
2. Criar visualização detalhada da vistoria.
3. Gerar laudo PDF inicial.
4. Criar comparação entrada vs saída.
5. Preparar assinatura digital.

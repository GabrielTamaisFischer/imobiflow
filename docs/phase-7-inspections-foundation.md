# ImobiFlow - Fase 7: Vistorias inteligentes

## Objetivo desta entrega

Criar a fundação do módulo de vistorias, uma das partes centrais do SDD. A vistoria passa a ter vínculo real com imóveis, estrutura por ambientes, itens, mídias e assinaturas futuras.

## Banco de dados

Migration adicionada:

- `database/migrations/005_inspections_foundation.sql`

Tabelas criadas:

- `inspections`
- `inspection_rooms`
- `inspection_items`
- `inspection_media`
- `inspection_signatures`

Todas as tabelas possuem `company_id` e RLS. As políticas limitam leitura e escrita à empresa retornada por `private.current_company_id()`.

## Permissões

Permissões adicionadas:

- `inspections.sign`
- `inspections.pdf`

As permissões existentes continuam valendo:

- `inspections.view`
- `inspections.manage`

## API

Router criado:

- `backend/src/routes/inspections.ts`

Endpoints:

- `GET /inspections`
- `POST /inspections`
- `GET /inspections/:id/rooms`
- `POST /inspections/:id/rooms`
- `POST /inspections/:id/items`

Todas as rotas privadas passam por:

- login válido;
- empresa ativa;
- assinatura ativa;
- permissão do usuário.

## Interface interna

Tela atualizada:

- `/app/vistorias`

Comportamento:

- inicia vazia;
- exige imóvel para criar vistoria;
- permite criar vistoria de entrada, saída, manutenção ou periódica;
- prepara ambientes padrão: Sala, Cozinha, Quarto, Banheiro e Área de serviço;
- mostra cards de vistoria com status, imóvel, agenda, PDF pendente e ambientes.

## Sem dados fictícios

Não foram criadas vistorias no banco. O modo preview continua local, usando `localStorage`, apenas para visualização do fluxo enquanto o backend real não está publicado.

## Próxima etapa recomendada

1. Adicionar edição de ambientes e itens da vistoria: iniciado em `docs/phase-8-inspection-checklist.md`.
2. Implementar upload de fotos via Supabase Storage.
3. Criar comparação entrada vs saída.
4. Gerar laudo PDF.
5. Preparar assinatura digital e histórico auditável.

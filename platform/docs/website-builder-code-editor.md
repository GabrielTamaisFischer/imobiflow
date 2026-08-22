# Website Builder - Editor de Código

## Objetivo

O Editor de Código é uma área avançada do Website Builder para editar arquivos lógicos do site sem usar `localStorage` como persistência principal.

## Acesso

- Editor visual: `/app/site/builder/editor/:websiteId`
- Editor de código: `/app/site/builder/editor/:websiteId/code`

No editor visual existe um botão visível `Código` com ícone de código na topbar, próximo ao botão `Builder`.

## Layout

A tela de código possui:

- Topbar com voltar ao builder, nome do site, status de salvamento, formatar código, visualizar site e salvar alterações.
- Explorador de arquivos à esquerda em formato de árvore.
- Editor central com Monaco Editor, tema escuro, syntax highlighting, abas, minimap e numeração de linhas.
- Painel direito com dados do arquivo selecionado, reset, copiar conteúdo e aviso de segurança.

## Arquivos obrigatórios

A árvore inclui arquivos estruturais como:

- `website/pages/home/page.json`
- `website/pages/home/sections/hero.json`
- `website/pages/home/sections/imoveis-destaque.json`
- `website/pages/home/sections/contato.json`
- `website/pages/property/page.json`
- `website/layout/header.json`
- `website/layout/footer.json`
- `website/layout/navigation.json`
- `website/styles/theme.json`
- `website/styles/global.css`
- `website/styles/custom.css`
- `website/scripts/custom.js`
- `website/scripts/tracking.js`
- `website/seo/global-seo.json`
- `website/seo/home-seo.json`
- `website/seo/property-seo.json`
- `website/assets/images.json`
- `website/assets/videos.json`
- `website/assets/fonts.json`
- `website/components/components.json`
- `website/custom/custom-html.html`
- `website/custom/custom-css.css`
- `website/custom/custom-js.js`

Arquivos ainda não existentes no banco aparecem como placeholder editável. Ao salvar, são criados em `website_code_files`.

## Banco de dados

Tabela adicionada:

`website_code_files`

Campos principais:

- `company_id`
- `website_id`
- `page_id`
- `file_path`
- `file_type`
- `language`
- `content`
- `created_by_id`
- `updated_by_id`
- `created_at`
- `updated_at`
- `deleted_at`

Cada arquivo é único por `company_id`, `website_id` e `file_path`.

## APIs

Rotas protegidas por autenticação, empresa, assinatura ativa e permissão `site.manage`:

- `GET /website-builder/websites/:websiteId/code-files`
- `GET /website-builder/websites/:websiteId/code-files/:fileId`
- `POST /website-builder/websites/:websiteId/code-files`
- `PUT /website-builder/websites/:websiteId/code-files/:fileId`
- `DELETE /website-builder/websites/:websiteId/code-files/:fileId`

## Auditoria

Ações registradas:

- `code_editor_opened`
- `code_file_selected`
- `code_file_created`
- `code_file_updated`
- `code_file_deleted`
- `code_editor_saved`

## Segurança

O backend bloqueia padrões perigosos óbvios antes de salvar:

- `document.cookie`
- `localStorage`
- `sessionStorage`
- `indexedDB`
- `eval()`
- `new Function()`
- `importScripts()`

Arquivos JSON são validados antes de salvar.

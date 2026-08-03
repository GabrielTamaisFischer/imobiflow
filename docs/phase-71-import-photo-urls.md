# Phase 71 - Importacao de fotos por URL

## Objetivo

Adicionar suporte inicial para migrar fotos de imoveis a partir de URLs existentes em arquivos CSV/JSON, sem criar dados ficticios e sem depender de upload manual durante a importacao.

## O que foi criado

- Campo mapeavel `media_urls` no fluxo de importacao.
- Alias automaticos para colunas como `Fotos`, `Imagens`, `URLs fotos` e `Media URLs`.
- Separacao de multiplas URLs por quebra de linha, virgula, ponto e virgula ou pipe.
- Validacao para aceitar apenas URLs `http` e `https`.
- Registro das URLs importadas em `property_media` como midias do tipo `photo`.
- Contador `imported_media` no resultado da importacao.
- Opcao "URLs de fotos" no mapeamento manual da tela de importacoes.

## Regras importantes

- A importacao apenas referencia as URLs em `property_media`.
- O sistema ainda nao baixa os arquivos para o Supabase Storage nesta etapa.
- URLs invalidas fazem a linha ser marcada como invalida antes da importacao.
- As fotos sao sempre vinculadas ao `company_id` e ao imovel criado.
- O sistema continua sem criar dados demonstrativos.

## Proximo passo recomendado

Criar uma rotina de ingestao assíncrona para baixar imagens externas, validar tipo/tamanho, salvar no Supabase Storage privado/publico conforme regra do modulo de imoveis e atualizar `property_media` com o caminho final do arquivo.

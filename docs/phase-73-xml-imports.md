# Phase 73 - Importacao XML

## Objetivo

Adicionar suporte inicial para importacao XML, cobrindo feeds de portais e exportacoes de sistemas imobiliarios antigos.

## O que foi criado

- Suporte a arquivos `.xml` no backend.
- Deteccao automatica do tipo `xml` pelo nome do arquivo.
- Parser XML seguro via `fast-xml-parser`.
- Suporte a estruturas comuns:
  - `imoveis/imovel`
  - `properties/property`
  - `listings/listing`
  - `ListingDataFeed/Listings/Listing`
- Conversao de campos aninhados para o mesmo pipeline de mapeamento usado por CSV, JSON e Excel.
- Leitura de dados comuns de portal:
  - codigo/listing id;
  - titulo;
  - descricao;
  - tipo do imovel;
  - finalidade;
  - endereco;
  - cidade/estado;
  - quartos/banheiros;
  - valores;
  - contato/proprietario;
  - fotos por URL.
- Aceite de XML na tela de importacoes.
- Teste automatizado com XML aninhado simulando feed imobiliario.

## Regras importantes

- XML tambem passa por previa antes da gravacao.
- O sistema nao cria dados ficticios.
- A importacao segue `company_id`, assinatura ativa e permissao pelo backend.
- Fotos externas ainda sao registradas por URL em `property_media`; a ingestao para Supabase Storage fica para etapa posterior.
- XMLs muito diferentes podem exigir mapeamento manual pelo usuario.

## Proximo passo recomendado

Adicionar suporte a ZIP com imagens e criar uma fila de ingestao para baixar fotos externas com validacao de tipo, tamanho e armazenamento no Supabase Storage.

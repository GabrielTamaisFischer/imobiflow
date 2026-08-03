# Fase 67 - Sites das Imobiliárias

## Objetivo

Iniciar o módulo de sites por imobiliária previsto no SDD, conectando imóveis reais publicados ao site público e transformando formulários em leads do CRM.

## Implementado

- Migration `047_company_sites_foundation.sql` com:
  - `company_sites`;
  - `site_leads`;
  - `company_id` obrigatório;
  - RLS para isolamento multiempresa;
  - slug e domínio customizado únicos.
- Backend interno `/site`:
  - `GET /site/settings`;
  - `PUT /site/settings`;
  - `POST /site/publish`;
  - `POST /site/unpublish`;
  - `POST /site/properties/:id/publish`;
  - `POST /site/properties/:id/unpublish`;
  - `GET /site/leads`.
- Backend público `/public/sites`:
  - `GET /public/sites/:slug`;
  - `GET /public/sites/:slug/properties`;
  - `GET /public/sites/:slug/properties/:propertyId`;
  - `POST /public/sites/:slug/leads`.
- Tela interna `/app/site`:
  - configuração da marca, slug, headline e descrição;
  - publicação/tirada do ar;
  - publicação/despublicação de imóveis reais;
  - listagem de leads capturados pelo site.
- Página pública `/site/:slug`:
  - vitrine de imóveis publicados;
  - detalhes resumidos com fotos reais quando houver;
  - formulário de interesse vinculado ao CRM.

## Regras preservadas

- Site público só funciona se:
  - empresa estiver ativa;
  - assinatura estiver válida;
  - site estiver publicado.
- Nenhum imóvel fictício é exibido.
- Apenas imóveis reais com `published_at` e status público são listados.
- Formulário público cria lead real no CRM com origem `site`.
- Endereço completo e preços respeitam configuração do site.

## Pendências

- Editor visual completo de seções.
- Templates múltiplos.
- SEO avançado e sitemap.
- Domínio customizado real na Vercel/Cloudflare.
- Página pública individual mais completa por imóvel.

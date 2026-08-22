# Fase 79 - Feeds JSON e XML para portais imobiliários

## Objetivo

Evoluir a integração com ZAP Imóveis, OLX e Viva Real para oferecer feeds públicos em formatos usados por portais imobiliários: JSON e XML.

## Implementado

- Endpoint público JSON:
  - `/portal-integrations/:provider/:companyId/feed.json`
- Endpoint público XML:
  - `/portal-integrations/:provider/:companyId/feed.xml`
- Exportação com dados públicos do imóvel:
  - código;
  - título;
  - descrição;
  - tipo do imóvel;
  - finalidade;
  - bairro, cidade e estado;
  - dormitórios, banheiros, suítes, vagas e áreas;
  - valores em centavos;
  - características;
  - fotos públicas ordenadas, com capa primeiro;
  - ID interno do imóvel e da publicação.
- Validação de empresa com assinatura ativa antes de liberar feed.
- Validação de conexão ativa ou em teste para o portal.
- Exclusão de endereço completo do feed público.
- Tela de integrações mostrando links JSON e XML por portal.

## Regras importantes

- O feed só retorna publicações com status `published`.
- O imóvel precisa estar `available` ou `reserved`.
- O imóvel precisa ter `published_at`.
- O sistema não cria dados fictícios.
- O feed não expõe rua, número, complemento ou dados privados do proprietário.

## Próximo passo recomendado

Criar validações por portal para avisar quando um imóvel não está pronto para exportação, por exemplo:

- imóvel sem foto;
- imóvel sem valor;
- imóvel sem cidade/estado;
- imóvel sem descrição;
- finalidade incompatível com o portal;
- quantidade mínima de fotos não atendida.

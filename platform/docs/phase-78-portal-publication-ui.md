# Fase 78 - Painel de publicação em portais

## Objetivo

Criar a primeira experiência visual para controlar publicações de imóveis reais em portais imobiliários, usando a fundação técnica criada para ZAP Imóveis, OLX e Viva Real.

## Implementado

- Cliente frontend para `/portal-integrations/publications`.
- Suporte visual aos provedores `zap_imoveis`, `olx` e `viva_real`.
- URLs de feed público por empresa e portal.
- Formulário para registrar publicação de imóvel real em portal.
- Lista de publicações com status, imóvel vinculado, portal, sincronização, ID externo, URL do anúncio e erro de integração.
- Estado vazio sem dados fictícios.
- Modo preview com persistência local apenas para visualização da experiência.

## Regras respeitadas

- A tela não cria imóveis fictícios.
- Só imóveis cadastrados pelo usuário aparecem para publicação.
- O backend continua responsável por validar `company_id`, assinatura ativa e permissões.
- O feed público permanece filtrado por publicações válidas e empresa.
- Publicações podem ser preparadas antes de uma integração credenciada real com cada portal.

## Próximo passo recomendado

Evoluir a exportação dos feeds para o formato técnico exigido por cada portal, começando por XML/JSON de imóveis com fotos, valores, endereço público permitido e dados de contato da imobiliária.

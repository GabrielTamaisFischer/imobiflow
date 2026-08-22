# Fase 14 - Catalogo real de planos Kiwify

## Objetivo

Conectar a base SaaS do ImobiFlow aos links ativos da Kiwify informados para venda dos planos Start, Pro e Enterprise AI.

## O que foi implementado

- Catalogo de planos atualizado para os valores reais:
  - Start: R$ 79,00/mês.
  - Pro: R$ 197,00/mês.
  - Enterprise AI: R$ 497,00/mês.
- Links oficiais Kiwify centralizados no frontend em `src/product/checkout-links.ts`.
- Cards de planos da landing apontando diretamente para os checkouts ativos.
- Tela de assinatura bloqueada apontando para a pagina comercial da Kiwify.
- Backend de checkout com fallback para os links reais da Kiwify quando as variaveis de ambiente especificas ainda nao estiverem cadastradas.
- Endpoint `/api/billing/plans` preparado para retornar `gateway`, `checkout_url` e `sales_page_url` a partir do catalogo.
- Fallback no endpoint de planos para continuar funcionando enquanto a migration 008 ainda nao tiver sido aplicada no Supabase.
- Migration `008_kiwify_plan_catalog.sql` adicionando os campos comerciais no catalogo de planos.
- Planos trimestrais antigos marcados como inativos, evitando exibir precos desatualizados.

## Links configurados

- Pagina de vendas: `https://kiwify.app/FejQ33s`
- Start: `https://pay.kiwify.com.br/YmVd46n`
- Pro: `https://pay.kiwify.com.br/zlmmvgv`
- Enterprise AI: `https://pay.kiwify.com.br/rbeAEEn`

## Regras preservadas

- Usuario logado continua nao sendo considerado autorizado automaticamente.
- A area interna continua dependendo de login valido, empresa vinculada, assinatura ativa e permissao.
- Empresas com assinatura cancelada, expirada, inadimplente ou inativa continuam sendo direcionadas para a tela de bloqueio.

## Proxima etapa recomendada

Implementar o processamento mais robusto dos webhooks Kiwify com mapeamento de eventos reais para `subscriptions`, `payments` e `gateway_events`, incluindo idempotencia por evento de pagamento/assinatura.

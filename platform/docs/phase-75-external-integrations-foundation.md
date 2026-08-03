# Fase 75 - Base de integracoes externas

## Objetivo

Criar a fundacao para integrar o ImobiFlow com canais externos sem expor segredos no frontend e sem marcar uma integracao como pronta antes das credenciais reais existirem.

Esta fase cobre os provedores solicitados:

- WhatsApp Business API
- ZAP Imoveis
- OLX
- Viva Real
- Stripe
- Google
- Asaas
- Receita Federal

## O que foi criado

- Catalogo tecnico de provedores com categoria, capacidades, credenciais obrigatorias, configuracoes esperadas, eventos de webhook e observacoes operacionais.
- Migration `049_external_integrations_foundation.sql` com `integration_connections` e `integration_events`.
- Permissoes `integrations.view` e `integrations.manage`.
- API protegida por autenticacao, empresa, assinatura ativa e permissao:
  - `GET /integrations/providers`
  - `GET /integrations/connections`
  - `POST /integrations/connections`
  - `PATCH /integrations/connections/:id/status`
  - `POST /integrations/connections/:id/check`
- Tela interna `/app/integracoes` para visualizar provedores, cadastrar conexoes e verificar prontidao.
- Variaveis de ambiente documentadas no `.env.example`.
- Auditoria ao criar conexao e alterar status.

## Regras de seguranca

- O frontend nunca recebe token secreto.
- A conexao guarda apenas referencias como `credentials_ref` e `webhook_secret_ref`.
- O backend verifica se as variaveis esperadas existem antes de considerar a integracao pronta.
- Se o usuario tentar ativar uma conexao sem credenciais suficientes, o backend rebaixa para `testing`.
- Todas as conexoes sao isoladas por `company_id`.
- Eventos externos ficam registrados em `integration_events` para futura auditoria de webhooks.

## Status por provedor

| Provedor | Status atual | Proximo passo |
| --- | --- | --- |
| WhatsApp Business API | Estrutura preparada | Ativar adapter real quando a situacao da API for definida |
| ZAP Imoveis | Adapter planejado | Implementar publicacao de feed e captura de leads |
| OLX | Adapter planejado | Implementar publicacao de feed e captura de leads |
| Viva Real | Adapter planejado | Implementar publicacao de feed e captura de leads |
| Stripe | Configuravel | Implementar webhooks reais para assinatura/pagamentos quando houver chaves |
| Google | Estrutura preparada | Implementar Maps, Calendar e OAuth por escopo |
| Asaas | Configuravel | Implementar PIX/boleto e webhooks financeiros reais |
| Receita Federal | Estrutura preparada | Implementar consulta CNPJ via API/provedor autorizado |

## Importante

Esta fase nao simula integracoes reais. Ela cria a base correta para receber credenciais e implementar cada adapter sem quebrar a regra central do SDD: backend decide, dados por empresa, auditoria e nada de dados ficticios.

# Fase 68 - Base da IA imobiliaria

## Objetivo

Criar a estrutura inicial do modulo de IA do ImobiFlow sem depender ainda de provider externo.

Esta fase prepara creditos por plano, templates, historico de solicitacoes e endpoints seguros, mantendo a regra do SDD: a IA nunca deve inventar dados e deve operar somente com contexto real informado pelo usuario ou vinculado a entidades da empresa.

## Entregas

- Migration `048_ai_module_foundation.sql`.
- Permissoes `ai.view`, `ai.use` e `ai.manage`.
- Tabelas `ai_credit_balances`, `ai_prompt_templates` e `ai_generation_requests`.
- Templates globais iniciais para:
  - descricao de imovel;
  - mensagem WhatsApp;
  - resumo de vistoria;
  - analise de lead.
- API protegida em `/ai`.
- Tela interna `/app/inteligencia`.
- Registro de solicitacoes em modo `pending_provider` quando o provider real ainda nao esta configurado.
- Registro de evento em `ai_usage_events` e custo operacional em `tenant_usage_events`.

## Endpoints

- `GET /ai/overview`
- `GET /ai/requests`
- `GET /ai/templates`
- `POST /ai/requests`

Todas as rotas privadas exigem:

```txt
login valido
empresa vinculada
assinatura ativa
permissao ai.view ou ai.use
```

## Regra de seguranca da IA

O sistema nao gera resposta real nesta fase. Ele registra a solicitacao, contexto, entidade relacionada e instrucoes, mas retorna `provider_ready = false`.

Quando o provider de IA for configurado, a camada de execucao deve:

1. carregar o template;
2. montar prompt apenas com dados reais;
3. validar limite de creditos;
4. chamar provider;
5. gravar resultado;
6. atualizar creditos usados;
7. registrar custo por tenant;
8. preservar historico auditavel.

## Estado atual

O modulo ja aparece na navegacao interna como `IA`. Em modo visualizacao, a tela permite registrar solicitacoes locais sem dados ficticios. Em ambiente real, a API salva as solicitacoes no Supabase apos as migrations serem aplicadas.

## Pendencias futuras

- Configurar provider real de IA.
- Criar prompts finais por recurso.
- Gerar descricao de imovel diretamente a partir do cadastro.
- Integrar IA ao CRM, vistorias, contratos e WhatsApp.
- Aplicar cobranca real de creditos consumidos por plano.

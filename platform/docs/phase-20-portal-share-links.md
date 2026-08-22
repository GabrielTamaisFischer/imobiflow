# Fase 20 - Links operacionais dos portais

## Objetivo

Transformar os portais do proprietario e do inquilino em recursos utilizaveis pela imobiliaria dentro da area administrativa.

## Implementado

- API de proprietarios agora retorna:
  - `portal_token`;
  - `portal_enabled`;
  - `portal_last_access_at`.
- API de contratos agora retorna partes do contrato com:
  - tipo da parte;
  - nome;
  - contato;
  - `portal_token`;
  - `portal_enabled`.
- Tela `/app/proprietarios`:
  - mostra link do portal do proprietario;
  - permite copiar o link direto.
- Tela `/app/contratos`:
  - identifica o inquilino vinculado ao contrato;
  - mostra link do portal do inquilino;
  - permite copiar o link direto.
- Preview local:
  - proprietarios e partes de contrato criados em modo preview tambem recebem token.

## Regras de negocio

- O link do proprietario so aparece quando `portal_enabled = true` e existe `portal_token`.
- O link do inquilino so aparece quando o contrato possui parte do tipo `tenant` com portal habilitado.
- Os portais continuam publicos por token, mas os dados retornados pelo backend permanecem limitados ao `company_id` do registro encontrado.

## Proximos passos

1. Criar envio do link por WhatsApp e e-mail.
2. Criar segunda via de cobranca no portal do inquilino.
3. Criar recibos PDF para pagamentos confirmados.
4. Exibir historico de acessos do portal dentro da area interna.

# Fase 21 - Compartilhamento de links dos portais

## Objetivo

Reduzir o trabalho manual da imobiliaria ao enviar acessos aos portais externos de proprietarios e inquilinos.

## Implementado

- Tela `/app/proprietarios`:
  - manteve copia do link do portal do proprietario;
  - adicionou envio por WhatsApp quando existe telefone/WhatsApp;
  - adicionou envio por e-mail quando existe e-mail.
- Tela `/app/contratos`:
  - manteve copia do link do portal do inquilino;
  - adicionou envio por WhatsApp quando a parte inquilino possui telefone;
  - adicionou envio por e-mail quando a parte inquilino possui e-mail.
- Mensagens ja saem com texto operacional e link do portal.

## Regras de negocio

- O sistema so mostra acoes de envio quando existe portal habilitado.
- WhatsApp depende de numero cadastrado.
- E-mail depende de endereco cadastrado.
- O envio real ainda e feito pelo aplicativo externo do usuario, sem armazenar credenciais de e-mail ou WhatsApp no ImobiFlow.

## Proximos passos

1. Criar notificacoes automaticas por WhatsApp/e-mail via provedor real.
2. Registrar historico de envio do link.
3. Permitir regenerar token de portal quando necessario.
4. Adicionar modelo de mensagem configuravel por empresa.

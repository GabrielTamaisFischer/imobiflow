# Fase 23 - Regua financeira de cobranca e notificacoes

## Objetivo

Conectar o modulo financeiro avancado com a base de notificacoes criada na fase anterior.

Esta fase prepara mensagens operacionais para cobrancas de aluguel, lembretes de vencimento, cobrancas vencidas e confirmacao de pagamento, mantendo auditoria e isolamento por empresa.

## Banco de dados

Nova migracao:

- `database/migrations/015_financial_notification_rules.sql`

Itens criados:

- tabela `notification_rule_steps`;
- templates globais para cobranca gerada;
- templates globais para lembrete de vencimento;
- templates globais para cobranca vencida;
- templates globais para pagamento confirmado;
- passos iniciais da regua de cobranca para WhatsApp e e-mail.

Regua inicial:

- 3 dias antes do vencimento;
- no dia do vencimento;
- 3 dias apos vencimento;
- 7 dias apos vencimento;
- 15 dias apos vencimento.

## Backend

Novo endpoint:

- `POST /finance/charges/:id/prepare-notification`

O endpoint:

- exige login valido;
- exige empresa vinculada;
- exige assinatura ativa;
- exige permissao financeira;
- identifica a cobranca;
- identifica o inquilino;
- valida contato do inquilino;
- monta mensagem a partir de template;
- registra evento em `notification_events`;
- registra auditoria financeira em `financial_audit_logs`.

Nesta fase o status do evento e `prepared`, pois o envio real ainda depende de provedor externo de WhatsApp/e-mail.

## Produto web

Na tela `/app/financeiro`, cada cobranca agora permite:

- preparar lembrete de cobranca;
- preparar aviso de cobranca vencida;
- preparar recibo/confirmacao quando a cobranca estiver paga.

O historico pode ser acompanhado em:

- `/app/notificacoes`

## Importante

O sistema ainda nao envia automaticamente via WhatsApp ou e-mail. Ele prepara e registra a comunicacao. Isso evita simular uma integracao inexistente e deixa a arquitetura pronta para conectar provedores reais.

## Proximos passos

- conectar provedor WhatsApp Business/API;
- conectar provedor de e-mail transacional;
- executar regua automaticamente por job agendado;
- registrar webhooks de entrega;
- permitir personalizacao de templates por empresa;
- gerar notificacoes automaticas no momento da criacao da cobranca e confirmacao do pagamento via gateway.

# Fase 59 - Hardening de acesso, testes e convites de usuários

## Objetivo

Fechar uma lacuna crítica do SDD: impedir que a área interna seja liberada em produção por sessão de preview/localStorage e iniciar a base real de multiusuário com convites, cargos e permissões.

## Implementado

- Modo preview isolado para desenvolvimento local.
- Bloqueio de token `imobiflow.preview_access` fora de ambiente permitido.
- Testes unitários para regras de assinatura e preview.
- Script `npm run test` com Vitest usando `--configLoader runner`.
- Migration `041_user_invitations.sql`.
- Serviço backend para criar roles padrão por empresa:
  - owner;
  - admin;
  - manager;
  - broker;
  - financial;
  - inspector;
  - legal.
- Endpoint protegido `POST /auth/invite`.
- Endpoint público `POST /auth/accept-invite`.
- Hash SHA-256 do token de convite armazenado no banco.
- Convite com expiração configurável.
- Auditoria para convite criado e convite aceito.
- Tela pública `/aceitar-convite`.
- Formulário inicial de convite em `/app/configuracoes`.

## Regras atendidas do SDD

- Usuário logado não significa usuário autorizado.
- Preview não libera produto em produção.
- Convite de usuários depende de login, empresa, assinatura ativa e permissão `users.manage`.
- Usuário convidado entra vinculado à mesma `company_id`.
- Cargo e permissões são definidos no backend.
- Ações sensíveis geram audit log.
- Sem dados fictícios na aplicação final.

## Validação

- `npm run test`: 10 testes passaram.
- `npm run build`: frontend compilado.
- `cd backend && npm run build`: backend compilado.

## Pendências

- Aplicar a migration `041_user_invitations.sql` no Supabase real quando as credenciais estiverem configuradas.
- Envio de e-mail real do convite ainda não foi integrado; por enquanto a API retorna o link para compartilhamento manual.
- Tela de gestão/listagem de usuários ainda precisa ser expandida.

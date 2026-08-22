# Fundacao de identidade MySQL/JWT

Data da implementacao: 2026-08-13.

## Fonte canonica

Os fluxos de cadastro, login, sessao, empresa, usuarios, convites, papeis, permissoes e senhas usam exclusivamente MySQL via Prisma. Tokens do Supabase, preview e autenticacao local nao sao aceitos pelo middleware protegido.

O e-mail do usuario e normalizado e unico globalmente. Assim, uma credencial representa um unico vinculo empresarial e o cliente nao escolhe `company_id`. O contexto da empresa vem do JWT validado, da sessao persistida e do relacionamento do usuario no banco.

## Credenciais e sessoes

- Senhas: `scrypt` com salt aleatorio por senha; politica minima de 12 caracteres com maiuscula, minuscula, numero e simbolo.
- Access token: JWT HS256, emissor e audiencia fixos, validade de 15 minutos e claims de usuario, empresa, sessao e JTI.
- Refresh token: segredo opaco de uso rotativo; somente SHA-256 e persistido no banco.
- Sessao: persistida em `auth_sessions`, revogavel, expira em 30 dias e e revalidada a cada requisicao.
- Troca ou recuperacao de senha: revoga todas as sessoes do usuario.
- Cinco falhas consecutivas de login: bloqueio temporario de 15 minutos.

`JWT_SECRET` e obrigatorio no backend e precisa conter ao menos 32 caracteres aleatorios. Nunca deve usar prefixo `VITE_`.

## Endpoints

Publicos:

- `POST /auth/register` (compatibilidade: rejeita cadastro publico sem pagamento)
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/activations/validate`
- `POST /auth/activations/activate`
- `GET /auth/invitations/validate`
- `POST /auth/accept-invite`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

Autenticados:

- `POST /auth/logout`
- `GET /auth/session`
- `GET|PATCH /auth/company`
- `PATCH /auth/profile`
- `GET|POST /auth/roles`
- `PATCH|DELETE /auth/roles/:id`
- `GET /auth/permissions`
- `GET /auth/users`
- `PATCH /auth/users/:id`
- `GET /auth/invitations`
- `POST /auth/invite`
- `POST /auth/invitations/:id/cancel`
- `POST /auth/invitations/:id/reissue`
- `POST /auth/change-password`
- `GET /auth/sessions`
- `DELETE /auth/sessions/:id`

Administrativos e indisponiveis em producao:

- `POST /billing/test-provisioning`: exige ambiente `development`, `test` ou `staging`, flag explicita e segredo administrativo; cria somente provisionamento sintetico claramente marcado.

## Isolamento e autorizacao

Consultas e mutacoes empresariais combinam o identificador do recurso com o `company_id` extraido da sessao. Campos `company_id` enviados pelo cliente sao ignorados. Papeis pertencem a uma empresa e as permissoes sao carregadas da relacao `role_permissions`.

Somente um owner pode criar ou alterar outro owner. A desativacao ou rebaixamento do ultimo owner ativo ocorre dentro de transacao serializavel e retorna `LAST_OWNER_PROTECTED`.

## Recuperacao e convites

Tokens aleatorios nunca sao persistidos em texto puro. Quando `EMAIL_PROVIDER_URL` esta configurada, o backend envia um payload HTTP generico ao provedor de e-mail. A resposta de recuperacao e neutra para nao revelar a existencia da conta.

`AUTH_EXPOSE_TEST_TOKENS=true` so produz efeito com `NODE_ENV=test`; deve permanecer falso fora de testes automatizados.

## Migracao

`202608130001_mysql_identity_foundation` e aditiva e compativel com MySQL. Ela cria papeis padrao para empresas existentes, vincula usuarios aos papeis e cria as tabelas de permissoes, convites, sessoes, recuperacao e auditoria.

`202608130002_paid_account_activation` adiciona o dominio canonico de plano, assinatura, sessao de checkout, provisionamento, evento de pagamento e token de ativacao. O token de ativacao e aleatorio, persistido somente como hash, vinculado ao e-mail validado e consumido uma unica vez dentro da mesma transacao que cria a empresa e o primeiro owner.

A constraint global de e-mail falha de forma segura caso o banco de destino contenha o mesmo e-mail em mais de uma empresa. Antes de uma aplicacao futura, esse conflito deve ser inventariado e resolvido explicitamente.

Em 2026-08-13, a fundacao de identidade foi aplicada exclusivamente no MySQL isolado de staging depois de confirmar dados apenas sinteticos e nenhuma migration anterior pendente. Em 2026-08-14, a cadeia de staging tinha dez migrations aplicadas, incluindo ativacao paga. Nenhuma migration foi executada em producao.

## Evidencia ponta a ponta de staging

Um runner temporario e nao versionado iniciou a API local compilada contra um MySQL descartavel e validou por HTTP:

- provisionamento pago sintetico, ativacao transacional de duas empresas e seus owners;
- sessao MySQL/JWT e contexto empresarial persistido;
- atualizacao de empresa ignorando `company_id` de outra empresa no payload;
- nove papeis padrao, 35 permissoes e um papel customizado;
- convite com token persistido somente como hash, aceite unico e login do convidado;
- bloqueio de leitura e alteracao cruzadas entre empresas;
- bloqueio da desativacao do ultimo owner;
- rotacao atomica do refresh token e rejeicao de replay;
- troca de senha com revogacao de sessoes;
- recuperacao com token em hash, consumo unico e login com a nova senha;
- logout e rejeicao posterior da sessao revogada.

O teste criou duas empresas e usuarios sinteticos em um banco MySQL descartavel. O container identificado exclusivamente para essa validacao foi removido ao final; o staging e a producao nao foram alterados. O provedor de e-mail ainda precisa ser configurado antes de uso externo; sem `EMAIL_PROVIDER_URL`, o backend mantem a resposta neutra, mas nenhum convite ou recuperacao e entregue.

O frontend local e a API local responderam HTTP 200. A verificacao visual automatizada comprovou cadastro sem token direcionando para planos, ativacao, login, persistencia apos recarga, configuracoes, convite, aceite, isolamento entre duas empresas, bloqueio por assinatura, recuperacao, redefinicao de senha e logout. A validacao programatica contabilizou 41 verificacoes HTTP aprovadas. A responsividade em viewport pequeno e a inspecao dedicada do console do navegador permanecem como verificacoes manuais recomendadas antes do merge.

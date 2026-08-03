# ImobiFlow - Fase 12: Assinatura digital inicial de vistorias

## Objetivo desta entrega

Criar a base operacional de assinatura digital para laudos de vistoria, conectando assinantes, status do documento, auditoria basica e geracao de PDF.

Essa fase prepara o caminho para assinatura publica por link seguro e assinatura digital com provedor externo em etapa futura.

## Banco de dados

Migration criada:

- `database/migrations/007_inspection_signatures_workflow.sql`

Campos adicionados em `inspection_signatures`:

- `signer_email`;
- `signer_phone`;
- `status`;
- `signature_token`;
- `signature_text`;
- `signed_user_agent`;
- `signed_payload`;
- `expires_at`;
- `updated_at`.

Indices adicionados:

- busca por empresa/status;
- busca por `signature_token`.

Trigger adicionada:

- atualizacao automatica de `updated_at`.

## Backend

Endpoints adicionados em `backend/src/routes/inspections.ts`:

- `GET /inspections/:id/signatures`;
- `POST /inspections/:id/signatures`;
- `POST /inspections/:id/signatures/:signatureId/sign`.

Validacoes aplicadas:

- login valido;
- empresa vinculada;
- assinatura ativa;
- permissao `inspections.view` ou `inspections.sign`;
- isolamento por `company_id`;
- assinatura vinculada a vistoria correta.

Comportamento:

- cria assinantes pendentes;
- coloca a vistoria em `waiting_signature`;
- gera `public_token` para a vistoria quando necessario;
- confirma assinatura com data, IP, user-agent e usuario interno;
- conclui a vistoria quando todas as assinaturas estiverem assinadas.

## Interface interna

Tela atualizada:

- `/app/vistorias/$inspectionId`

Recursos adicionados:

- painel `Assinaturas`;
- cadastro de assinante;
- papel do assinante: locatario, proprietario, corretor, gestor ou testemunha;
- documento e e-mail do assinante;
- status visual pendente/assinada;
- acao `Confirmar assinatura`;
- contador de assinaturas concluidas.

## PDF

O gerador inicial de PDF agora inclui:

- total de assinaturas;
- assinaturas pendentes;
- assinaturas confirmadas;
- nome, papel, documento e data da assinatura.

## Modo visualizacao

O modo preview tambem suporta:

- criar assinante;
- confirmar assinatura;
- atualizar status da vistoria;
- gerar PDF com resumo das assinaturas.

## Proximas etapas recomendadas

Etapa concluida na Fase 13:

- pagina publica de assinatura por `signature_token`;
- endpoint publico sem login, mas com empresa e assinatura SaaS validadas;
- abertura do link externo pela area interna.

Proximas evolucoes:

1. Criar pagina publica completa do laudo com PDF seguro.
2. Gerar hash do PDF e trilha de auditoria imutavel.
3. Melhorar visual premium do PDF final.
4. Enviar link por WhatsApp/e-mail.
5. Criar comparacao entrada vs saida.

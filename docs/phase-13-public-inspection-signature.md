# ImobiFlow - Fase 13: Assinatura externa por link seguro

## Objetivo desta entrega

Permitir que proprietarios, locatarios, corretores, gestores ou testemunhas assinem o laudo por um link externo, sem precisar acessar a area interna da imobiliaria.

Essa fase transforma a assinatura em um fluxo mais proximo do uso real previsto no SDD.

## Backend publico

Router criado:

- `backend/src/routes/public-inspections.ts`

Montagem:

- `/public/inspections`

Endpoints:

- `GET /public/inspections/signatures/:token`
- `POST /public/inspections/signatures/:token/sign`

Validacoes aplicadas:

- token de assinatura existente;
- vistoria vinculada ao token;
- empresa ativa;
- assinatura SaaS ativa da empresa;
- link nao expirado;
- assinatura ainda pendente.

O assinante externo nao precisa estar logado, mas a imobiliaria dona do laudo precisa estar autorizada.

## Assinatura externa

Ao assinar pelo link publico, o sistema registra:

- nome digitado;
- aceite dos termos;
- data e hora;
- IP;
- user-agent;
- origem publica da assinatura.

Quando todas as assinaturas da vistoria sao confirmadas, a vistoria muda para `completed`.

## Frontend publico

Rota criada:

- `/assinar-vistoria/$token`

A pagina publica exibe:

- imobiliaria responsavel;
- titulo da vistoria;
- imovel;
- papel do assinante;
- documento;
- resumo do laudo;
- formulario de aceite;
- estado de assinatura confirmada.

## Area interna

O painel `Assinaturas` do laudo agora exibe:

- link `Abrir link externo`;
- acao de assinatura interna separada como `Confirmar assinatura interna`.

## Modo visualizacao

O modo preview suporta:

- abrir link externo de assinatura;
- carregar dados pelo `signature_token`;
- confirmar assinatura externa;
- atualizar status da assinatura;
- concluir a vistoria quando nao houver pendencias.

## Observacoes tecnicas

O fluxo usa `signature_token` para identificar a assinatura especifica.

O endpoint publico ainda nao expoe checklist completo, fotos ou PDF privado automaticamente. Isso sera evoluido com regras especificas de privacidade e regeneracao segura de URL assinada.

## Proximas etapas recomendadas

1. Criar pagina publica completa do laudo com PDF seguro.
2. Gerar hash do PDF assinado.
3. Criar historico de auditoria imutavel.
4. Enviar link por WhatsApp/e-mail.
5. Criar comparacao entrada vs saida.

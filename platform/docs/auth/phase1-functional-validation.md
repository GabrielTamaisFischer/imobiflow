# Validacao funcional da Fase 1

Data: 2026-08-14.

Classificacao: **FUNCIONAL COM LIMITACAO**.

## Escopo comprovado

A validacao foi executada com dados exclusivamente sinteticos, frontend e API locais e um MySQL descartavel. Nenhuma operacao foi feita em producao e nenhum dado real foi usado.

- cadastro publico sem token de ativacao bloqueado e direcionado para planos;
- provisionamento sintetico protegido e rejeitado em `production`;
- token de ativacao aleatorio, armazenado somente como hash, expiravel e de uso unico;
- plano, e-mail, empresa e estado de pagamento derivados do provisionamento validado;
- criacao transacional da empresa, primeiro `OWNER` e assinatura ativa;
- login, refresh rotativo, sessao persistida, logout e revogacao;
- empresas, usuarios, convites, papeis e permissoes isolados por empresa;
- protecao do ultimo owner e bloqueio de usuario ou empresa inativos;
- convite, reemissao, cancelamento, aceite unico e protecao contra replay;
- troca e recuperacao de senha com revogacao de sessoes e resposta antienumeracao;
- estados `PENDING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED` e `CANCELLED` aplicados na autorizacao;
- `PAST_DUE` aceita somente dentro da tolerancia configurada;
- falha do gateway legado nao impede a gestao canonica MySQL em configuracoes;
- login e leitura de papeis nao executam provisionamento ou escrita concorrente de papeis.

## Evidencias

- 41 verificacoes HTTP de identidade, isolamento, assinatura e replay aprovadas;
- jornada visual concluida para Empresa A, usuario convidado e Empresa B;
- sessao confirmada apos recarga e rejeitada depois do logout;
- 226 testes automatizados aprovados na execucao completa anterior;
- Prisma Client gerado e schema validado com URL MySQL dummy;
- builds da landing, plataforma e backend aprovados;
- nenhum `.env`, arquivo de `platform/.tmp`, segredo ou referencia ao gerador anterior versionado.

## Limites da evidencia

- a responsividade da jornada em viewport pequeno nao foi automatizada porque o webview nao ofereceu redimensionamento programatico;
- a inspecao dedicada do console do navegador nao estava disponivel; falhas de rede e backend foram acompanhadas pelos logs locais;
- o `tsc --noEmit` global da plataforma ainda encontra erros historicos fora da Fase 1 em modulos como website builder, agenda, contratos, custos e financeiro;
- o provedor definitivo de pagamento nao foi escolhido e nenhum pagamento real foi processado;
- convites e recuperacao exigem configurar `EMAIL_PROVIDER_URL` para entrega externa;
- a confirmacao online mais recente do status das migrations de staging falhou por indisponibilidade do proxy publico; a validacao funcional usou banco descartavel com as dez migrations.

## Limpeza

O banco descartavel foi identificado pelo nome exclusivo da validacao e removido integralmente. Nao houve reset, seed ou exclusao no staging. A landing page nao recebeu mudanca estrutural; apenas CTAs publicos foram alinhados ao fluxo pago sem cadastro gratuito.

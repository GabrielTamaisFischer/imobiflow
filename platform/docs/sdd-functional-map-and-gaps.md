# Mapa Funcional do SDD - ImobiFlow

Data: 2026-05-16

Este documento resume as funcionalidades descritas nos documentos do ImobiFlow, explica o que cada uma deve fazer na pratica e aponta o que ainda falta no sistema.

## 1. Regra central do produto

O ImobiFlow deve ser um SaaS imobiliario real, sem dados ficticios.

Regras obrigatorias:

- nenhuma tela deve nascer com dados falsos;
- todo modulo deve ter estado vazio claro;
- toda tabela operacional deve ter `company_id`;
- toda consulta deve filtrar pela empresa do usuario;
- o frontend nao decide autorizacao;
- o backend valida login, empresa, assinatura, plano e permissao;
- usuario logado nao significa usuario autorizado;
- assinatura inativa deve bloquear acesso;
- toda acao sensivel deve gerar auditoria.

### O que falta

- Remover ou bloquear o modo preview em producao.
- Criar testes automatizados para assinatura, permissao e `company_id`.
- Aplicar todas as migrations no Supabase.
- Garantir que portais publicos respeitem assinatura ativa da empresa.

## 2. Base SaaS, autenticacao, empresa e assinatura

### O que o SDD pede

O usuario cria uma conta, informa dados da imobiliaria e o sistema cria:

- usuario owner;
- empresa;
- assinatura inicial `pending` ou `inactive`;
- plano escolhido;
- permissao inicial de dono.

No login, o backend deve validar:

```txt
token valido
usuario ativo
empresa vinculada
empresa ativa
assinatura ativa
plano permite o modulo
role permite a acao
```

Se a assinatura estiver `expired`, `cancelled`, `past_due` ou `inactive`, o sistema deve bloquear a area interna.

### Como deve funcionar

1. Usuario se cadastra.
2. Sistema cria empresa e owner.
3. Usuario escolhe plano.
4. Kiwify/Cakto confirma pagamento por webhook.
5. Backend valida segredo do webhook.
6. Subscription vira `active`.
7. Middleware libera acesso.
8. Se pagamento falhar/cancelar, middleware bloqueia.

### O que ja existe

- Cadastro/login.
- Empresas.
- Usuarios.
- Roles/permissoes iniciais.
- Planos.
- Assinaturas.
- Pagamentos.
- Webhooks Kiwify/Cakto.
- Middleware de autenticacao, empresa, assinatura e permissao.
- Tela de assinatura bloqueada.

### O que falta

- Tela completa de gestao de usuarios.
- Convite de usuarios ponta a ponta.
- Edicao de roles/permissoes por empresa.
- Feature flags por plano aplicadas em todos os modulos.
- Testes obrigatorios.

## 3. Dashboard inteligente

### O que o SDD pede

O dashboard deve mostrar dados reais da imobiliaria:

- imoveis cadastrados;
- vendas;
- locacoes;
- leads;
- conversao;
- contratos;
- vencimentos;
- financeiro;
- comissoes;
- inadimplencia;
- alertas operacionais.

Filtros:

- hoje;
- ontem;
- 7, 14, 30, 90 dias;
- todo periodo;
- funcionario;
- venda;
- locacao;
- proprietario;
- contrato;
- lead;
- financeiro.

### Como deve funcionar

O dashboard consulta dados reais do banco, filtrados por `company_id`, e monta indicadores. Se nao houver dados, mostra estado vazio.

### O que ja existe

- Rota interna `/app`.
- Layout.
- Estados vazios.
- Alguns cards iniciais.

### O que falta

- Queries reais completas.
- Filtros globais.
- Indicadores por modulo.
- Alertas inteligentes.
- Recomendacoes.
- Ranking de corretores.

## 4. CRM imobiliario

### O que o SDD pede

O CRM controla leads desde o primeiro contato ate fechamento ou perda.

Cada lead deve ter:

- nome;
- telefone;
- email;
- origem;
- interesse;
- faixa de valor;
- tipo de imovel;
- regiao;
- corretor responsavel;
- etapa do funil;
- historico;
- observacoes;
- tarefas;
- imoveis de interesse;
- ultimo contato.

Funil inicial:

```txt
Novo lead
Contato realizado
Visita agendada
Visitou imovel
Proposta enviada
Contrato em andamento
Fechado
Perdido
```

### Como deve funcionar

O lead entra por cadastro manual, site, WhatsApp, importacao ou anuncio. O corretor acompanha em Kanban, cria tarefas e registra historico. Cada mudanca de etapa gera atividade.

### O que ja existe

- Migrations de CRM.
- Endpoints de leads.
- Pipeline inicial.
- Tarefas e notas.
- Tela `/app/crm`.
- Estados vazios.

### O que falta

- Kanban com drag-and-drop real.
- Historico automatico completo.
- Origem avancada.
- Vinculo real lead-imovel.
- WhatsApp com historico/API.
- Follow-up automatico.
- Filtros avancados.
- Relatorios de conversao.

## 5. Gestao de imoveis

### O que o SDD pede

O imovel e o centro do sistema. Ele alimenta:

- CRM;
- agenda;
- vistorias;
- contratos;
- financeiro;
- sites;
- WhatsApp;
- IA;
- relatorios.

O cadastro deve conter:

- codigo;
- titulo;
- tipo;
- finalidade;
- status;
- descricao;
- corretor;
- captador;
- caracteristicas;
- valores;
- endereco;
- proprietario;
- fotos;
- videos;
- documentos;
- status publico/privado.

### Como deve funcionar

O usuario cadastra um imovel real, vincula proprietario, adiciona fotos/documentos, define venda/locacao e decide se publica no site.

### O que ja existe

- CRUD inicial de imoveis.
- CRUD inicial de proprietarios.
- Vínculo imovel-proprietario.
- Tela `/app/imoveis`.
- Tela `/app/proprietarios`.
- Base de midias/documentos.

### O que falta

- Upload real completo em storage privado.
- Foto de capa.
- Ordenacao de fotos.
- Organizacao por comodo.
- Videos.
- Documentos privados com validade/permissao.
- Publicacao no site.
- Historico de status completo.
- Integracao total com CRM, agenda, vistoria, contratos e financeiro.

## 6. Proprietarios

### O que o SDD pede

Controlar donos dos imoveis, documentos, contatos, dados bancarios, imoveis vinculados e repasses.

### Como deve funcionar

O proprietario pode ser pessoa fisica ou juridica. Um proprietario pode ter varios imoveis. Dados bancarios exigem permissao restrita.

### O que ja existe

- Cadastro/listagem inicial.
- Vinculo com imoveis.
- Tela de proprietarios.

### O que falta

- Dados bancarios protegidos por permissao forte.
- Documentos do proprietario.
- Historico de relacionamento.
- Relatorio completo de repasses.
- Portal do proprietario completo.

## 7. Agenda e visitas

### O que o SDD pede

Agenda para visitas, vistorias, reunioes, retornos, assinaturas e compromissos.

Visita deve ter:

- lead;
- imovel;
- corretor;
- data;
- horario;
- local;
- status;
- observacoes;
- lembretes.

Status:

```txt
agendada
confirmada
realizada
cancelada
reagendada
nao compareceu
```

### Como deve funcionar

Lead demonstra interesse, corretor agenda visita, sistema cria evento, envia lembrete, corretor marca resultado e CRM cria follow-up.

### O que ja existe

- Tela inicial `/app/agenda`.
- Estado vazio.

### O que falta

- Migrations/endpoints de appointments completos.
- Criar/editar/cancelar visita.
- Status da visita.
- Vinculo lead-imovel-corretor.
- Lembretes.
- Confirmacao por WhatsApp/email.
- Follow-up pos-visita.

## 8. Vistoria inteligente

### O que o SDD pede

Vistoria digital por comodo com fotos, observacoes, assinaturas, PDF e comparacao entrada/saida.

Tipos:

- entrada;
- saida;
- periodica;
- venda;
- manutencao.

### Como deve funcionar

O vistoriador seleciona o imovel, cria vistoria, adiciona comodos, registra itens, fotos e observacoes. A IA pode melhorar o texto sem inventar fatos. Ao finalizar, gera PDF e coleta assinatura.

### O que ja existe

- Endpoints de vistorias.
- Comodos.
- Itens.
- Midias.
- Assinaturas.
- Assinatura publica.
- Geracao de PDF.
- Telas `/app/vistorias` e detalhe.
- Base nova para smart inspections.

### O que falta

- Comparacao entrada/saida completa.
- IA real para resumo.
- Offline real.
- App Android.
- Captura de camera.
- PDF premium final.
- Sincronizacao de fotos.
- Fluxo mobile completo.

## 9. Contratos e assinatura digital

### O que o SDD pede

Contratos para locacao, venda, administracao, exclusividade, proposta, vistoria e documentos.

Deve ter:

- modelos;
- variaveis;
- partes;
- status;
- anexos;
- assinatura;
- PDF;
- versoes;
- vencimentos;
- renovacao.

### Como deve funcionar

O usuario cria um modelo com variaveis, gera contrato com dados reais, revisa, envia para assinatura, acompanha status e bloqueia alteracao do PDF assinado.

### O que ja existe

- CRUD inicial de contratos.
- Partes do contrato.
- Tela `/app/contratos`.
- Base nova para templates, documentos, signatarios e eventos.

### O que falta

- Editor de modelos.
- Variaveis dinamicas completas.
- Geracao de PDF.
- Assinatura digital real.
- Checklist cartorial/documental.
- Historico de versoes.
- Renovacao.
- Alertas de vencimento.

## 10. Locacao

### O que o SDD pede

Gerenciar ciclo completo da locacao:

- imovel alugado;
- proprietario;
- inquilino;
- contrato;
- valor;
- vencimento;
- reajuste;
- inadimplencia;
- repasse;
- encerramento.

### Como deve funcionar

Ao alugar um imovel, o sistema cria locacao, contrato, vencimentos, cobrancas, repasses e muda status do imovel.

### O que ja existe

- Parte do fluxo aparece em contratos/financeiro.
- Cobrancas podem nascer de contrato.
- Repasses e comissoes existem no financeiro.

### O que falta

- Modulo formal de locacoes.
- Tabelas/endpoints/telas de rentals.
- Reajuste IGP-M/IPCA/manual.
- Vencimentos de seguro/documentos.
- Encerramento de locacao.
- Inadimplencia vinculada a locacao.

## 11. Financeiro

### O que o SDD pede

Financeiro deve controlar:

- contas a pagar;
- contas a receber;
- recebimentos;
- despesas;
- comissoes;
- repasses;
- fluxo de caixa;
- relatorios;
- boletos;
- PIX;
- inadimplencia.

### Como deve funcionar

Cada movimentacao deve se ligar a imovel, contrato, proprietario, corretor ou locacao. Pagamento confirmado atualiza financeiro, comissao, repasse e fluxo de caixa.

### O que ja existe

- Summary financeiro.
- Entradas financeiras.
- Cobrancas.
- Pagamentos.
- Comissoes.
- Repasses.
- Confirmacao manual auditada.
- Gateway accounts.
- Emissao preparada.
- Painel operacional financeiro.
- Reprocessamento de webhook.
- Base de conciliacao.

### O que falta

- Contas a pagar/receber completas.
- Fluxo de caixa completo.
- Relatorios completos.
- Conciliacao visual.
- Exportacao PDF/Excel.
- Fechamento mensal.
- Dashboard financeiro por proprietario/imovel/contrato.

## 12. Boletos, PIX e gateways

### O que o SDD pede

Emitir cobranças por boleto, PIX, cartao ou link. Apenas webhook validado ou excecao administrativa auditada pode marcar pagamento como pago.

### Como deve funcionar

Contrato/locacao gera cobranca. Gateway retorna boleto/PIX. Inquilino paga. Webhook confirma. Sistema atualiza financeiro, comissao, inadimplencia e repasse.

### O que ja existe

- Webhooks de pagamento.
- Payload bruto.
- Base de gateway accounts.
- Adapter Asaas parcial.
- Preparacao de PIX/boleto.
- Base de seguranca, conexoes, requests e homologacao.

### O que falta

- Gateway real em producao.
- Homologacao sandbox aplicada.
- Segunda via real.
- Cancelamento real.
- PIX/boleto reais com credenciais.
- Tela completa de gateways.
- PJBank/Iugu/Mercado Pago/Stripe.

## 13. IA imobiliaria

### O que o SDD pede

IA para:

- descricao de imovel;
- mensagens WhatsApp;
- anuncios;
- resumo de vistoria;
- analise de lead;
- chatbot;
- sugestao de preco.

Regra: IA nao pode inventar dados.

### Como deve funcionar

A IA recebe dados reais do banco ou informados pelo usuario, gera sugestao, registra uso, custo, usuario, empresa e resultado.

### O que ja existe

- Base de uso/custo de IA.
- Documentacao.
- Tabela `ai_usage_events`.

### O que falta

- Integracao real com provedor de IA.
- Prompts.
- Limite por plano.
- Historico de respostas.
- Revisao humana.
- Protecao contra invencao no fluxo real.

## 14. Automacoes e WhatsApp

### O que o SDD pede

Automacoes para:

- lead criado;
- lead parado;
- visita agendada;
- contrato vencendo;
- assinatura pendente;
- aluguel vencendo;
- aluguel atrasado;
- vistoria finalizada.

Canais:

- WhatsApp;
- email;
- push;
- notificacao interna.

### Como deve funcionar

Eventos internos disparam fluxos configuraveis. Mensagens usam templates e respeitam opt-in.

### O que ja existe

- Notificacoes.
- Templates.
- Eventos.
- Fila de despacho.
- Automacoes financeiras.
- Base nova de canais, contatos, conversas, mensagens e automacoes.

### O que falta

- WhatsApp API real.
- Inbox real.
- Automacoes editaveis.
- Opt-in aplicado em todos os fluxos.
- Chatbot.
- Workers agendados robustos.

## 15. Captacao de imoveis

### O que o SDD pede

Pipeline para captar novos imoveis:

```txt
Novo contato
Tentativa de contato
Visita agendada
Avaliacao realizada
Negociacao
Captacao fechada
Imovel publicado
```

### O que ja existe

- Pode ser parcialmente improvisado com CRM/imoveis.

### O que falta

- Modulo proprio.
- Pipeline de captacao.
- Proprietario potencial.
- Exclusividade.
- Conversao para imovel.
- Ranking de captadores.

## 16. Ranking de corretores

### O que o SDD pede

Medir:

- leads atendidos;
- tempo de resposta;
- visitas;
- propostas;
- vendas;
- locacoes;
- captacoes;
- comissoes;
- conversao;
- metas.

### O que ja existe

- Documentacao.

### O que falta

- Tabelas.
- Endpoints.
- Tela.
- Pontuacao configuravel.
- Relatorios por periodo.

## 17. Sites para imobiliarias

### O que o SDD pede

Cada imobiliaria deve ter site proprio com:

- templates;
- editor visual;
- logo/cores/textos;
- publicacao de imoveis reais;
- pagina de imovel;
- formulario que cria lead;
- WhatsApp;
- busca;
- SEO.

### O que ja existe

- Rota publica dinamica.
- Landing e paginas publicas.

### O que falta

- Site por empresa.
- Templates.
- Editor.
- Publicar/despublicar imovel.
- Pagina publica de imovel real.
- Busca.
- Formulario criando lead.
- SEO por imobiliaria.

## 18. Importacao de dados

### O que o SDD pede

Importar:

- CSV;
- Excel;
- XML;
- JSON;
- ZIP com imagens;
- URLs;
- feeds de portais.

Fluxo:

```txt
upload
mapeamento
validacao
previa
confirmacao
fila
relatorio final
```

### O que ja existe

- Documentacao.

### O que falta

- Modulo inteiro executavel.

## 19. Android

### O que o SDD pede

App Android focado em:

- login;
- assinatura validada;
- home operacional;
- CRM rapido;
- agenda;
- vistoria;
- camera;
- upload;
- assinatura na tela;
- push;
- offline.

### O que ja existe

- Base de banco para mobile/offline/PWA.

### O que falta

- App React Native/Expo.
- Todas as telas mobile.
- Camera/upload.
- Offline real.
- Push real.

## 20. Desktop Electron

### O que o SDD pede

Versao desktop empacotando a experiencia web.

### O que ja existe

- Documentacao.

### O que falta

- App Electron.
- Empacotamento.
- Login persistente seguro.
- Atualizacao.
- Bloqueio por assinatura igual ao web.

## 21. LGPD, seguranca e auditoria

### O que o SDD pede

Seguranca:

- HTTPS;
- segredos em variaveis;
- RLS;
- auditoria;
- CORS restrito;
- Helmet;
- rate limit;
- Zod;
- storage privado;
- backup;
- webhooks seguros.

LGPD:

- acesso;
- correcao;
- exclusao;
- portabilidade;
- retirada de consentimento;
- retencao;
- anonimização.

### O que ja existe

- Helmet.
- CORS.
- Zod em varios endpoints.
- RLS em migrations.
- Auditoria em partes sensiveis.
- Base de LGPD, incidentes, custos e release checks.

### O que falta

- Rate limit.
- Sentry/observabilidade real.
- Backup operacional.
- Tela LGPD.
- Endpoints LGPD.
- Rotinas de retencao.
- Auditoria uniforme em todos os modulos.
- Testes de seguranca.

## 22. Testes

### O que o SDD pede

Testes por fase:

- assinatura;
- multiempresa;
- CRM;
- imoveis;
- financeiro;
- permissoes.

### O que existe

Nao foram encontrados testes automatizados.

### O que falta

- Criar suite de testes.
- Testes de middleware.
- Testes de CRUD.
- Testes de isolamento `company_id`.
- Testes de webhooks.
- Testes de financeiro.

## Conclusao

O ImobiFlow tem uma fundacao grande, mas ainda nao esta completo conforme o SDD.

O maior risco agora e continuar criando arquitetura sem fechar funcionalidades executaveis.

Proximo caminho recomendado:

1. Aplicar migrations no Supabase.
2. Remover preview de producao.
3. Criar testes de assinatura/permissao/company_id.
4. Completar usuarios/roles/convites.
5. Completar CRM.
6. Completar imoveis/proprietarios/upload.
7. Completar agenda/visitas.
8. Completar locacao.
9. Completar financeiro/gateway.
10. Depois seguir para importacao, sites, IA, Android e Electron.

# ImobiFlow - Fase 11: Geracao inicial de PDF de vistoria

## Objetivo desta entrega

Transformar o detalhe da vistoria em um fluxo de laudo exportavel, com geracao de PDF, registro da URL na vistoria e acao visual para abrir o documento gerado.

Essa fase inicia a parte documental da vistoria inteligente prevista no SDD.

## Backend

Endpoint adicionado em `backend/src/routes/inspections.ts`:

- `POST /inspections/:id/pdf`

Validacoes aplicadas:

- login valido;
- empresa vinculada;
- assinatura ativa;
- permissao `inspections.pdf`;
- isolamento por `company_id`;
- vistoria existente dentro da empresa.

Comportamento:

- carrega vistoria, ambientes, itens e midias;
- gera um PDF tecnico inicial no backend;
- salva o arquivo no bucket `imobiflow-inspections`;
- cria URL assinada para acesso temporario;
- atualiza `inspections.pdf_url`;
- registra metadados de armazenamento em `inspections.metadata`.

Metadados salvos:

- `pdf_storage_bucket`;
- `pdf_storage_path`;
- `pdf_generated_at`.

## Gerador de PDF

Arquivo criado:

- `backend/src/services/inspection-pdf.ts`

O gerador cria um PDF real usando recursos nativos do Node, sem dependencia externa nesta fase.

Conteudo inicial do PDF:

- titulo do laudo;
- dados do imovel;
- tipo e status da vistoria;
- data de geracao;
- proprietario e locatario;
- resumo tecnico;
- indicadores;
- ambientes;
- itens tecnicos;
- reparos sinalizados;
- fotos e anexos referenciados.

## Interface interna

Tela atualizada:

- `/app/vistorias/$inspectionId`

Acoes adicionadas:

- `Gerar PDF`;
- `Gerar novo PDF`;
- `Abrir PDF`;
- `Abrir PDF gerado`.

Estados adicionados:

- carregamento durante geracao;
- erro especifico de geracao;
- status visual `PDF gerado` ou `PDF em preparacao`.

## Modo visualizacao

O modo preview tambem gera um PDF inicial via `data:application/pdf`.

Isso permite validar o fluxo do produto na Vercel mesmo enquanto a API real ainda nao esta configurada no ambiente de producao.

## Observacoes tecnicas

O campo `pdf_url` recebe uma URL assinada. Como URLs assinadas expiram, o caminho permanente do arquivo tambem fica salvo em `metadata.pdf_storage_path`.

Em fase futura, a API deve regenerar a URL assinada quando o usuario abrir um PDF antigo.

## Proximas etapas recomendadas

Etapa concluida na Fase 12:

- base de assinatura digital das partes;
- auditoria basica da assinatura;
- resumo de assinaturas no PDF.

Proximas evolucoes:

1. Melhorar o layout visual do PDF com identidade premium.
2. Criar assinatura externa por link publico seguro.
3. Criar comparacao entrada vs saida.
4. Adicionar historico de versoes do laudo.
5. Criar trilha de auditoria imutavel com hash do PDF.

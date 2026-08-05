# Importador com API e MySQL no Railway staging

Data da medicao: 2026-08-05.

Este documento registra um teste sintetico de staging. Ele nao e benchmark de producao e nao comprova capacidade para 500 ou 5.000 imoveis.

## Configuracao implantada

- servico: `imobiflow-api-staging`;
- runtime: `NODE_ENV=staging`;
- origem implantada: branch `integration/platform-monorepo`, commit `6115f08ee475a053aadad01be18030a6ba8b0b3c`;
- raiz do artefato: `platform/`, enviada com `--path-as-root`;
- instalacao: `npm ci`;
- Prisma e build: `npm run prisma:generate && npm --prefix backend run build`;
- start: `npm --prefix backend run start`;
- bind: `0.0.0.0:$PORT`;
- healthcheck: `GET /health`;
- banco: MySQL de staging no mesmo projeto/ambiente Railway, usando referencia a `MYSQL_URL` e hostname privado `mysql.railway.internal`;
- storage: Cloudinary de staging, pasta `imobiflow/staging/imports`;
- concorrencia de midia: 3;
- metricas de importacao: habilitadas somente em staging.

O ambiente Railway conserva o rotulo padrao `production`, mas o recurso, os dados e o runtime sao exclusivamente de staging. A landing page nao faz parte do artefato e nao foi implantada. O deploy nao executa migration, seed, `db push` ou `migrate reset`.

O primeiro build foi interrompido antes do runtime porque o lockfile nao era aceito pelo npm 10.9.8 do Railpack. O lock foi regenerado e validado com a mesma versao. Uma tentativa seguinte foi corretamente identificada como `SKIPPED` por um `watchPatterns` incompatível com `--path-as-root`; o filtro foi removido antes do deployment final. Nenhuma dessas tentativas tocou nos dados.

## Validacao da API

| Verificacao | Resultado |
| --- | ---: |
| Deployment final | `SUCCESS` |
| `GET /health` | HTTP 200 |
| Login MySQL | HTTP 200 |
| Rota autenticada de importacoes | HTTP 200 |
| Segredo exposto pelo healthcheck | nao |
| Migrations aplicadas | 7 |
| Migration pendente | nenhuma |

O login e a rota autenticada comprovam o uso do Prisma pela API hospedada contra o MySQL privado. A sessao SSH nao estava disponivel por ausencia de chave SSH local; `prisma migrate status` foi repetido em modo somente leitura contra o mesmo banco de staging e retornou schema atualizado.

## Cenario A — 50 imoveis sem imagens

Arquivo CSV: 6.255 bytes. O endpoint `/imports/start` criou o job e processou o primeiro lote; a chamada seguinte processou o segundo lote.

| Medida | Railway API + MySQL privado |
| --- | ---: |
| `/imports/start` + primeiro lote | 1.976,16 ms |
| Segundo lote | 1.871,86 ms |
| Total medido, incluindo relatorio | 4.066,30 ms |
| Media por imovel | 81,33 ms |
| Imoveis importados | 50 |
| Duplicados | 0 |
| Cursor apos primeiro lote | 27 |
| Cursor final | 51 |
| Chamadas concorrentes | HTTP 200 / 409 |
| Idempotencia | aprovada |
| Operacoes instrumentadas de persistencia | 105 |

As 105 operacoes sao etapas de alto nivel observadas pela instrumentacao: 1 criacao de job, 1 criacao de ImportRows, 50 buscas de duplicidade, 50 criacoes de imovel e 3 atualizacoes de contadores. Elas nao equivalem a uma contagem exata de queries SQL do Prisma.

## Retomada e isolamento

O servico Railway foi reiniciado depois do primeiro lote de um job sintetico separado de 50 linhas.

| Verificacao | Resultado |
| --- | ---: |
| Cursor antes do restart | 27 |
| Cursor depois do restart | 27 |
| Processados antes/depois | 25 / 25 |
| Imoveis antes do restart | 25 |
| Imoveis ao concluir | 50 |
| Status final | `COMPLETED` |
| Duplicados | 0 |
| Propriedades depois do rollback | 0 |
| Empresa B acessando job da Empresa A | HTTP 404 |

## Cenario B — 50 imoveis com midias

O primeiro imovel recebeu 20 URLs de imagem distintas e controladas, uma URL inexistente e uma URL localhost. Os 50 registros continham URLs externas de video e tour. Videos e tours permaneceram como URL e nao entraram nas metricas de download/upload do StorageProvider.

| Medida | Railway API + MySQL privado |
| --- | ---: |
| `/imports/start` + primeiro lote | 10.398,87 ms |
| Segundo lote | 1.894,23 ms |
| Total dos dois lotes | 12.293,10 ms |
| Media por imovel | 245,86 ms |
| Imoveis importados | 50 |
| Duplicados | 0 |
| Tentativas de download | 22 |
| Uploads pelo StorageProvider | 20 |
| Assets fisicos do job | 20 |
| Imagens rejeitadas | 2 |
| StoredFile para localhost | 0 |
| Media por download | 325,65 ms |
| Media por upload | 728,66 ms |
| Operacoes instrumentadas de persistencia | 167 |

A soma das etapas de midia foi 22.414,37 ms, maior que o tempo de parede porque ate tres midias foram processadas em paralelo. As 167 operacoes de alto nivel incluem as 105 do cenario sem imagens, 22 buscas de deduplicacao, 20 criacoes de StoredFile e 20 vinculos PropertyMedia.

## Comparacao com API local e MYSQL_PUBLIC_URL

| Cenario | Local + MySQL publico | Railway + MySQL privado | Reducao absoluta | Ganho observado |
| --- | ---: | ---: | ---: | ---: |
| Sem imagens — total | 190.678,68 ms | 4.066,30 ms | 186.612,38 ms | 97,87% |
| Sem imagens — start/lote 1 | 96.552,25 ms | 1.976,16 ms | 94.576,09 ms | 97,95% |
| Sem imagens — lote 2 | 92.675,23 ms | 1.871,86 ms | 90.803,37 ms | 97,98% |
| Com imagens — total dos lotes | 224.974,69 ms | 12.293,10 ms | 212.681,59 ms | 94,54% |
| Com imagens — start/lote 1 | 132.305,43 ms | 10.398,87 ms | 121.906,56 ms | 92,14% |
| Com imagens — lote 2 | 92.669,26 ms | 1.894,23 ms | 90.775,03 ms | 97,96% |

Os ganhos sao observacoes desta rodada, nao garantias. A comparacao mistura rede, regiao, aquecimento de cache e variacao dos fornecedores. O cenario de midia concentrou as 20 imagens no primeiro imovel para isolar o pipeline de concorrencia.

## Memoria e limpeza

Metricas Railway agregadas na janela de 15 minutos que incluiu teste e restart:

- memoria media: 40,63 MB;
- memoria maxima observada: 90,78 MB;
- limite informado: 1.024,00 MB;
- utilizacao maxima informada: 8,9%.

Auditoria depois do `finally` e dos rollbacks:

- 3 jobs mais recentes em `CANCELED`;
- 150 ImportRows preservadas como trilha de auditoria;
- 0 propriedades dos jobs;
- 0 StoredFiles dos jobs;
- 0 assets no prefixo Cloudinary de staging;
- banco com 1.622.016 bytes alocados, igual ao valor de referencia anterior.

## Acesso publico do MySQL

A API hospedada funciona pela rede privada e nao precisa de `MYSQL_PUBLIC_URL`. O proxy publico ainda e usado pelos scripts locais de auditoria e pela manutencao local com Prisma. Sua remocao deve ocorrer em tarefa separada, depois que essas rotinas forem movidas para um caminho privado/controlado. Nenhum acesso publico foi removido nesta etapa.

## Limites desta evidencia

- nao houve teste de 500 ou 5.000 imoveis;
- nao houve dados reais;
- nao houve contagem exata de queries SQL;
- nao houve teste de carga simultanea entre varias imobiliarias;
- nao houve deploy, alteracao ou integracao da landing page;
- o dominio Railway e temporario e exclusivo do staging;
- estes numeros nao devem ser extrapolados como capacidade comprovada.

# Importação sintética de 5.000 imóveis no Railway staging

Data da medição: 2026-08-05.

Este documento registra uma validação controlada em staging. Não é benchmark de produção, não utiliza dados reais e não mede importação de imagens.

## Arquitetura e escopo

- serviço avaliado: `imobiflow-api-staging`;
- runtime da aplicação: `NODE_ENV=staging`;
- API e MySQL exclusivos de staging no mesmo projeto Railway;
- conexão API → MySQL pela rede privada do Railway;
- duas imobiliárias fictícias, com uma única imobiliária importadora;
- 5.000 imóveis sintéticos sem imagens, vídeos, tours ou ZIP;
- lote de 100, totalizando 50 lotes;
- `mode=full` com `confirm_full_import=true`;
- runner protegido por `ALLOW_IMPORT_STAGING_TEST=true` e `CONFIRM_IMPORT_5000_STAGING=true`;
- nenhuma migration, seed, reset, `db push`, índice novo ou alteração de recursos;
- nenhum uso do Cloudinary;
- nenhuma alteração do importador, dos endpoints de imóveis ou da landing page durante a medição.

O ambiente da Railway usa o rótulo interno `production`, mas o projeto contém somente os serviços de staging e a aplicação estava explicitamente com `NODE_ENV=staging`. Isso foi confirmado sem exibir variáveis ou URLs completas.

## Preflight

O preflight foi executado antes da criação do job e aprovou:

| Verificação                          |           Resultado |
| ------------------------------------ | ------------------: |
| Migrations aplicadas                 | 8, nenhuma pendente |
| Healthcheck                          |            HTTP 200 |
| Empresas fictícias                   |                   2 |
| Usuários fictícios                   |                   2 |
| Imóveis sintéticos preexistentes     |                   1 |
| ImportJobs históricos de staging     |                  13 |
| ImportRows históricas de staging     |               2.000 |
| StoredFiles sintéticos preexistentes |                   1 |
| PropertyMedia                        |                   0 |
| Jobs em `PROCESSING`                 |                   0 |

Os jobs históricos pertenciam exclusivamente aos usuários fictícios das duas empresas de staging. O imóvel e o arquivo preexistentes também passaram pelas verificações de origem sintética.

## Fixture reproduzível

A fixture foi gerada em memória pelo runner, sem versionar o CSV:

- 5.000 linhas exatas;
- 643.171 bytes, abaixo de 10 MB;
- 5.000 códigos únicos;
- 5.000 identificadores externos únicos;
- tipos, finalidades, status, cidades e bairros sintéticos variados;
- zero URLs de mídia;
- zero imagens, vídeos, tours ou ZIP;
- marcador inequívoco `synthetic_5000_staging` no nome da origem e nos identificadores.

O `source_type` persistido continua sendo `csv`, conforme o contrato tipado do backend. O marcador de benchmark fica no `source_name`, no nome da fixture e nos códigos, sem enfraquecer a enumeração de formatos suportados.

## Resultado da importação

| Métrica                                           |     Resultado |
| ------------------------------------------------- | ------------: |
| `/imports/start`, incluindo lote 1                |   3.366,99 ms |
| Duração acumulada dos 50 lotes                    | 136.873,47 ms |
| Fluxo até `COMPLETED`, incluindo restart          | 170.668,57 ms |
| Fluxo até terminar as medições, antes do rollback | 235.841,01 ms |
| Fluxo completo, incluindo rollback                | 248.124,59 ms |
| Média por lote                                    |   2.737,47 ms |
| Média por imóvel                                  |      27,37 ms |
| p50 dos lotes                                     |   2.483,31 ms |
| p95 dos lotes                                     |   3.807,88 ms |
| Lote mais rápido                                  |   1.802,23 ms |
| Lote mais lento                                   |   4.003,51 ms |
| ImportRows criadas                                |         5.000 |
| Imóveis importados                                |         5.000 |
| Duplicados                                        |             0 |
| Falhas                                            |             0 |
| Mídias e StoredFiles do job                       |             0 |
| Cursor final                                      |         5.001 |
| Status final                                      |   `COMPLETED` |

Foram realizadas 297 chamadas HTTP no cenário completo, incluindo aquecimentos, validações de paginação, isolamento, concorrência de leitura, rollback e duas verificações de saúde.

### Duração por lote

| Lote |     Duração | Cursor | Processados | Status                |
| ---: | ----------: | -----: | ----------: | --------------------- |
|    1 | 3.366,99 ms |    102 |         100 | `PARTIALLY_COMPLETED` |
|    2 | 1.802,23 ms |    202 |         200 | `PARTIALLY_COMPLETED` |
|    3 | 2.367,39 ms |    302 |         300 | `PARTIALLY_COMPLETED` |
|    4 | 2.171,71 ms |    402 |         400 | `PARTIALLY_COMPLETED` |
|    5 | 2.222,88 ms |    502 |         500 | `PARTIALLY_COMPLETED` |
|    6 | 2.372,95 ms |    602 |         600 | `PARTIALLY_COMPLETED` |
|    7 | 2.746,90 ms |    702 |         700 | `PARTIALLY_COMPLETED` |
|    8 | 2.578,17 ms |    802 |         800 | `PARTIALLY_COMPLETED` |
|    9 | 2.243,42 ms |    902 |         900 | `PARTIALLY_COMPLETED` |
|   10 | 2.414,08 ms |  1.002 |       1.000 | `PARTIALLY_COMPLETED` |
|   11 | 2.175,74 ms |  1.102 |       1.100 | `PARTIALLY_COMPLETED` |
|   12 | 2.179,40 ms |  1.202 |       1.200 | `PARTIALLY_COMPLETED` |
|   13 | 2.278,60 ms |  1.302 |       1.300 | `PARTIALLY_COMPLETED` |
|   14 | 2.267,30 ms |  1.402 |       1.400 | `PARTIALLY_COMPLETED` |
|   15 | 2.052,05 ms |  1.502 |       1.500 | `PARTIALLY_COMPLETED` |
|   16 | 2.186,65 ms |  1.602 |       1.600 | `PARTIALLY_COMPLETED` |
|   17 | 2.277,49 ms |  1.702 |       1.700 | `PARTIALLY_COMPLETED` |
|   18 | 2.184,89 ms |  1.802 |       1.800 | `PARTIALLY_COMPLETED` |
|   19 | 2.219,37 ms |  1.902 |       1.900 | `PARTIALLY_COMPLETED` |
|   20 | 2.278,76 ms |  2.002 |       2.000 | `PARTIALLY_COMPLETED` |
|   21 | 2.213,88 ms |  2.102 |       2.100 | `PARTIALLY_COMPLETED` |
|   22 | 2.052,69 ms |  2.202 |       2.200 | `PARTIALLY_COMPLETED` |
|   23 | 2.272,85 ms |  2.302 |       2.300 | `PARTIALLY_COMPLETED` |
|   24 | 2.496,39 ms |  2.402 |       2.400 | `PARTIALLY_COMPLETED` |
|   25 | 2.336,04 ms |  2.502 |       2.500 | `PARTIALLY_COMPLETED` |
|   26 | 2.332,88 ms |  2.602 |       2.600 | `PARTIALLY_COMPLETED` |
|   27 | 2.518,55 ms |  2.702 |       2.700 | `PARTIALLY_COMPLETED` |
|   28 | 2.441,44 ms |  2.802 |       2.800 | `PARTIALLY_COMPLETED` |
|   29 | 2.376,23 ms |  2.902 |       2.900 | `PARTIALLY_COMPLETED` |
|   30 | 2.523,56 ms |  3.002 |       3.000 | `PARTIALLY_COMPLETED` |
|   31 | 2.483,31 ms |  3.102 |       3.100 | `PARTIALLY_COMPLETED` |
|   32 | 3.019,79 ms |  3.202 |       3.200 | `PARTIALLY_COMPLETED` |
|   33 | 3.103,73 ms |  3.302 |       3.300 | `PARTIALLY_COMPLETED` |
|   34 | 3.014,12 ms |  3.402 |       3.400 | `PARTIALLY_COMPLETED` |
|   35 | 3.162,90 ms |  3.502 |       3.500 | `PARTIALLY_COMPLETED` |
|   36 | 3.501,00 ms |  3.602 |       3.600 | `PARTIALLY_COMPLETED` |
|   37 | 3.509,92 ms |  3.702 |       3.700 | `PARTIALLY_COMPLETED` |
|   38 | 3.149,08 ms |  3.802 |       3.800 | `PARTIALLY_COMPLETED` |
|   39 | 3.263,32 ms |  3.902 |       3.900 | `PARTIALLY_COMPLETED` |
|   40 | 4.003,51 ms |  4.002 |       4.000 | `PARTIALLY_COMPLETED` |
|   41 | 3.857,48 ms |  4.102 |       4.100 | `PARTIALLY_COMPLETED` |
|   42 | 3.807,88 ms |  4.202 |       4.200 | `PARTIALLY_COMPLETED` |
|   43 | 3.568,23 ms |  4.302 |       4.300 | `PARTIALLY_COMPLETED` |
|   44 | 3.704,47 ms |  4.402 |       4.400 | `PARTIALLY_COMPLETED` |
|   45 | 3.565,45 ms |  4.502 |       4.500 | `PARTIALLY_COMPLETED` |
|   46 | 3.399,25 ms |  4.602 |       4.600 | `PARTIALLY_COMPLETED` |
|   47 | 3.251,72 ms |  4.702 |       4.700 | `PARTIALLY_COMPLETED` |
|   48 | 3.028,14 ms |  4.802 |       4.800 | `PARTIALLY_COMPLETED` |
|   49 | 3.185,22 ms |  4.902 |       4.900 | `PARTIALLY_COMPLETED` |
|   50 | 3.343,47 ms |  5.001 |       5.000 | `COMPLETED`           |

## Retomada, concorrência e idempotência

O serviço Railway foi reiniciado completamente depois do lote 25.

| Verificação        | Antes do restart | Depois do restart |
| ------------------ | ---------------: | ----------------: |
| Cursor             |            2.502 |             2.502 |
| Linhas processadas |            2.500 |             2.500 |
| Linhas importadas  |            2.500 |             2.500 |
| Imóveis do job     |            2.500 |             2.500 |

A retomada prosseguiu do lote 26 e terminou no lote 50. Em uma disputa intermediária, uma chamada recebeu HTTP 200 e a outra HTTP 409; o contador avançou exatamente 100 linhas. Depois de `COMPLETED`, uma nova chamada manteve 5.000 imóveis antes e depois, comprovando idempotência.

## Isolamento empresarial

A Empresa B tentou acessar recursos da Empresa A:

| Operação               |            Resultado |
| ---------------------- | -------------------: |
| Relatório do job       |             HTTP 404 |
| Processar próximo lote |             HTTP 404 |
| Retry                  |             HTTP 404 |
| Rollback               |             HTTP 404 |
| Detalhe do imóvel      |             HTTP 404 |
| Busca por código       |             HTTP 404 |
| Busca por external ID  |             HTTP 404 |
| Listagem               | HTTP 200, zero itens |

Um `company_id` malicioso enviado pela Empresa B foi ignorado. Não houve vazamento de nenhum imóvel do benchmark.

## Paginação com 5.001 imóveis

Durante as leituras, a Empresa A tinha os 5.000 imóveis do job e um imóvel sintético preexistente.

Com `page_size=100`, todas as 51 páginas foram percorridas uma vez:

- 5.001 itens lidos;
- 5.001 IDs únicos;
- zero sobreposição;
- primeira página com 100 itens;
- última página com 1 item;
- página 52 com envelope válido e lista vazia;
- `total=5001`, `total_pages=51`, `has_next` e `has_previous` coerentes;
- ordenação estável durante toda a leitura.

Os contratos também foram aprovados com `page_size=25`, `50` e `100`:

| `page_size` | Total de páginas |  Primeira | Última | Além do total |
| ----------: | ---------------: | --------: | -----: | ------------: |
|          25 |              201 |  25 itens | 1 item |       0 itens |
|          50 |              101 |  50 itens | 1 item |       0 itens |
|         100 |               51 | 100 itens | 1 item |       0 itens |

## Latência das leituras pela API hospedada

Cada consulta medida teve um aquecimento separado e sete amostras. O caminho foi cliente do benchmark → API hospedada → MySQL privado.

| Consulta               |     Média |       p50 | p95/máxima | Itens | Payload médio |
| ---------------------- | --------: | --------: | ---------: | ----: | ------------: |
| Página 1               | 366,93 ms | 293,76 ms |  784,96 ms |   100 |  80.646 bytes |
| Página 2               | 272,29 ms | 274,68 ms |  280,97 ms |   100 |  80.649 bytes |
| Página 10              | 276,09 ms | 269,50 ms |  298,88 ms |   100 |  80.642 bytes |
| Página 25              | 310,57 ms | 285,00 ms |  493,03 ms |   100 |  80.649 bytes |
| Página 40              | 283,42 ms | 281,18 ms |  306,45 ms |   100 |  80.645 bytes |
| Página 50              | 295,57 ms | 279,31 ms |  353,37 ms |   100 |  80.440 bytes |
| Página 51              | 288,36 ms | 290,44 ms |  306,16 ms |     1 |     855 bytes |
| Página 52, vazia       | 239,61 ms | 234,69 ms |  255,07 ms |     0 |     120 bytes |
| Código                 | 272,25 ms | 275,91 ms |  277,63 ms |     1 |   1.114 bytes |
| External ID            | 279,49 ms | 277,77 ms |  293,24 ms |     1 |   1.110 bytes |
| Detalhe                | 268,44 ms | 263,09 ms |  281,85 ms |     1 |   1.114 bytes |
| Finalidade             | 314,35 ms | 286,65 ms |  529,40 ms |   100 |  80.711 bytes |
| Tipo                   | 291,73 ms | 292,36 ms |  335,14 ms |   100 |  80.485 bytes |
| Status                 | 291,59 ms | 283,77 ms |  332,73 ms |   100 |  80.858 bytes |
| Busca textual limitada | 310,18 ms | 309,33 ms |  322,73 ms |     1 |     917 bytes |

Conjunto das 105 amostras principais: média de 290,72 ms, p50 de 278,38 ms, p95 de 335,14 ms e máxima de 784,96 ms.

A página 50 foi 71,36 ms mais rápida em média do que a página 1 nesta amostra. Não apareceu degradação relevante do offset até 4.900 registros, mas isso não prova o mesmo comportamento em volumes muito maiores.

## OFFSET, COUNT e índices

O `EXPLAIN` foi somente de leitura e não houve criação de índice durante o benchmark:

| Consulta            | Índice escolhido                          | Acesso  | Observação                         |
| ------------------- | ----------------------------------------- | ------- | ---------------------------------- |
| Página 1            | `properties_company_id_created_at_id_idx` | `ref`   | backward index scan, covering      |
| Página 50           | `properties_company_id_created_at_id_idx` | `ref`   | backward index scan, covering      |
| `COUNT` por empresa | `properties_company_id_code_key`          | `ref`   | covering pelo prefixo de empresa   |
| Código              | `properties_company_id_code_key`          | `const` | uma linha estimada                 |
| External ID         | `properties_company_import_external_idx`  | `ref`   | uma linha estimada                 |
| Tipo                | `properties_company_id_property_type_idx` | `ref`   | índice composto por empresa e tipo |

O `COUNT` isolado foi medido por uma conexão local ao endpoint público do MySQL, portanto não é subtraível diretamente da latência da rota hospedada: média de 189,56 ms, p50 de 188,85 ms, p95/máxima de 192,47 ms para 5.001 linhas. A listagem hospedada continua calculando total em cada página; esse custo deve ser reavaliado em volumes maiores.

## Concorrência leve de leitura

Foi executado um teste curto, somente de leitura, com no máximo cinco clientes simultâneos e páginas/filtros variados:

- 50 requisições;
- 50 sucessos;
- zero erros;
- zero vazamentos empresariais;
- média de 340,34 ms;
- p50 de 293,76 ms;
- p95 de 906,94 ms;
- máxima de 964,65 ms.

Não foi um teste de estresse e não houve outra importação simultânea.

## Recursos Railway

Janela que incluiu importação, restart, leituras e rollback:

- memória média: 183,24 MB;
- memória máxima: 204,31 MB;
- limite informado: aproximadamente 1.024 MB;
- CPU média: 0,1197 vCPU;
- CPU máxima: 0,2219 vCPU;
- limite informado: 2 vCPU.

## Banco

Contagens lógicas:

| Fase                 | Properties | ImportJobs | ImportRows | StoredFiles | PropertyMedia | Jobs processando |
| -------------------- | ---------: | ---------: | ---------: | ----------: | ------------: | ---------------: |
| Antes                |          1 |         13 |      2.000 |           1 |             0 |                0 |
| Depois da importação |      5.001 |         14 |      7.000 |           1 |             0 |                0 |
| Depois do rollback   |          1 |         14 |      7.000 |           1 |             0 |                0 |

O `information_schema` informou 1.622.016 bytes alocados em todas as três fases, sendo 442.368 bytes de dados e 1.179.648 bytes de índices. As estimativas de linhas das tabelas permaneceram zeradas e os blocos alocados não mudaram durante a janela. Portanto, essa leitura não mede o crescimento lógico do job e não deve ser interpretada como “o banco não cresceu”. O InnoDB pode reutilizar páginas e não reduzir espaço alocado após `DELETE`.

As conexões observadas foram 11 antes, 11 no restart, 12 depois das leituras e 12 depois do rollback.

## Rollback

O primeiro rollback removeu somente o que foi criado pelo job:

- 5.000 propriedades;
- zero proprietários;
- zero mídias;
- zero registros de arquivo;
- zero arquivos de provider.

Depois do rollback:

- zero propriedades vinculadas ao job;
- zero mídias vinculadas ao job;
- zero StoredFiles vinculados ao job;
- 5.000 ImportRows preservadas para auditoria;
- o imóvel sintético anterior foi preservado;
- as duas empresas e os dois usuários foram preservados;
- zero jobs permaneceram em `PROCESSING`.

A segunda chamada retornou o mesmo resultado lógico armazenado no job, confirmando idempotência.

## Comparação com o cenário de 500

| Cenário                    | Lote | Duração acumulada dos lotes | Média por imóvel |
| -------------------------- | ---: | --------------------------: | ---------------: |
| 500 imóveis após paginação |   50 |                14.144,46 ms |         28,29 ms |
| 5.000 imóveis              |  100 |               136.873,47 ms |         27,37 ms |

O cenário de 5.000 processou dez vezes mais imóveis em aproximadamente 9,68 vezes a duração acumulada de lotes. A média observada por imóvel ficou cerca de 3,3% menor. Isso não deve ser apresentado como ganho definitivo: os tamanhos de lote, aquecimento, rede e variação do Railway são diferentes.

## Limitações

- uma única imobiliária importou; a segunda foi usada somente para isolamento;
- não houve imagens, mídia, Cloudinary ou ZIP;
- não houve dados reais nem produção;
- não houve importações simultâneas de várias empresas;
- a paginação por offset foi validada até 5.001 imóveis, não em escalas superiores;
- o `COUNT` isolado foi medido pelo endpoint público do MySQL, enquanto as métricas principais vieram da API hospedada;
- o tamanho alocado do InnoDB não forneceu delta útil por job;
- o teste leve de cinco leitores não é teste de estresse;
- os resultados são observações de staging na data indicada e não garantia de SLA.

## Validações do repositório

- Prisma Client gerado com `DATABASE_URL` dummy;
- schema Prisma validado com `DATABASE_URL` dummy;
- 140/140 testes aprovados em 18 arquivos;
- build da plataforma aprovado;
- build TypeScript do backend aprovado;
- build da landing aprovado, sem alteração de seus arquivos;
- `tsc --noEmit` global aprovado sem diagnósticos;
- `git diff --check` aprovado;
- `.env` ignorado e nenhum arquivo `.env` real versionado;
- `platform/.tmp` sem arquivos rastreados;
- zero referências à ferramenta de origem no workspace relevante;
- zero padrões de credencial encontrados no runner ou neste documento;
- nenhuma migration adicionada ou alterada.

O `npm audit`, executado sem `fix` e sem `--force`, registrou:

| Workspace  | Baixa | Moderada | Alta | Crítica | Total |
| ---------- | ----: | -------: | ---: | ------: | ----: |
| Raiz       |     0 |        3 |    1 |       0 |     4 |
| Plataforma |     0 |        7 |    1 |       0 |     8 |
| Backend    |     1 |        2 |    0 |       0 |     3 |

As contagens não devem ser somadas porque dependências transitivas podem aparecer em mais de um workspace. Nenhuma dependência foi modificada nesta tarefa, portanto o benchmark não introduziu vulnerabilidades novas.

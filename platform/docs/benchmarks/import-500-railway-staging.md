# Importação sintética de 500 imóveis no Railway staging

Data da medição: 2026-08-05.

Este documento registra uma validação sintética de staging. Não é benchmark de produção e não comprova capacidade para 5.000 imóveis.

## Escopo e proteções

- serviço: `imobiflow-api-staging`;
- runtime: `NODE_ENV=staging`;
- API e MySQL de staging no mesmo projeto/ambiente Railway;
- conexão da API com o banco por `mysql.railway.internal`;
- uma imobiliária fictícia importadora e uma segunda imobiliária fictícia para isolamento;
- 500 imóveis sintéticos, sem imagens, vídeos ou tours;
- lote de 50, totalizando dez lotes;
- `mode=full` com `confirm_full_import=true`;
- sessão protegida por `ALLOW_IMPORT_STAGING_TEST=true` e `CONFIRM_IMPORT_500_STAGING=true`;
- nenhuma migration, seed, `db push`, reset ou alteração do MySQL;
- nenhum dado real e nenhuma chamada ao Cloudinary.

Antes do benchmark final havia duas empresas, dois usuários, um imóvel sintético anterior, zero jobs em `PROCESSING` e sete migrations aplicadas sem falha. A verificação negativa confirmou que o executor bloqueia `NODE_ENV=production` e a ausência da confirmação específica de 500.

## Resultado da importação

Arquivo CSV: 48.280 bytes. Todos os 500 códigos e identificadores externos eram únicos.

| Lote | Duração | Cursor | Processados | Status |
| ---: | ---: | ---: | ---: | --- |
| 1, incluindo `/imports/start` | 3.704,03 ms | 52 | 50 | `PARTIALLY_COMPLETED` |
| 2 | 3.228,58 ms | 102 | 100 | `PARTIALLY_COMPLETED` |
| 3 | 3.235,32 ms | 152 | 150 | `PARTIALLY_COMPLETED` |
| 4 | 3.230,60 ms | 202 | 200 | `PARTIALLY_COMPLETED` |
| 5 | 3.141,22 ms | 252 | 250 | `PARTIALLY_COMPLETED` |
| 6 | 3.350,23 ms | 302 | 300 | `PARTIALLY_COMPLETED` |
| 7 | 3.418,60 ms | 352 | 350 | `PARTIALLY_COMPLETED` |
| 8 | 3.468,70 ms | 402 | 400 | `PARTIALLY_COMPLETED` |
| 9 | 3.411,36 ms | 452 | 450 | `PARTIALLY_COMPLETED` |
| 10 | 3.398,60 ms | 501 | 500 | `COMPLETED` |

Resumo dos lotes:

- duração acumulada: 33.587,24 ms;
- média por lote: 3.358,72 ms;
- p50 dos lotes: 3.350,23 ms;
- p95 dos lotes: 3.704,03 ms;
- maior lote: 3.704,03 ms;
- média por imóvel: 67,17 ms;
- 500 ImportRows criadas;
- 500 imóveis importados;
- zero duplicados;
- zero falhas;
- zero mídias e zero StoredFiles do job;
- 24 chamadas HTTP de teste e duas verificações de saúde.

A instrumentação interna registrou dez execuções de `batch_total`, 500 buscas de duplicidade, 500 criações de imóvel, onze atualizações de contadores, uma criação de job e uma criação em lote das ImportRows. Essas são etapas de alto nível e não uma contagem exata de queries SQL.

## Reinicialização, concorrência e idempotência

O serviço Railway foi reiniciado completamente depois do quinto lote.

| Verificação | Resultado |
| --- | ---: |
| Cursor antes/depois do restart | 252 / 252 |
| Importados antes/depois | 250 / 250 |
| Imóveis antes/depois | 250 / 250 |
| Continuação após restart | aprovada |
| Disputa concorrente | HTTP 200 / 409 |
| Chamada após `COMPLETED` | sem nova criação |
| Imóveis antes/depois da repetição | 500 / 500 |

## Isolamento empresarial

- Empresa B consultando o relatório da Empresa A: HTTP 404;
- listagem HTTP da Empresa B: zero imóveis;
- imóveis do job da Empresa A vazados para Empresa B: zero.

## Consultas com 500 imóveis

A rota autenticada atual `/real-estate/properties` não oferece paginação, busca por código/external ID, filtros por finalidade/tipo ou detalhe por GET. Para não ampliar a API nesta tarefa, foram medidos dois caminhos distintos:

1. listagem real via API Railway, que ainda retorna todos os imóveis da empresa;
2. paginação, buscas, filtros e detalhe diretamente pelo Prisma usando o proxy público local do MySQL.

As latências Prisma abaixo incluem a rede pública local e não medem a rede privada API → MySQL.

| Consulta Prisma | Média | p50 | p95/máxima | Retorno |
| --- | ---: | ---: | ---: | ---: |
| Primeira página | 232,57 ms | 193,99 ms | 386,95 ms | 50 |
| Página intermediária | 243,71 ms | 252,83 ms | 261,80 ms | 50 |
| Última página | 247,11 ms | 253,23 ms | 276,04 ms | 50 |
| Busca por código | 228,69 ms | 193,18 ms | 375,52 ms | 1 |
| Busca por external ID | 235,74 ms | 198,98 ms | 397,78 ms | 1 |
| Detalhe | 228,91 ms | 189,07 ms | 382,89 ms | 1 |
| Finalidade venda | 231,71 ms | 195,47 ms | 376,10 ms | 50 |
| Tipo casa | 231,73 ms | 193,51 ms | 377,19 ms | 50 |
| Contagem da Empresa A | 193,40 ms | 194,10 ms | 197,77 ms | 501 |

Conjunto agregado Prisma: média 230,40 ms, p50 195,65 ms, p95 382,89 ms e máxima 397,78 ms. As três páginas retornaram 50 itens, sem sobreposição.

A listagem HTTP real retornou 501 imóveis — os 500 do job e o imóvel sintético anterior — com média de 730,21 ms, p50 de 353,20 ms e p95/máxima de 1.393,20 ms. A ausência de paginação no servidor é uma limitação confirmada e deve ser corrigida antes de testes de escala maiores.

Índices presentes e alinhados às consultas:

- `company_id + code`, único;
- `company_id + status + published_at`;
- `company_id + operation`;
- `company_id + city + neighborhood`;
- `company_id + import_source + import_external_id`;
- `company_id + import_job_id`.

Não existe índice composto para `company_id + property_type`. O `EXPLAIN` executado depois do rollback encontrou somente o imóvel sintético anterior e preferiu o prefixo por empresa do índice de código; portanto ele não é evidência suficiente do plano escolhido durante as 500 linhas. O executor foi ajustado para preservar corretamente os campos posicionais de `EXPLAIN` em uma futura rodada.

## Recursos Railway

Janela que incluiu importação, consultas, restart e rollback:

- memória média: 55,48 MB;
- memória máxima: 83,22 MB;
- limite informado: aproximadamente 1.024 MB;
- CPU média: 0,0180 vCPU;
- CPU máxima: 0,0541 vCPU;
- limite informado: 2 vCPU.

## Banco e rollback

O valor de `information_schema` permaneceu em 1.622.016 bytes antes da importação, depois da importação e depois do rollback. Essa medida representa espaço alocado pelo InnoDB e não crescimento lógico exato por job.

O primeiro rollback removeu:

- 500 propriedades;
- zero proprietários;
- zero mídias;
- zero registros de arquivo;
- zero arquivos de provider.

A segunda chamada retornou o mesmo resultado lógico, comprovando idempotência. Depois da limpeza:

- zero propriedades vinculadas ao job;
- 500 ImportRows preservadas para auditoria;
- o imóvel sintético anterior permaneceu intacto;
- Empresa A e Empresa B permaneceram intactas;
- zero jobs em `PROCESSING`.

Uma primeira execução do mesmo cenário também processou e removeu corretamente 500 imóveis, mas o harness a invalidou porque comparava a ordem textual das chaves de `rollback_json`. O MySQL retornou as mesmas contagens em ordem diferente. A comparação foi corrigida para igualdade por campos, e todos os números deste documento vêm da repetição final aprovada. Assim, houve 500 imóveis no benchmark final e 1.000 processamentos sintéticos somando a rodada invalidada pelo harness; ambos os jobs foram revertidos.

## Comparação com 50 imóveis

| Cenário | Lote | Duração observada | Média por imóvel |
| --- | ---: | ---: | ---: |
| 50 imóveis sem imagens | 25 | 4,07 s, incluindo relatório | 81,33 ms |
| 500 imóveis sem imagens | 50 | 33,59 s, somente lotes | 67,17 ms |

As medições não são diretamente equivalentes: o cenário de 50 incluía o relatório no total e usava lotes de 25. Não foi feita extrapolação para 5.000 imóveis.

## Limitações

- a listagem autenticada ainda não possui paginação no servidor;
- busca por código/external ID e detalhe não possuem endpoints GET dedicados;
- filtro por `property_type` não possui índice composto por empresa;
- o tamanho do banco é espaço alocado, não tamanho lógico por job;
- a contagem de queries SQL não foi capturada;
- não houve mídia, Cloudinary, dados reais, produção ou teste de 5.000 imóveis;
- não houve carga simultânea de várias imobiliárias importando.

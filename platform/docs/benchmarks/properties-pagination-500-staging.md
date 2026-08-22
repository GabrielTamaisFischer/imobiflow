# Paginação de imóveis com 500 registros no Railway staging

Data da medição: 2026-08-05.

Este documento registra um teste sintético no ambiente isolado de staging. Não é benchmark de produção e não comprova capacidade para 5.000 imóveis.

## Escopo e proteções

- serviço avaliado: `imobiflow-api-staging`;
- runtime da aplicação: `NODE_ENV=staging`;
- API e MySQL exclusivos de staging no mesmo projeto Railway, comunicando-se pela rede privada;
- uma imobiliária fictícia importadora e uma segunda imobiliária fictícia para validar isolamento;
- 500 imóveis sintéticos sem imagens, vídeos ou tours, em dez lotes de 50;
- 1 imóvel sintético anterior preservado, totalizando 501 durante as consultas;
- nenhuma produção, dado real, Cloudinary, seed, reset, `db push`, merge ou teste de 5.000 imóveis.

Antes da rodada havia 2 empresas fictícias, 2 usuários fictícios, 1 imóvel sintético, zero job em `PROCESSING` e 8 migrations aplicadas. A API permaneceu saudável depois do deploy.

## Contrato de paginação

Foi adotada paginação por página, compatível com a interface atual:

```http
GET /real-estate/properties?page=1&page_size=25
```

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "page_size": 25,
    "total": 0,
    "total_pages": 0,
    "has_next": false,
    "has_previous": false
  }
}
```

- limite padrão: 25;
- limite máximo absoluto: 100;
- página mínima: 1;
- valores inválidos, negativos, zero ou acima do máximo: HTTP 400;
- ordenação estável: `created_at DESC, id DESC`;
- `company_id` sempre vem do contexto autenticado; um valor enviado pelo cliente é ignorado;
- não existe `include_all` nem outro desvio de limite.

Endpoints de leitura:

| Endpoint | Uso |
| --- | --- |
| `GET /real-estate/properties` | cartões resumidos e paginação |
| `GET /real-estate/properties/:id` | detalhe completo isolado por empresa |
| `GET /real-estate/properties/by-code/:code` | código dentro da empresa |
| `GET /real-estate/properties/by-external-id/:externalId` | identificador externo; aceita `import_source` para desambiguação |
| `GET /real-estate/properties/content` | coleção detalhada específica do editor, também limitada a 100 por página |

Filtros tipados disponíveis na listagem: status, finalidade (`operation`), tipo (`property_type`), código, origem de importação, identificador externo e busca limitada por código, título, cidade ou bairro. Todas as consultas acrescentam obrigatoriamente `company_id` pelo backend e usam Prisma, sem SQL montado por concatenação.

## Projeção da listagem

A listagem retorna apenas os campos escalares usados pelos cartões e seletores, proprietário resumido (`id` e nome) e no máximo uma mídia de capa. Não retorna descrição, payload bruto, JSON de captação, características, grupos de comodidades, regras comerciais, configurações de publicação, vídeos JSON, proprietário completo nem galeria completa.

O detalhe completo só é carregado quando o usuário abre “Visualizar” ou “Editar”. Os demais consumidores usam páginas internas de no máximo 100. O editor de sites, que realmente precisa de conteúdo completo de vários imóveis, usa o endpoint específico paginado; não há consulta ilimitada.

## Índices

Migration aplicada somente no staging: `202608050001_property_query_indexes`.

Ela contém apenas dois `CREATE INDEX`:

- `properties_company_id_created_at_id_idx` em `company_id, created_at, id`, para a ordenação estável paginada;
- `properties_company_id_property_type_idx` em `company_id, property_type`, para o filtro de tipo dentro da imobiliária.

Índices existentes e reutilizados, sem duplicação:

- `company_id + code` (único);
- `company_id + status + published_at`;
- `company_id + operation`;
- `company_id + city + neighborhood`;
- `company_id + import_source + import_external_id`;
- `company_id + import_job_id`.

O `EXPLAIN` durante as 501 linhas confirmou:

| Consulta | Índice escolhido | Acesso |
| --- | --- | --- |
| paginação | `properties_company_id_created_at_id_idx` | `ref`, backward index scan |
| código | `properties_company_id_code_key` | `const` |
| external ID | `properties_company_import_external_idx` | `ref` |
| finalidade | `properties_company_id_operation_idx` | `ref` |
| tipo | `properties_company_id_property_type_idx` | `ref` |
| ImportJob | `properties_company_import_job_idx` | `ref` |

## Benchmark pela API hospedada

Cada consulta foi repetida cinco vezes pela API Railway, próxima ao MySQL privado.

| Consulta | Média | p50 | p95/máxima | Itens | Payload médio |
| --- | ---: | ---: | ---: | ---: | ---: |
| primeira página | 468,98 ms | 377,86 ms | 789,76 ms | 50 de 501 | 38.814 bytes |
| página intermediária | 288,75 ms | 283,83 ms | 309,09 ms | 50 de 501 | 38.818 bytes |
| última página | 282,59 ms | 277,42 ms | 303,42 ms | 1 de 501 | 853 bytes |
| busca por código | 277,70 ms | 271,77 ms | 289,35 ms | 1 | 1.082 bytes |
| busca por external ID | 273,04 ms | 273,59 ms | 280,67 ms | 1 | 1.086 bytes |
| filtro por finalidade | 291,51 ms | 279,06 ms | 343,25 ms | 50 de 168 | 38.865 bytes |
| filtro por tipo | 300,92 ms | 307,37 ms | 328,82 ms | 50 de 167 | 38.665 bytes |
| filtro por status | 306,64 ms | 296,58 ms | 339,08 ms | 50 de 500 | 38.814 bytes |
| detalhe | 275,21 ms | 272,66 ms | 286,25 ms | 1 | 1.082 bytes |

Conjunto agregado das 45 chamadas medidas: média 307,26 ms, p50 280,67 ms, p95 377,86 ms e máxima 789,76 ms.

As páginas 1, 6 e 11 retornaram respectivamente 50, 50 e 1 item, sem IDs repetidos, com total 501 e 11 páginas. Nenhuma resposta da listagem excedeu o limite solicitado.

### Comparação com a rota anterior

| Versão | Média | p50 | p95/máxima | Itens por resposta |
| --- | ---: | ---: | ---: | ---: |
| anterior, ilimitada | 730,21 ms | 353,20 ms | 1.393,20 ms | 501 |
| nova, primeira página de 50 | 468,98 ms | 377,86 ms | 789,76 ms | 50 |

A média da primeira página caiu aproximadamente 35,8% e o p95/máximo caiu aproximadamente 43,3%. O p50 da primeira página ficou 24,66 ms maior nesta amostra; as páginas já aquecidas ficaram próximas de 280 ms. O tamanho em bytes da resposta anterior não foi registrado, portanto não é apresentada uma redução percentual inventada. O dado comprovado é que a nova resposta tem 38.814 bytes e no máximo 50 itens, contra 501 itens no contrato anterior.

## Importação, recursos e rollback

A rodada de preparação importou 500/500 imóveis, sem duplicados ou falhas, em 14.144,46 ms acumulados de lote. O cursor persistiu no restart após 250 imóveis, a disputa concorrente retornou HTTP 200/409 e a repetição após conclusão manteve 500 registros.

Recursos do serviço durante importação, consultas, restart e rollback:

- memória média: 50,70 MB;
- memória máxima: 77,58 MB;
- CPU média: 0,0328 vCPU;
- CPU máxima: 0,0744 vCPU.

O espaço alocado reportado pelo `information_schema` permaneceu em 1.622.016 bytes antes, depois da importação e depois do rollback; isso não mede tamanho lógico exato por job.

O rollback removeu exatamente os 500 imóveis do job, preservou o imóvel sintético anterior, as duas empresas, os dois usuários e as 500 `ImportRows` de auditoria. A segunda chamada confirmou idempotência. Não restou propriedade vinculada ao job.

## Isolamento

- Empresa B listando imóveis: HTTP 200, zero itens;
- Empresa B abrindo detalhe da Empresa A: HTTP 404;
- vazamento de códigos do job para Empresa B: zero;
- o cliente não consegue trocar o contexto enviando `company_id`.

## Limitações restantes

- paginação por offset é simples e compatível, mas páginas muito profundas devem ser reavaliadas após o benchmark de 5.000;
- busca textual usa `contains` limitado e company-scoped, sem índice full-text;
- cada página calcula `count` para fornecer total; o custo deve ser acompanhado em volumes maiores;
- o endpoint de conteúdo do editor é paginado, porém ainda pode percorrer várias páginas por necessidade funcional;
- o tamanho anterior do payload ilimitado não foi capturado;
- não houve dados reais, mídia, Cloudinary, produção, carga multiempresa simultânea nem teste de 5.000 imóveis.

# Importacao de 50 registros em staging

Data: **2026-08-05 (America/Sao_Paulo)**

Ambiente: **MySQL e Cloudinary exclusivos de staging; API executada localmente**

Status: **cenario de 50 concluido; resultado nao extrapolavel para outros volumes**

## Configuracao

| Item | Valor |
|---|---:|
| Dados | sinteticos |
| Registros solicitados | 50 |
| Tamanho do lote | 25 |
| Formato | CSV |
| Provider de storage | Cloudinary de staging |
| API | processo local conectado ao staging |
| Banco | MySQL vazio de staging; 27 tabelas apos migrations |
| Arquivo CSV | 7.268 bytes |
| Chamadas HTTP | 14 |

## Dados medidos

| Metrica | Resultado |
|---|---:|
| `/imports/start` + primeiro lote | 130.886,96 ms |
| Segundo lote, incluindo disputa concorrente | 116.095,04 ms |
| Tempo total do roteiro | 325.290,04 ms |
| Pico aproximado de memoria da API | 115.134.464 bytes |
| Processados | 50 |
| Imoveis criados | 49 |
| Duplicados | 1 |
| Linhas com falha | 0 |
| Midias vinculadas / rejeitadas | 47 / 2 |
| Assets fisicos criados no Cloudinary | 1, reutilizado por URL de origem |
| Falhas HTTP inesperadas | 0 |
| Banco antes / depois do rollback | 1.622.016 / 1.622.016 bytes alocados |
| Cloudinary antes / depois do rollback | 0 / 0 assets no prefixo de staging |

## Verificacoes funcionais

- [x] limite de teste permaneceu em 50;
- [x] primeiro lote processou 25 e salvou cursor 27;
- [x] segundo lote concluiu 50 e salvou cursor 51;
- [x] repeticao apos conclusao nao duplicou dados;
- [x] chamadas concorrentes retornaram HTTP 200 e HTTP 409;
- [x] imagem invalida nao cancelou o imovel;
- [x] localhost foi rejeitado e nao gerou `StoredFile`;
- [x] empresa B recebeu HTTP 404 em report, processamento, retry e rollback do job A;
- [x] retry com falha sintetica injetada nao duplicou imovel;
- [x] video e tour permaneceram como URLs externas;
- [x] todos os arquivos do job registraram provider `cloudinary`;
- [x] rollback removeu 49 imoveis, 47 midias, 1 registro e 1 asset fisico do job;
- [x] segundo rollback foi idempotente;
- [x] propriedade e registro de arquivo sinteticos anteriores ao job permaneceram;
- [ ] retomada apos reinicio da API nao foi medida neste roteiro;

## Projecoes e limitacoes

Nao ha projecao calculada neste documento. O resultado de 50 itens nao comprova capacidade para 500, 5.000 ou qualquer volume maior.

As 47 midias usaram a mesma URL publica controlada. A deduplicacao por `source_url` produziu um unico asset fisico no Cloudinary, compartilhado pelos vinculos. As duas rejeicoes foram uma URL inexistente e localhost; nenhuma delas cancelou o imovel.

O teste de retry usou uma falha controlada injetada em uma linha ja concluida. O reprocessamento reconheceu o imovel existente e nao criou duplicata. O registro de arquivo preexistente validou preservacao no banco, mas nao representava um asset fisico anterior no Cloudinary. A limpeza fisica foi comprovada para o asset criado pelo job.

O tamanho retornado pelo MySQL representa espaco alocado de tabelas e indices, por isso permaneceu igual depois do rollback. O parser ainda recebe e normaliza o arquivo em memoria na requisicao inicial. A rodada posterior adicionou concorrencia limitada somente para midias; fila, worker e persistencia incremental de `ImportRow` continuam como evolucoes recomendadas antes de volumes maiores.

## Retomada apos reinicializacao — 2026-08-05

Um segundo job sintetico sem imagens foi interrompido depois do primeiro lote e retomado por uma nova instancia real da API usando o mesmo MySQL e `JWT_SECRET`.

| Medida | Antes de reiniciar | Depois de reiniciar | Final |
|---|---:|---:|---:|
| Cursor | 27 | 27 | 51 |
| Processados | 25 | 25 | 50 |
| Imoveis do job | 25 | 25 | 50 |
| Status | `PARTIALLY_COMPLETED` | `PARTIALLY_COMPLETED` | `COMPLETED` |
| Duplicados | 0 | 0 | 0 |

A consulta depois do reinicio retornou HTTP 200, o segundo lote iniciou no cursor persistido e o rollback deixou zero imoveis do job. A Empresa B recebeu HTTP 404 ao consultar o job da Empresa A.

## Linha de base sem imagens — 2026-08-05

| Medida | Resultado |
|---|---:|
| Arquivo | 6.255 bytes |
| Primeiro lote | 96.552,25 ms |
| Segundo lote | 92.675,23 ms |
| Inicio + lotes + relatorio | 190.678,68 ms |
| Media por imovel, considerando os dois lotes | 3.784,55 ms |
| Imoveis importados | 50 |
| Duplicados | 0 |
| Idempotencia | aprovada |

Tempos agregados instrumentados do MySQL: criacao de 50 imoveis em 38.709,62 ms; 50 buscas de duplicidade em 10.244,76 ms; criacao das 50 `ImportRows` em 949,31 ms; atualizacoes de contadores em 2.309,67 ms. O numero exato de queries nao estava disponivel sem ativar log detalhado do Prisma e, portanto, nao foi estimado.

Mesmo sem imagens, os dois lotes consumiram cerca de 181 segundos dentro do processamento. Isso mostra que a latencia entre a API local e o MySQL remoto de staging e um gargalo relevante e precisa ser separada do custo das midias.

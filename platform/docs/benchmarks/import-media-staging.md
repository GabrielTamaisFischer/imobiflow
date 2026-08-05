# Diagnostico de midias da importacao em staging

Data: **2026-08-05 (America/Sao_Paulo)**

Ambiente: **API local, MySQL e Cloudinary exclusivos de staging**

Status: **comparacao medida com 50 imoveis; nao extrapolavel para 500 ou 5.000**

## Configuracao

- 50 imoveis sinteticos por job;
- 20 imagens pequenas com URLs distintas, derivadas de duas fontes controladas no Cloudinary de staging;
- uma URL inexistente e uma URL localhost;
- videos e tours mantidos como URLs externas;
- baseline com `IMPORT_MEDIA_CONCURRENCY=1`;
- otimizacao com `IMPORT_MEDIA_CONCURRENCY=3`;
- teto absoluto implementado: 5;
- timeout por tentativa: 15 segundos;
- ate duas novas tentativas, somente para timeout, erro de rede, HTTP 429 ou HTTP 5xx;
- backoff de 250 ms e 500 ms;
- nenhuma tentativa adicional para localhost, protocolo, MIME, tamanho ou magic bytes invalidos.

## Comparacao medida

| Medida | Sem imagens | Midia sequencial (1) | Midia limitada (3) |
|---|---:|---:|---:|
| Primeiro lote | 96.552,25 ms | 159.392,46 ms | 132.305,43 ms |
| Segundo lote | 92.675,23 ms | 93.335,56 ms | 92.669,26 ms |
| Dois lotes | 189.227,48 ms | 252.728,02 ms | 224.974,69 ms |
| Pico aproximado da API | — | 53.035.008 bytes* | 53.035.008 bytes* |
| Downloads tentados | 0 | 22 | 22 |
| Uploads reais | 0 | 20 | 20 |
| Assets fisicos do job | 0 | 20 | 20 |
| Deduplicacoes | 0 | 0 | 0 |
| Imagens rejeitadas | 0 | 2 | 2 |
| Duplicados de imovel | 0 | 0 | 0 |

\* O pico foi medido para o processo durante o roteiro completo e nao isoladamente para cada variante.

Ganho de parede medido no primeiro lote: **16,99%**. Ganho nos dois lotes: **10,98%**. O segundo lote nao continha midias e permaneceu praticamente igual, como esperado.

## Instrumentacao de midia

| Metrica agregada | Sequencial | Concorrencia 3 |
|---|---:|---:|
| Download total somado | 8.682,42 ms | 1.295,31 ms |
| Download medio | 394,66 ms | 58,88 ms |
| Upload total somado | 12.177,18 ms | 14.418,44 ms |
| Upload medio | 608,86 ms | 720,92 ms |
| Deduplicacao por `source_url` | 5.002,84 ms | 6.587,68 ms |
| Criacao de `StoredFile` | 15.683,00 ms | 16.573,57 ms |
| Criacao de `PropertyMedia` | 15.878,97 ms | 16.068,61 ms |
| Pipeline de midia total somado | 57.424,52 ms | 54.944,07 ms |

A soma das operacoes nao cai na mesma proporcao do tempo de parede porque ate tres downloads/uploads podem se sobrepor. O baseline foi executado antes da variante concorrente; o cache de entrega do Cloudinary pode ter favorecido o tempo de download da segunda passagem. Por isso, o ganho de 16,99% e um resultado observado neste roteiro, nao uma garantia causal ou uma projecao de escala.

## Gargalos identificados

1. Antes da alteracao, todas as URLs de uma propriedade eram processadas estritamente em serie.
2. O MySQL remoto tambem representa parcela grande do tempo: no cenario sem imagens, criacoes e verificacoes individuais mantiveram cada lote perto de 90 segundos.
3. `StoredFile` e `PropertyMedia` somaram aproximadamente 31–33 segundos nos cenarios com midia.
4. O rollback continua apagando assets um a um. Isso e conservador e retomavel, mas aumenta o tempo de limpeza.
5. URLs de transformacao do Cloudinary contem virgulas. O parser antigo interpretava qualquer virgula como separador e invalidava a linha; ele foi ajustado para preservar virgulas internas e separar por virgula somente quando outra URL HTTP comeca em seguida.

## Seguranca e limpeza

- localhost gerou zero `StoredFile`;
- as duas falhas de imagem nao cancelaram o imovel;
- 50 imoveis foram importados em ambas as variantes;
- zero duplicacao;
- upload permaneceu exclusivamente no `StorageProvider`;
- `PropertyMedia` foi gravado em ordem deterministica depois do processamento concorrente;
- a auditoria final verificou os quatro jobs mais recentes como `CANCELED`;
- zero propriedades e zero arquivos permaneceram vinculados aos jobs;
- zero assets permaneceram no prefixo Cloudinary de staging depois da remocao das fontes temporarias.

## Limitacoes

- nao houve teste de 500 ou 5.000 imoveis;
- as 20 imagens ficaram concentradas em uma propriedade para isolar a concorrencia de midias sem paralelizar criacoes de imoveis;
- o numero exato de queries Prisma nao foi coletado;
- nao houve inversao da ordem A/B nem rodada estatistica repetida;
- a API estava local e o MySQL remoto, portanto a latencia de rede nao representa necessariamente uma futura implantacao na mesma regiao;
- a concorrencia nao deve ser aumentada acima de 5 sem novo teste de limite do provider e pool de conexoes.

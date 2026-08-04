# Importacao de 50 registros em staging

Data: **nao executado**

Ambiente: **staging a configurar**

Status: **modelo de medicao; nao e benchmark concluido**

## Configuracao

| Item | Valor |
|---|---:|
| Dados | sinteticos |
| Registros solicitados | 50 |
| Tamanho do lote | 25 |
| Formato | CSV |
| Provider de storage | preencher |
| Regiao/API | preencher |
| Banco e capacidade | preencher sem credenciais |
| Versao/commit | preencher |

## Dados medidos

| Metrica | Resultado |
|---|---:|
| Inicio do job | nao medido |
| Lote 1 | nao medido |
| Lote 2 | nao medido |
| Relatorio | nao medido |
| Tempo total | nao medido |
| Pico de memoria | nao medido |
| Processados/importados/atualizados | nao medido |
| Duplicados/falhas | nao medido |
| Fotos importadas/com erro | nao medido |
| Taxa de erro HTTP | nao medido |

## Verificacoes funcionais

- [ ] limite de teste permaneceu em 50;
- [ ] uma chamada processou somente um lote;
- [ ] cursor sobreviveu a reinicio controlado;
- [ ] repeticao nao duplicou dados;
- [ ] concorrencia nao assumiu o mesmo lote;
- [ ] imagem invalida nao cancelou o imovel;
- [ ] localhost foi rejeitado;
- [ ] empresa B nao acessou o job A;
- [ ] video e tour permaneceram por URL.

## Projecoes e limitacoes

Nao ha projecao calculada neste documento. O resultado de 50 itens, quando medido, nao comprova capacidade para 500, 5.000 ou qualquer volume maior. O parser ainda recebe e normaliza o arquivo em memoria na requisicao inicial; fila, worker e persistencia incremental de linhas sao evolucoes futuras antes de validar volumes grandes.

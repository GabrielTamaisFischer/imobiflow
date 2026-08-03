# Fase 69 - Importacao JSON de imoveis e proprietarios

## Objetivo

Expandir a importacao de dados para aceitar JSON alem de CSV, aproximando o ImobiFlow da migracao real prevista no SDD.

## Entregas

- Parser JSON no servico de importacao.
- Deteccao automatica de formato por extensao `.csv` ou `.json`.
- Suporte a arrays JSON e objetos com chaves como `items`, `rows`, `data`, `properties`, `imoveis`, `owners` ou `proprietarios`.
- Suporte a JSON aninhado com `property`/`imovel` e `owner`/`proprietario`.
- Frontend de importacao aceitando CSV e JSON.
- Teste automatizado para JSON de imoveis e proprietarios.

## Regras preservadas

- Nenhum dado ficticio e criado automaticamente.
- A importacao exige arquivo real selecionado pelo usuario.
- A pre-visualizacao continua obrigatoria antes de gravar dados.
- Linhas invalidas continuam bloqueando a importacao, salvo quando a importacao parcial estiver autorizada.
- O backend continua validando `company_id`, permissao e assinatura ativa.

## Proximas evolucoes

- Parser Excel `.xlsx`.
- Parser XML/feed de portais.
- Mapeamento manual de colunas/campos.
- Processamento assíncrono em fila para bases grandes.
- Importacao de fotos por URL ou ZIP.

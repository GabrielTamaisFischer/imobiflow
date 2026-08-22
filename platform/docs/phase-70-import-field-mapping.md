# Fase 70 - Mapeamento manual de campos na importacao

## Objetivo

Permitir que uma imobiliaria importe bases reais mesmo quando as colunas do CSV ou JSON nao seguem os nomes esperados pelo ImobiFlow.

## Entregas

- `mapping_json` opcional em `/imports/preview` e `/imports/start`.
- Backend aplica mapeamento manual apenas quando o cabecalho existe no arquivo.
- Tela de importacao com seletores para vincular colunas aos campos do ImobiFlow.
- Botao `Aplicar mapeamento` para recalcular a previa antes de importar.
- Importacao final usa o mesmo mapeamento revisado pelo usuario.
- Teste automatizado cobrindo cabecalhos personalizados.

## Campos mapeaveis na UI

- Titulo do imovel
- Codigo/referencia
- Nome, documento, e-mail e telefone do proprietario
- Descricao
- Tipo, finalidade e status do imovel
- Endereco
- Dormitorios, banheiros, vagas e area util
- Valor de venda e valor de aluguel

## Regra preservada

O sistema continua sem criar exemplos ou dados ficticios. O mapeamento apenas interpreta colunas de um arquivo real enviado pelo usuario.

## Proximas evolucoes

- Salvar presets de mapeamento por empresa.
- Mapeamento de fotos por URL.
- Importacao Excel `.xlsx`.
- Processamento em fila para bases grandes.

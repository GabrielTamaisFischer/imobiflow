# Phase 72 - Importacao Excel

## Objetivo

Permitir que imobiliarias importem bases reais em planilhas Excel, atendendo ao requisito do SDD de migracao por CSV, Excel, JSON e outros formatos incrementais.

## O que foi criado

- Suporte a arquivos `.xlsx` e `.xls` no backend.
- Deteccao automatica do tipo `excel` pelo nome do arquivo.
- Leitura da primeira aba da planilha.
- Uso da primeira linha como cabecalho.
- Conversao das linhas seguintes para o mesmo pipeline de validacao ja usado por CSV/JSON.
- Mapeamento automatico e manual de campos tambem aplicado em Excel.
- Aceite de Excel na tela de importacoes.
- Teste automatizado criando uma planilha `.xlsx` em memoria e validando proprietario, imovel, valor e fotos por URL.

## Regras importantes

- A importacao continua sem criar dados ficticios.
- Linhas vazias da planilha sao ignoradas.
- O sistema ainda importa apenas a primeira aba.
- O usuario ainda precisa revisar a previa antes de gravar no banco.
- A gravacao continua respeitando `company_id`, permissao e assinatura ativa pelo backend.

## Proximo passo recomendado

Adicionar importacao XML/feeds de portais imobiliarios e depois evoluir a ingestao de fotos externas para baixar os arquivos e salvar no Supabase Storage.

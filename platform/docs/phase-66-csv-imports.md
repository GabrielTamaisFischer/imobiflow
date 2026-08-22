# Fase 66 - Importação CSV de Imóveis e Proprietários

## Objetivo

Iniciar o módulo de importação de dados previsto no SDD, permitindo que uma imobiliária migre uma base real em CSV sem usar dados fictícios.

## Implementado

- Migration `046_imports_foundation.sql` com:
  - `import_jobs`;
  - `import_rows`;
  - `company_id` obrigatório;
  - RLS por empresa;
  - índices por empresa, importação e status.
- Backend `/imports` protegido por:
  - login válido;
  - empresa vinculada;
  - assinatura ativa;
  - permissões `imports.view` e `imports.manage`.
- Endpoints:
  - `GET /imports`;
  - `GET /imports/:id/rows`;
  - `POST /imports/preview`;
  - `POST /imports/start`.
- Parser CSV com:
  - detecção automática de delimitador;
  - suporte a campos com aspas;
  - mapeamento automático de colunas comuns em português;
  - validação de linhas;
  - conversão de valores monetários brasileiros para centavos;
  - normalização de tipo, finalidade e status do imóvel.
- Importação real cria:
  - proprietários em `property_owners`;
  - imóveis em `properties`;
  - vínculo entre imóvel e proprietário quando ambos existem.
- Tela `/app/importacoes` com:
  - upload de CSV;
  - prévia;
  - contagem de linhas válidas/inválidas;
  - opção de importação parcial;
  - histórico de importações.
- Testes unitários do parser CSV.

## Regras preservadas

- Nenhum dado é criado antes da confirmação da importação.
- Nenhum dado fictício é gerado.
- Todas as tabelas de importação usam `company_id`.
- A API valida assinatura e permissão no backend.
- Duplicidade por código de imóvel é bloqueada.

## Pendências

- Importação Excel `.xlsx`.
- Mapeamento manual de colunas pela interface.
- Importação de fotos por URL/ZIP.
- Processamento em fila para bases grandes.
- Relatório exportável de erros.

# Validacao do importador em staging

Este roteiro usa exclusivamente dados sinteticos. Nao use dados da imobiliaria piloto, nao execute em producao e nao selecione importacao completa de 5.000 registros.

## Revisao da migration

A migration `202608040001_resumable_imports` e aditiva: cria `import_jobs` e `import_rows` e adiciona campos opcionais de rastreio a `properties` e `stored_files`. Ela nao remove nem renomeia colunas e nao apaga dados manuais.

- `import_rows.import_job_id -> import_jobs.id` usa `ON DELETE CASCADE`: apagar um job remove somente suas linhas de controle.
- `import_rows.property_id` e `properties.import_job_id` usam `ON DELETE SET NULL`; apagar job ou imovel nao causa exclusao em cascata do outro.
- apagar uma empresa elimina seus jobs, seguindo o comportamento destrutivo ja associado a exclusao da empresa.
- rollback de propriedades e arquivos permanece controlado pelo servico e seleciona apenas recursos criados pelo job; a FK nao realiza esse rollback.
- requer MySQL com suporte a `JSON` e `DATETIME(3)` (recomendado MySQL 8). Em banco novo, aplique a cadeia completa de migrations; esta migration depende das tabelas-base. Em banco populado, os novos campos opcionais preservam registros existentes.

Antes de executar em staging: backup verificado, `prisma migrate status`, revisao da URL sem exibi-la, janela de manutencao e plano de restauracao. A migration nao foi executada por esta tarefa.

## Protecoes de entrada

O backend limita o arquivo compactado a 10 MB, o job a 10.000 linhas, ZIP a 2.000 entradas e 100 MB declarados descompactados, JSON a 32 niveis e parsing a 30 segundos. Erros possuem codigo e HTTP claros. O parser opera em memoria e nao cria temporarios, portanto nao ha arquivo temporario a limpar.

O timeout e uma protecao de aplicacao, mas parsers JavaScript sincronos nao podem ser interrompidos durante bloqueio do event loop. Evolucao recomendada: upload direto para storage de staging, worker isolado, parsing incremental e criacao paginada de `ImportRow`.

## Preparacao dos dados

No PowerShell, dentro de `platform`:

```powershell
$env:ALLOW_IMPORT_STAGING_TEST="true"
npm run import:staging:fixtures:50
```

Isso gera dois arquivos de empresas ficticias, usuarios ficticios no manifesto, imagem controlada, imagem inexistente, URL localhost para SSRF, duplicidade, video e tour. Nenhuma empresa ou usuario e criado no banco automaticamente; crie as duas contas manualmente no staging e guarde os tokens apenas na sessao local.

O conjunto de 500 e somente preparatorio e exige duas chaves:

```powershell
$env:ALLOW_IMPORT_STAGING_TEST="true"
$env:CONFIRM_IMPORT_500_STAGING="true"
npm run import:staging:fixtures:500
```

## Sequencia semiautomatizada de 50 registros

1. Confirme que `NODE_ENV` nao e `production` e que a API aponta para staging.
2. Aplique a migration somente apos backup e aprovacao explicita.
3. Configure `STAGING_API_URL` e `STAGING_TOKEN_COMPANY_A` localmente, sem salvar em arquivo.
4. Execute `npm run import:staging:validate:50`.
5. Registre tempos, contadores do relatorio, memoria e logs sanitizados no modelo de benchmark.
6. Confira 50 linhas no maximo, lotes de 25, cursor persistido, duplicidade e falhas de imagem sem cancelar o imovel.
7. Confira que video e tour continuam URLs e que localhost nao causou requisicao interna.

## Isolamento entre empresas

Com tokens A e B, tente com B: consultar o relatorio do job A, processar seu proximo lote, repetir falhas e solicitar rollback. Todas as chamadas devem retornar 404 ou 403 sem revelar dados. Em seguida importe o arquivo B e confirme que codigos iguais entre empresas nao colidem. Nao execute o rollback; valide apenas a autorizacao em ambiente descartavel ou com endpoint protegido conforme aprovacao.

## Criterios de encerramento

- migrations, testes e builds aprovados;
- nenhum secret em arquivos ou logs;
- nenhum upload fora do `StorageProvider`;
- resultados reais separados de configuracao e projecoes;
- PR mantida em rascunho, sem merge e sem deploy de producao.

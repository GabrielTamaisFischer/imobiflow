# Phase 74 - Importacao ZIP com imagens

## Objetivo

Permitir que uma imobiliaria envie um pacote `.zip` contendo uma base de dados e fotos reais dos imoveis, reduzindo o trabalho manual durante a migracao.

## O que foi criado

- Suporte a arquivo `.zip` na tela de importacoes.
- Leitura de ZIP no backend via `jszip`.
- O ZIP pode conter um arquivo de dados em:
  - CSV;
  - JSON;
  - XML;
  - XLSX/XLS.
- O backend localiza o primeiro arquivo de dados suportado dentro do ZIP.
- Imagens `.jpg`, `.jpeg`, `.png` e `.webp` sao reconhecidas dentro do pacote.
- O sistema tenta vincular imagens ao imovel pelo codigo do imovel no nome do arquivo ou no nome da pasta.
- Exemplo aceito:

```txt
base.csv
fotos/IM-001/frente.jpg
fotos/IM-001/sala.webp
fotos/IM-002.png
```

Se a base tiver um imovel com codigo `IM-001`, as imagens dentro da pasta `IM-001` ou com `IM-001` no nome serao associadas a ele.

## Gravacao em Storage

Na importacao final, as imagens do ZIP sao enviadas ao bucket:

```txt
imobiflow-property-media
```

Depois disso, sao registradas em:

```txt
property_media
```

com:

- `company_id`;
- `property_id`;
- tipo `photo`;
- URL publica do Storage;
- bucket;
- caminho do arquivo;
- MIME type;
- tamanho;
- posicao.

## Regras importantes

- O sistema continua sem dados ficticios.
- O ZIP precisa conter pelo menos um arquivo de dados suportado.
- ZIP aninhado ainda nao e suportado.
- Imagens acima de 10 MB sao ignoradas.
- Imagens sem codigo correspondente ao imovel nao sao vinculadas automaticamente.
- A previa mostra os arquivos detectados, mas remove o conteudo base64 antes de salvar logs/linhas no banco.
- A gravacao real continua protegida por login, empresa, assinatura ativa e permissao.

## Proximo passo recomendado

Criar uma tela de revisao visual para imagens nao vinculadas automaticamente, permitindo que o usuario associe fotos manualmente ao imovel correto antes de concluir a importacao.

# Website Builder - MySQL Na Hostinger/VPS

Este guia prepara o MySQL real para o modulo Website Builder do ImobiFlow. Ele nao altera a landing page e nao migra o restante do sistema.

## Objetivo

Configurar um banco MySQL para persistir:

- sites;
- paginas;
- secoes;
- componentes;
- templates;
- assets;
- dominios;
- SEO;
- versoes;
- logs de publicacao futura.

## O Que Voce Precisa Ter

- Um MySQL acessivel pelo backend.
- Um usuario MySQL com permissao no banco do ImobiFlow.
- A URL publica do backend.
- Um bucket Cloudflare R2 para imagens, videos e arquivos.

## Criar Banco MySQL

Crie um banco com nome recomendado:

```txt
imobiflow
```

Crie um usuario dedicado:

```txt
usuario: imobiflow
senha: use uma senha forte
```

Permissoes recomendadas para o banco:

```sql
GRANT ALL PRIVILEGES ON imobiflow.* TO 'imobiflow'@'%';
FLUSH PRIVILEGES;
```

Em hospedagens gerenciadas, faca isso pelo painel. Em VPS Linux, faca pelo terminal do MySQL.

## Montar DATABASE_URL

Formato:

```env
DATABASE_URL=mysql://USUARIO:SENHA@HOST:3306/imobiflow
```

Exemplo:

```env
DATABASE_URL=mysql://imobiflow:minha_senha_forte@mysql.seudominio.com:3306/imobiflow
```

Se a senha tiver caracteres especiais como `@`, `#`, `/`, `?` ou `:`, ela deve ser codificada para URL.

Exemplo:

```txt
@ vira %40
# vira %23
/ vira %2F
```

## Variaveis Do Backend

No ambiente onde o backend roda:

```env
DATABASE_URL=mysql://USUARIO:SENHA@HOST:3306/imobiflow

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

O frontend precisa apontar para o backend publicado:

```env
VITE_IMOBIFLOW_API_URL=https://api.seudominio.com
```

## Cloudflare R2

No Cloudflare:

1. Crie um bucket para o ImobiFlow.
2. Crie uma API Token/Access Key com permissao no bucket.
3. Configure uma URL publica ou dominio/CDN para leitura dos arquivos.
4. Preencha:

```env
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

Enquanto essas variaveis nao existirem, uploads retornam erro controlado. O sistema nao usa o navegador como fallback para arquivos.

## Preflight Antes De Migrar

Na raiz do projeto:

```bash
npm run website-builder:preflight
```

Para falhar quando algo obrigatorio faltar:

```bash
npm run website-builder:preflight:strict
```

Esse comando nao grava dados e nao conecta em banco. Ele apenas confere variaveis e arquivos estruturais.

## Aplicar Prisma

Depois que `DATABASE_URL` estiver configurada:

```bash
cd backend
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run build
```

`prisma:seed` cria apenas templates estruturais do Website Builder. Ele nao cria imoveis, leads ou dados ficticios de producao.

## Checklist De Aceite

- `DATABASE_URL` aponta para MySQL real.
- `VITE_IMOBIFLOW_API_URL` nao aponta para localhost em producao.
- R2 possui bucket e credenciais.
- `npm run website-builder:preflight` mostra MySQL e R2 prontos.
- `npm run prisma:migrate` executa sem erro.
- `npm run prisma:seed` executa sem criar dados ficticios.
- `/app/site/builder` lista sites reais do MySQL.
- Criar site em branco grava no MySQL.
- Clonar template estrutural grava no MySQL.

## Fora Desta Fase

Ainda nao entram aqui:

- editor visual completo;
- Effects Gallery;
- importacao de sites;
- dominio automatico;
- marketplace;
- publicacao automatica de imoveis.

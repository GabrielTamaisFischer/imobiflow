# Plataforma ImobiFlow

Este monorepo mantém dois projetos independentes:

- a raiz contém a landing page pública;
- `platform/` contém a aplicação SaaS recuperada, incluindo frontend, API, backend e Prisma.

## Instalação

Na raiz do repositório, instale e execute a landing:

```powershell
npm install
npm run dev
```

Para trabalhar na plataforma:

```powershell
cd platform
npm install
npm run dev
```

## Validação da plataforma

Use uma URL MySQL de desenvolvimento ou dummy apenas para geração e validação do Prisma:

```powershell
$env:DATABASE_URL = "mysql://dummy:dummy@127.0.0.1:3306/imobiflow"
npm run prisma:generate
npx prisma validate --schema prisma/schema.prisma
npm test
npm run build
npm --prefix backend run build
```

Esses comandos não executam migrations nem importações.

## Variáveis de ambiente

Copie os arquivos `.env.example` apropriados para arquivos `.env` locais e preencha-os fora do controle de versão. Nunca versionar URLs reais de banco, tokens, senhas ou chaves de providers.

O snapshot preservado é anterior à versão mais recente do importador. Consulte a documentação e valide os fluxos antes de qualquer deploy.

Você está trabalhando no projeto ImobiFlow, uma plataforma SaaS imobiliária multiempresa.
Seu objetivo não é apenas escrever código, mas entregar funcionalidades completas, coerentes, testadas, seguras e integradas com a arquitetura existente.
Antes de qualquer alteração, primeiro entenda o contexto do projeto, localize implementações existentes e evite criar código duplicado.
Sempre siga este fluxo:
1. Analise o pedido completo antes de alterar arquivos.
2. Localize os arquivos, serviços, componentes, rotas, schemas, tipos e testes relacionados.
3. Identifique impacto em frontend, backend, banco, permissões, autenticação, multiempresa, responsividade e integrações.
4. Reaproveite código existente sempre que possível.
5. Só depois implemente.
6. Termine o fluxo completo, não apenas uma parte visual.
7. Execute testes, typecheck, build e validações antes de considerar concluído.
8. Revise regressões em módulos relacionados.
9. Não declare “pronto”, “funcionando” ou “homologado” sem evidência.
ARQUITETURA
O ImobiFlow é multiempresa. Todo dado operacional deve respeitar o isolamento por empresa.
Nunca faça consultas de dados sensíveis sem escopo de companyId.
Nunca permita que uma empresa visualize, altere ou vincule registros de outra empresa.
Antes de criar uma nova entidade, serviço ou tabela, procure se já existe algo equivalente.
Evite duplicação de lógica entre frontend e backend.
Centralize regras de negócio no backend sempre que forem regras de segurança, autorização ou consistência.
Use contratos claros entre frontend e backend.
Quando alterar payloads, valide:
- campos obrigatórios;
- opcionais;
- nullability;
- enums;
- erros;
- serialização;
- compatibilidade com telas existentes.
IDENTIDADE E CADASTROS
Party é a identidade civil canônica.
PartyRole define os papéis da pessoa dentro da empresa.
AppUser representa credencial e acesso ao sistema e não substitui identidade civil.
A mesma pessoa pode ser proprietário, comprador, inquilino e corretor dentro da mesma empresa sem duplicar a Party.
O mesmo CPF/CNPJ em empresas diferentes pertence a registros distintos por tenant.
Proprietário principal e coproprietários devem respeitar o modelo PropertyOwner e vínculos existentes.
Não crie duplicação de identidade.
FRONTEND
Use os padrões existentes de React, TypeScript, Vite e componentes do projeto.
Mantenha consistência visual entre páginas.
Reutilize componentes de formulário, cards, tabelas, modais e estados já existentes.
Toda tela deve considerar:
- loading;
- erro;
- vazio;
- sucesso;
- disabled;
- validação;
- responsividade;
- acessibilidade básica;
- mensagens claras;
- feedback após ações.
Evite telas visualmente genéricas ou inconsistentes com o restante do sistema.
Não implemente apenas aparência. Botões e formulários devem estar conectados ao fluxo real correspondente quando o escopo exigir.
BACKEND
Use rotas e services existentes antes de criar novas abstrações.
Valide inputs com Zod ou o padrão atual do projeto.
Retorne erros estruturados e previsíveis.
Não confie no frontend para autorização.
Sempre valide tenant, permissões e existência real dos relacionamentos.
Evite lógica complexa diretamente dentro de rotas se ela puder viver em service.
BANCO
O projeto usa Prisma com MySQL/TiDB.
Antes de alterar schema, verifique:
- impacto em tabelas existentes;
- dados legados;
- índices;
- unique constraints;
- relações;
- performance;
- compatibilidade de migration.
Nunca execute prisma migrate reset.
Nunca use banco de produção para testes.
Nunca faça alterações destrutivas sem autorização explícita.
Prefira migrations aditivas e seguras.
SEGURANÇA
Sempre revise segurança quando tocar:
- autenticação;
- autorização;
- usuários;
- permissões;
- CPF/CNPJ/RG;
- dados financeiros;
- contratos;
- documentos;
- uploads;
- API pública;
- integrações externas;
- webhooks;
- tokens;
- secrets.
Nunca exponha segredos em código, logs, commits ou respostas.
Nunca aceite companyId vindo do cliente como fonte de autorização.
TESTES
Toda implementação relevante deve ter testes proporcionais ao risco.
Use TDD quando fizer sentido.
Para lógica:
- unit tests.
Para integração entre camadas:
- integration tests.
Para fluxos críticos:
- E2E.
Sempre que possível, valide no navegador:
- login;
- navegação;
- criação;
- edição;
- exclusão;
- permissões;
- mensagens;
- responsividade;
- persistência;
- estados de erro.
Antes de concluir uma tarefa execute, quando aplicável:
- lint;
- typecheck;
- unit tests;
- integration tests;
- E2E;
- build.
Se algum teste não puder ser executado, explique exatamente qual e por quê.
REGRESSÃO
Sempre procure impactos indiretos.
Ao alterar uma entidade central, verifique módulos dependentes.
Exemplos:
imóvel -> site público, proprietário, contratos, CRM, financeiro, mídia e portal.
Party -> comprador, inquilino, proprietário, corretor, contratos e leads.
AppUser -> autenticação, permissões, responsável por imóvel, corretor e auditoria.
Não corrija um módulo quebrando outro.
AUTOMAÇÕES
Prefira arquitetura orientada a eventos quando houver ações que possam ser registradas na origem.
Para tarefas assíncronas, considere:
- filas;
- idempotência;
- retry;
- dead-letter;
- auditoria;
- status;
- timestamps;
- observabilidade.
Evite polling pesado quando um evento pode registrar a mudança diretamente.
INTEGRAÇÕES
Toda integração externa deve considerar:
- timeout;
- retry;
- rate limit;
- falha parcial;
- logging;
- idempotência;
- credenciais;
- formato de retorno;
- indisponibilidade temporária.
Nunca deixe uma integração externa derrubar fluxo principal sem necessidade.
PERFORMANCE
Evite leituras desnecessárias de grandes volumes.
Prefira consultas incrementais, eventos, índices e paginação.
Não carregue milhares de registros no frontend se não for necessário.
Analise N+1 queries, joins desnecessários e consultas repetidas.
PROMPTS E EFICIÊNCIA
Antes de agir:
- resuma internamente o objetivo;
- identifique arquivos necessários;
- evite abrir arquivos irrelevantes;
- não repita análise já concluída;
- não reconstrua contexto que já está presente;
- use o menor número necessário de alterações para entregar o fluxo completo.
Seja direto.
Não escreva longas explicações durante a execução se não forem necessárias.
Preserve contexto importante entre etapas.
Faça compactação de contexto quando necessário sem perder decisões arquiteturais.
QUALIDADE DE ENTREGA
Uma tarefa só pode ser considerada concluída quando:
- requisito implementado;
- fluxo completo funcionando;
- tipos corretos;
- backend e frontend integrados;
- permissões verificadas;
- tenant isolation verificado;
- estados de erro considerados;
- regressões verificadas;
- testes executados;
- build validado quando aplicável.
Antes de encerrar qualquer tarefa, execute este checklist:
[ ] Entendi o requisito inteiro?
[ ] Procurei implementações existentes?
[ ] Evitei duplicação?
[ ] Frontend está completo?
[ ] Backend está completo?
[ ] Banco precisa de alteração?
[ ] Permissões estão corretas?
[ ] companyId está protegido?
[ ] Estados loading/error/empty estão tratados?
[ ] Responsividade foi considerada?
[ ] Segurança foi revisada?
[ ] Testes foram criados ou atualizados?
[ ] Testes passaram?
[ ] Typecheck passou?
[ ] Build passou?
[ ] Revisei regressões?
[ ] O que estou chamando de “pronto” foi realmente verificado?
SKILLS
PRIORIDADE: este CLAUDE.md tem prioridade sobre qualquer skill, local ou externa. Se uma skill contradisser este arquivo, siga este arquivo.
Conflitos conhecidos, já resolvidos em favor deste arquivo:
- metas fixas de cobertura (ex.: "80% mínimo" em tdd-workflow/verification-loop) são referência, não regra; testes são proporcionais ao risco;
- "migrate deploy em CI/CD" (prisma-patterns) não vale: migration em produção nunca é automática;
- links de skills para outras skills/comandos não instalados (ex.: test-collaboration, backend-patterns, /react-test, /bug-check, superpowers:test-driven-development) devem ser ignorados; use os equivalentes instalados;
- nenhuma skill autoriza commit, push, deploy, migration ou seed sem pedido explícito.
COMANDOS DE VERIFICAÇÃO (rodar em platform/)
- build: npm run build
- typecheck: npm run typecheck (ou typecheck:frontend / typecheck:backend). Há erros PREEXISTENTES (30 frontend / 33 backend em 2026-10-20): só erro novo conta como regressão; nunca relatar "passou" enquanto houver erros.
- lint: npm run lint
- testes: npm test (Vitest, ambiente node)
- INDISPONÍVEIS no projeto: Playwright/E2E automatizado, React Testing Library, MSW, axe, jsdom e provider de coverage. Não relatar como executados; adotar exige decisão explícita.
SKILLS LOCAIS INSTALADAS (.claude/skills/ — versionadas no repositório)
Procedência, commits fixados e licenças: .claude/skills/THIRD_PARTY_NOTICES.md
Multiempresa e segurança:
- imobiflow-tenant-isolation (local, baseada no código do ImobiFlow)
- security-review
- differential-review
Análise e planejamento:
- change-impact
- intent-driven-development
- architecture-decision-records
Contratos e backend:
- contract-first
- api-design
- error-handling
Banco:
- prisma-patterns
- mysql-patterns
- database-migrations (adaptada para o ImobiFlow)
Frontend:
- react-patterns
- make-interfaces-feel-better
- frontend-a11y
Testes, debugging e verificação:
- tdd-workflow
- react-testing
- ai-regression-testing
- module-regression
- systematic-debugging
- verification-loop
- verification-before-completion
SKILLS JÁ DISPONÍVEIS NO AMBIENTE
Confirmadas nesta máquina. Não estão versionadas no repositório; podem não existir em outra máquina. Se não estiver disponível, siga o mesmo checklist manualmente.
Embutidas no Claude Code:
- code-review (revisão de diff/PR)
- security-review embutida: tem o MESMO nome da skill local security-review; neste projeto, "security-review" refere-se à skill local (.claude/skills/security-review). Para revisão de segurança do diff, use differential-review.
- simplify (limpeza/simplificação sem mudar comportamento)
- run (subir o app e ver a mudança funcionando)
Plugin Vercel (nível de usuário):
- vercel:deployments-cicd
- vercel:env-vars
- vercel:vercel-cli
- vercel:verification
- vercel:vercel-functions
- vercel:react-best-practices
- vercel:shadcn
- vercel:queues
- vercel:workflow
Design:
- design:design-system
- design:accessibility-review
- design:ux-copy
Navegador (QA visual e de fluxo):
- anthropic-skills:chrome-browser
- anthropic-skills:built-in-browser
IA:
- claude-api (para funcionalidades de IA dentro do ImobiFlow)
MATRIZ DE ATIVAÇÃO
Use só as skills da linha correspondente à tarefa; combine linhas quando a tarefa cruzar áreas. verification-before-completion vale para toda tarefa antes de declarar conclusão.
- Nova feature frontend: intent-driven-development (se requisito ambíguo), react-patterns, make-interfaces-feel-better, vercel:shadcn, design:design-system, frontend-a11y, design:ux-copy, react-testing, chrome-browser/built-in-browser, verification-loop.
- Nova API: contract-first, api-design, error-handling, imobiflow-tenant-isolation, security-review, tdd-workflow, verification-loop.
- Alteração de banco: change-impact, database-migrations, prisma-patterns, mysql-patterns, imobiflow-tenant-isolation, module-regression, verification-loop.
- Bug: systematic-debugging, ai-regression-testing, module-regression, verification-loop.
- Refatoração: change-impact, simplify, module-regression, verification-loop.
- Segurança: security-review, differential-review, imobiflow-tenant-isolation, error-handling (sem vazar detalhes internos em erros).
- Code review: code-review, differential-review, imobiflow-tenant-isolation, change-impact (alinhamento pós-implementação).
- Automação (filas, jobs, notificações, eventos): change-impact, error-handling, vercel:queues ou vercel:workflow (se o recurso for adotado), imobiflow-tenant-isolation, tdd-workflow, verification-loop.
- Integração externa (portais, XML, gateways, WhatsApp, e-mail): contract-first, error-handling, security-review, imobiflow-tenant-isolation, ai-regression-testing, verification-loop.
- Deploy: verification-loop, vercel:deployments-cicd, vercel:env-vars, vercel:vercel-cli, database-migrations (se houver migration), vercel:verification após publicar.
- Correção em produção: systematic-debugging, change-impact, ai-regression-testing, differential-review, verification-loop; depois vercel:verification e smoke test. Nunca testar no banco de produção.
- Performance: prisma-patterns, mysql-patterns, vercel:react-best-practices, react-patterns, verification-loop (medir antes e depois).
- Upload/documentos: imobiflow-tenant-isolation, security-review, error-handling, verification-loop.
- Alteração de permissões: imobiflow-tenant-isolation, security-review, differential-review, change-impact, module-regression, tdd-workflow (testes negativos).
- Alteração multiempresa: imobiflow-tenant-isolation, change-impact, database-migrations (se houver schema), differential-review, module-regression, tdd-workflow (testes negativos entre empresas).
- Decisão de arquitetura: intent-driven-development, architecture-decision-records, change-impact.
REGRAS DE DEPLOY
Não faça deploy para cada pequena alteração.
Agrupe mudanças relacionadas em blocos relevantes.
Antes de deploy:
1. finalize o bloco;
2. rode testes;
3. rode typecheck;
4. rode build;
5. revise diff;
6. valide migrations;
7. confirme branch e ambiente;
8. só depois publique.
Script de deploy: platform/scripts/deploy-backend-vercel.ps1 (npm run deploy:vercel) publica em PRODUÇÃO. Não execute sem autorização explícita.
- Por padrão NÃO aplica migrations nem seed.
- Migrations só com -RunMigrations e seed só com -RunSeed (ex.: npm run deploy:vercel -- -RunMigrations); cada um exige confirmação digitada e autorização explícita para aquela execução.
- -SkipMigrations/-SkipSeed continuam aceitos só por compatibilidade.
Depois do deploy:
- smoke test;
- verificar logs;
- testar fluxo principal;
- confirmar que o commit correto está hospedado.
Não considere um deploy bem-sucedido apenas porque a plataforma retornou READY.
Verifique funcionalidade real.
REGRAS PROIBIDAS
Nunca:
- usar prisma migrate reset;
- alterar produção sem autorização explícita;
- expor DATABASE_URL, tokens ou secrets;
- remover isolamento multiempresa;
- confiar em validação apenas no frontend;
- criar dados fictícios em produção;
- inventar campos ou APIs;
- duplicar entidade existente;
- esconder erro com fallback silencioso;
- declarar sucesso sem teste;
- deixar TODO crítico e dizer que a feature terminou.
Sempre trabalhe como engenheiro responsável pelo produto inteiro, e não apenas pelo arquivo que está sendo alterado.

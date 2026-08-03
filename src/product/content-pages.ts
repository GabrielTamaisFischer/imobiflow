import agentHandover from "@/assets/agent-handover.jpg";
import brokerSuccess from "@/assets/broker-success.jpg";
import dashboardPreview from "@/assets/dashboard-preview.jpg";
import familyKeys from "@/assets/family-keys.jpg";

export type ContentPage = {
  slug: string;
  category: string;
  title: string;
  lead: string;
  image: string;
  imageAlt: string;
  highlights: Array<{ value: string; label: string }>;
  sections: Array<{
    title: string;
    body: string;
    bullets: string[];
  }>;
  faq?: Array<{ question: string; answer: string }>;
};

export const contentPages: Record<string, ContentPage> = {
  "para-gestores": {
    slug: "para-gestores",
    category: "Produto",
    title: "Gestao imobiliaria com visao, controle e previsibilidade",
    lead:
      "O ImobiFlow entrega ao gestor uma visao clara da operacao: leads, carteira, produtividade, funil comercial, assinatura ativa, permissoes e proximas prioridades. A meta e reduzir dependencia de planilhas e transformar rotina em indicadores confiaveis.",
    image: dashboardPreview,
    imageAlt: "Gestor acompanhando dashboard imobiliario",
    highlights: [
      { value: "360°", label: "Visao da operacao" },
      { value: "Multiempresa", label: "Separacao por company_id" },
      { value: "Permissoes", label: "Acesso por perfil" },
    ],
    sections: [
      {
        title: "Controle comercial sem perder detalhes",
        body:
          "O gestor acompanha origem dos leads, etapa do funil, responsavel, atividades atrasadas e oportunidades paradas. Isso ajuda a identificar gargalos antes que vendas sejam perdidas.",
        bullets: [
          "Pipeline por etapa, corretor e prioridade.",
          "Historico de contato centralizado para auditoria de atendimento.",
          "Indicadores de conversao, visitas, propostas e fechamento.",
        ],
      },
      {
        title: "Governanca de usuarios e permissoes",
        body:
          "A plataforma considera que login sozinho nao e autorizacao. O acesso precisa passar por empresa vinculada, assinatura ativa e permissao adequada.",
        bullets: [
          "Perfis para dono, admin, gerente, corretor e financeiro.",
          "Bloqueio automatico quando a assinatura estiver irregular.",
          "Preparacao para auditoria de acoes sensiveis no roadmap.",
        ],
      },
      {
        title: "Decisoes com dados reais",
        body:
          "O sistema inicia vazio e orienta cadastros reais. Isso evita dashboards maquiados e permite que os indicadores representem a operacao da imobiliaria desde o primeiro dia.",
        bullets: [
          "Estados vazios com proximas acoes claras.",
          "Dados vinculados a empresa correta.",
          "Base pronta para relatorios financeiros e comerciais.",
        ],
      },
    ],
  },
  "para-corretores": {
    slug: "para-corretores",
    category: "Produto",
    title: "Uma rotina mais simples para o corretor vender mais",
    lead:
      "O corretor precisa de velocidade, contexto e foco. O ImobiFlow organiza leads, imoveis, agenda, visitas, follow-ups e historico para que cada atendimento tenha proximo passo claro.",
    image: agentHandover,
    imageAlt: "Corretor entregando chaves para clientes",
    highlights: [
      { value: "CRM", label: "Proximas acoes" },
      { value: "Agenda", label: "Visitas e tarefas" },
      { value: "WhatsApp", label: "Atendimento rapido" },
    ],
    sections: [
      {
        title: "Leads com contexto, nao apenas nomes",
        body:
          "Cada oportunidade pode reunir preferencia do cliente, ticket, interesse, historico e imoveis relacionados. Isso diminui perguntas repetidas e melhora a experiencia do comprador ou locatario.",
        bullets: [
          "Historico completo de relacionamento.",
          "Qualificacao do lead por necessidade e urgencia.",
          "Sugestoes futuras de imoveis aderentes ao perfil.",
        ],
      },
      {
        title: "Follow-up organizado",
        body:
          "O corretor sabe quem precisa de retorno, qual foi a ultima conversa e qual acao deve executar. A ideia e evitar que oportunidades boas esfriem por falta de processo.",
        bullets: [
          "Tarefas e visitas conectadas ao CRM.",
          "Priorizacao por etapa e potencial.",
          "Menos anotacoes soltas e mais registro acionavel.",
        ],
      },
      {
        title: "Produtividade com controle da empresa",
        body:
          "O corretor ganha agilidade, enquanto a imobiliaria mantem dados centralizados, permissao por perfil e separacao por empresa.",
        bullets: [
          "Acesso liberado apenas para usuarios autorizados.",
          "Dados vinculados ao company_id da imobiliaria.",
          "Base preparada para metas e indicadores por equipe.",
        ],
      },
    ],
  },
  vistoria: {
    slug: "vistoria",
    category: "Produto",
    title: "Vistoria imobiliaria inteligente, documentada e pronta para PDF",
    lead:
      "A vistoria e uma das etapas mais sensiveis da locacao. O ImobiFlow estrutura a base para vistorias com fotos, ambientes, observacoes, comparacao de entrada e saida e laudos profissionais.",
    image: familyKeys,
    imageAlt: "Entrega de chaves apos vistoria imobiliaria",
    highlights: [
      { value: "Fotos", label: "Registro por ambiente" },
      { value: "PDF", label: "Laudo profissional" },
      { value: "Comparacao", label: "Entrada e saida" },
    ],
    sections: [
      {
        title: "Registro padronizado",
        body:
          "Padronizar a vistoria reduz conflito, melhora a comunicacao com proprietarios e inquilinos e facilita consultas futuras.",
        bullets: [
          "Ambientes, itens, fotos e observacoes em uma estrutura unica.",
          "Laudos mais consistentes entre diferentes vistoriadores.",
          "Base preparada para anexos e assinatura no roadmap.",
        ],
      },
      {
        title: "Menos risco para locacao",
        body:
          "Quando a entrada e a saida do imovel sao documentadas, a imobiliaria ganha respaldo para negociacoes e cobrancas.",
        bullets: [
          "Comparacao visual entre estados do imovel.",
          "Historico associado ao contrato e ao imovel.",
          "Organizacao para auditoria e atendimento ao cliente.",
        ],
      },
      {
        title: "IA como assistente de qualidade",
        body:
          "O roadmap de IA pode apoiar resumos, identificacao de inconsistencias e geracao assistida do texto do laudo, mantendo revisao humana nos pontos sensiveis.",
        bullets: [
          "Sugestoes de descricoes mais claras.",
          "Revisao de campos pendentes.",
          "Ganho de produtividade sem abrir mao de controle.",
        ],
      },
    ],
  },
  sobre: {
    slug: "sobre",
    category: "Empresa",
    title: "O ImobiFlow nasceu para profissionalizar a operacao imobiliaria",
    lead:
      "A missao do ImobiFlow e unir tecnologia, automacao e inteligencia aplicada ao dia a dia de imobiliarias brasileiras. O foco e resolver operacao real: atendimento, carteira, contratos, financeiro, vistorias, equipe e crescimento.",
    image: brokerSuccess,
    imageAlt: "Equipe imobiliaria analisando resultados",
    highlights: [
      { value: "SaaS", label: "Produto escalavel" },
      { value: "Brasil", label: "Foco no mercado local" },
      { value: "Operacao", label: "Do lead ao contrato" },
    ],
    sections: [
      {
        title: "Mais do que uma landing page",
        body:
          "A landing apresenta a proposta, mas a arquitetura do produto ja esta sendo organizada para autenticar usuarios, vincular empresas, controlar planos e bloquear acesso quando a assinatura nao estiver ativa.",
        bullets: [
          "Base multiempresa com company_id.",
          "Autenticacao e cadastro de empresa.",
          "Planos e assinatura como regra central de acesso.",
        ],
      },
      {
        title: "Tecnologia com responsabilidade",
        body:
          "O produto e pensado para lidar com dados importantes de clientes, proprietarios, contratos e operacao financeira. Por isso, controle de permissao e isolamento de dados entram desde a fundacao.",
        bullets: [
          "Usuario logado nao significa usuario autorizado.",
          "Permissoes por tipo de usuario.",
          "Bloqueio para assinatura cancelada, expirada ou inadimplente.",
        ],
      },
      {
        title: "Crescimento por fases",
        body:
          "O roadmap prioriza primeiro a base SaaS segura, depois modulos operacionais e, em seguida, automacoes e IA mais avancadas.",
        bullets: [
          "Fase 1 e 2: auth, empresa, planos e bloqueio.",
          "Fases seguintes: CRM, imoveis, vistorias, contratos e financeiro.",
          "Evolucao com integracoes de pagamento e automacao.",
        ],
      },
    ],
  },
  clientes: {
    slug: "clientes",
    category: "Empresa",
    title: "Para imobiliarias que querem uma operacao mais confiavel",
    lead:
      "O ImobiFlow foi planejado para atender imobiliarias que precisam organizar crescimento, melhorar velocidade comercial e dar ao gestor uma fonte unica de verdade.",
    image: agentHandover,
    imageAlt: "Clientes felizes recebendo atendimento imobiliario",
    highlights: [
      { value: "Start", label: "Operacoes iniciantes" },
      { value: "Pro", label: "Equipes em escala" },
      { value: "Enterprise", label: "Multi-filial" },
    ],
    sections: [
      {
        title: "Corretores e pequenas imobiliarias",
        body:
          "Para quem esta saindo da planilha, o valor esta em organizar clientes, imoveis, agenda e follow-ups em uma base unica.",
        bullets: [
          "Menos perda de oportunidade.",
          "Cadastro limpo desde o inicio.",
          "Fluxo simples para crescer com processo.",
        ],
      },
      {
        title: "Imobiliarias com equipe comercial",
        body:
          "Para equipes, o ganho esta em distribuir responsabilidades, acompanhar performance e padronizar atendimento.",
        bullets: [
          "Funil por corretor e etapa.",
          "Indicadores para reunioes de vendas.",
          "Permissoes para evitar acesso indevido.",
        ],
      },
      {
        title: "Operacoes estruturadas",
        body:
          "Para empresas maiores, o roadmap considera financeiro, contratos, repasses, auditoria, API e suporte prioritario.",
        bullets: [
          "Base para multi-filial.",
          "Separacao de dados por empresa.",
          "Plano Enterprise com governanca ampliada.",
        ],
      },
    ],
  },
  blog: {
    slug: "blog",
    category: "Empresa",
    title: "Conteudo para gestao, vendas e tecnologia imobiliaria",
    lead:
      "O blog do ImobiFlow sera um centro de aprendizado para gestores e corretores: automacao, CRM, vistorias, contratos, LGPD, funil comercial, financeiro e inteligencia artificial aplicada ao mercado imobiliario.",
    image: dashboardPreview,
    imageAlt: "Conteudo e indicadores do mercado imobiliario",
    highlights: [
      { value: "Gestao", label: "Processos e indicadores" },
      { value: "Vendas", label: "Conversao e atendimento" },
      { value: "IA", label: "Automacao pratica" },
    ],
    sections: [
      {
        title: "Temas para decisores",
        body:
          "Conteudos voltados para quem precisa escolher tecnologia, implantar processos e medir retorno dentro da imobiliaria.",
        bullets: [
          "Como estruturar um funil imobiliario.",
          "Indicadores essenciais para gestores.",
          "Como escolher um SaaS imobiliario.",
        ],
      },
      {
        title: "Temas para operacao",
        body:
          "Guias praticos para corretores, atendentes, financeiro e administracao de locacao.",
        bullets: [
          "Rotina de follow-up com leads.",
          "Padronizacao de vistoria.",
          "Organizacao de contratos e repasses.",
        ],
      },
      {
        title: "Temas de confianca",
        body:
          "Materiais sobre seguranca, permissao, LGPD, assinatura ativa e boas praticas de dados.",
        bullets: [
          "Por que login nao basta para autorizar acesso.",
          "Como evitar mistura de dados em operacoes multiempresa.",
          "Como pagamentos impactam acesso ao SaaS.",
        ],
      },
    ],
  },
  carreiras: {
    slug: "carreiras",
    category: "Empresa",
    title: "Construa tecnologia para transformar o mercado imobiliario",
    lead:
      "O ImobiFlow busca formar um produto serio, util e conectado a problemas reais. A cultura desejada combina engenharia cuidadosa, design de produto, conhecimento imobiliario e obsessao por experiencia do cliente.",
    image: brokerSuccess,
    imageAlt: "Profissionais colaborando em produto imobiliario",
    highlights: [
      { value: "Produto", label: "Foco em problemas reais" },
      { value: "Cliente", label: "Empatia operacional" },
      { value: "Tecnologia", label: "Base escalavel" },
    ],
    sections: [
      {
        title: "Perfil de time",
        body:
          "A equipe ideal entende que SaaS imobiliario exige confiabilidade, clareza e evolucao constante.",
        bullets: [
          "Engenharia com atencao a seguranca e dados.",
          "Design focado em operacoes repetidas.",
          "Atendimento com linguagem do mercado imobiliario.",
        ],
      },
      {
        title: "Principios de trabalho",
        body:
          "Cada funcionalidade deve resolver uma dor concreta: vender mais, reduzir retrabalho, proteger dados ou dar previsibilidade.",
        bullets: [
          "Construir em fases, validando fundacoes.",
          "Evitar dados ficticios e atalhos que confundem usuarios.",
          "Preservar a clareza da operacao.",
        ],
      },
      {
        title: "Areas futuras",
        body:
          "O roadmap abre espaco para produto, engenharia, suporte, conteudo, implementacao e parcerias.",
        bullets: [
          "Especialistas em CRM e automacao.",
          "Profissionais de implantacao SaaS.",
          "Conteudo e educacao para imobiliarias.",
        ],
      },
    ],
  },
  imprensa: {
    slug: "imprensa",
    category: "Empresa",
    title: "ImobiFlow na imprensa e comunicacao institucional",
    lead:
      "Esta area centraliza posicionamento, narrativa, dados institucionais e mensagens oficiais sobre o ImobiFlow para jornalistas, parceiros e formadores de opiniao.",
    image: familyKeys,
    imageAlt: "Imagem institucional de entrega de chaves",
    highlights: [
      { value: "Proptech", label: "Tecnologia imobiliaria" },
      { value: "SaaS", label: "Modelo recorrente" },
      { value: "IA", label: "Automacao aplicada" },
    ],
    sections: [
      {
        title: "Posicionamento",
        body:
          "O ImobiFlow se posiciona como uma plataforma SaaS para organizar a jornada imobiliaria, do lead ao contrato, com automacao e inteligencia.",
        bullets: [
          "Foco em imobiliarias brasileiras.",
          "Base multiempresa e assinatura ativa.",
          "Roadmap com CRM, ERP, vistoria, IA e financeiro.",
        ],
      },
      {
        title: "Mensagens principais",
        body:
          "A comunicacao reforca confianca, produtividade, controle e crescimento previsivel.",
        bullets: [
          "Mais leads convertidos com processo.",
          "Menos retrabalho operacional.",
          "Governanca de acesso desde a fundacao.",
        ],
      },
      {
        title: "Contato institucional",
        body:
          "Demandas de imprensa, parcerias e entrevistas podem ser direcionadas para o canal institucional do ImobiFlow.",
        bullets: [
          "E-mail: contato@imobiflow.app.",
          "Materiais oficiais em atualizacao.",
          "Dados publicos serao revisados antes de divulgacao.",
        ],
      },
    ],
  },
  "central-de-ajuda": {
    slug: "central-de-ajuda",
    category: "Recursos",
    title: "Central de ajuda para implantacao e uso diario",
    lead:
      "A central de ajuda foi pensada para orientar desde o primeiro cadastro ate rotinas de CRM, permissao, assinatura, vistorias, contratos e financeiro.",
    image: dashboardPreview,
    imageAlt: "Central de ajuda do ImobiFlow",
    highlights: [
      { value: "Guias", label: "Passo a passo" },
      { value: "FAQ", label: "Duvidas frequentes" },
      { value: "Suporte", label: "Orientacao por plano" },
    ],
    sections: [
      {
        title: "Primeiros passos",
        body:
          "O usuario deve entender rapidamente como criar conta, vincular empresa, escolher plano e acessar a area interna quando a assinatura estiver ativa.",
        bullets: [
          "Criacao de cadastro e empresa.",
          "Validacao de assinatura antes do acesso.",
          "Orientacao quando houver bloqueio por pagamento.",
        ],
      },
      {
        title: "Uso operacional",
        body:
          "Os artigos de ajuda devem acompanhar os modulos principais conforme forem liberados.",
        bullets: [
          "Clientes, imoveis, funil e agenda.",
          "Vistorias, contratos e financeiro.",
          "Configuracoes, usuarios e permissoes.",
        ],
      },
      {
        title: "Resolucao de problemas",
        body:
          "A central precisa explicar mensagens de erro, bloqueios de acesso e passos para regularizar assinatura.",
        bullets: [
          "Assinatura cancelada, expirada ou inadimplente.",
          "Usuario sem empresa vinculada.",
          "Permissao insuficiente para modulo.",
        ],
      },
    ],
  },
  documentacao: {
    slug: "documentacao",
    category: "Recursos",
    title: "Documentacao tecnica e operacional do ImobiFlow",
    lead:
      "A documentacao organiza arquitetura, regras de negocio, eventos de assinatura, permissoes e comportamento esperado dos modulos. Ela ajuda equipe tecnica, suporte e clientes Enterprise.",
    image: dashboardPreview,
    imageAlt: "Documentacao tecnica do sistema imobiliario",
    highlights: [
      { value: "Auth", label: "Login e autorizacao" },
      { value: "DB", label: "Supabase PostgreSQL" },
      { value: "Webhooks", label: "Kiwify e Cakto" },
    ],
    sections: [
      {
        title: "Regras de acesso",
        body:
          "A regra central da plataforma e clara: login valido nao libera o sistema sozinho.",
        bullets: [
          "Validar sessao autenticada.",
          "Validar empresa vinculada.",
          "Validar assinatura ativa e permissao do usuario.",
        ],
      },
      {
        title: "Modelo multiempresa",
        body:
          "Tabelas importantes devem carregar company_id para isolar dados e permitir crescimento seguro.",
        bullets: [
          "Usuarios vinculados a empresas.",
          "Planos e assinaturas por empresa.",
          "Registros operacionais sempre associados ao tenant correto.",
        ],
      },
      {
        title: "Eventos de pagamento",
        body:
          "Kiwify e Cakto devem enviar eventos de ativacao, renovacao, cancelamento, expiracao e inadimplencia.",
        bullets: [
          "Webhooks autenticados.",
          "Historico de eventos para auditoria.",
          "Bloqueio imediato conforme status da assinatura.",
        ],
      },
    ],
  },
  api: {
    slug: "api",
    category: "Recursos",
    title: "API para integrar a operacao imobiliaria",
    lead:
      "A API do ImobiFlow sera pensada para operacoes que precisam conectar portais, CRMs externos, automacoes, ERPs, BI, parceiros e sistemas internos.",
    image: dashboardPreview,
    imageAlt: "API e integracoes do ImobiFlow",
    highlights: [
      { value: "REST", label: "Integracoes externas" },
      { value: "Webhook", label: "Eventos em tempo real" },
      { value: "Enterprise", label: "Governanca ampliada" },
    ],
    sections: [
      {
        title: "Integracoes comerciais",
        body:
          "A API pode apoiar entrada de leads, consulta de imoveis, atualizacao de status e conexao com canais externos.",
        bullets: [
          "Receber leads de formularios e portais.",
          "Consultar dados autorizados por empresa.",
          "Atualizar etapas do funil com rastreabilidade.",
        ],
      },
      {
        title: "Integracoes financeiras",
        body:
          "No roadmap, eventos financeiros e de assinatura precisam ser tratados com seguranca, idempotencia e historico.",
        bullets: [
          "Eventos de pagamento por Kiwify/Cakto.",
          "Status de assinatura por empresa.",
          "Bloqueio ou liberacao conforme regra de negocio.",
        ],
      },
      {
        title: "Seguranca de acesso",
        body:
          "A API deve respeitar tenant, permissao e assinatura ativa, mantendo a mesma regra da interface interna.",
        bullets: [
          "Autenticacao por credenciais seguras.",
          "Escopos de acesso por operacao.",
          "Auditoria para endpoints sensiveis.",
        ],
      },
    ],
  },
  status: {
    slug: "status",
    category: "Recursos",
    title: "Status da plataforma e confiabilidade operacional",
    lead:
      "A pagina de status comunica disponibilidade, incidentes, manutencoes e historico de estabilidade para clientes que dependem do ImobiFlow no dia a dia.",
    image: brokerSuccess,
    imageAlt: "Monitoramento de status do sistema",
    highlights: [
      { value: "Uptime", label: "Disponibilidade" },
      { value: "Incidentes", label: "Comunicacao clara" },
      { value: "Manutencao", label: "Avisos planejados" },
    ],
    sections: [
      {
        title: "Transparencia",
        body:
          "Clientes precisam saber quando a plataforma esta normal, em manutencao ou com instabilidade.",
        bullets: [
          "Comunicacao simples por modulo.",
          "Historico de incidentes.",
          "Orientacao sobre impactos conhecidos.",
        ],
      },
      {
        title: "Modulos monitorados",
        body:
          "A estrutura futura pode separar status de landing, autenticacao, API, banco, webhooks e area interna.",
        bullets: [
          "Login e autorizacao.",
          "Eventos de assinatura.",
          "CRM, imoveis, vistorias e financeiro.",
        ],
      },
      {
        title: "Compromisso com operacao",
        body:
          "Imobiliarias dependem do sistema para atendimento e gestao. Por isso, status e confiabilidade fazem parte da proposta de valor.",
        bullets: [
          "Avisos de manutencao programada.",
          "Registro de resolucao de incidentes.",
          "Canal de suporte por plano.",
        ],
      },
    ],
  },
  "indique-e-ganhe": {
    slug: "indique-e-ganhe",
    category: "Recursos",
    title: "Indique o ImobiFlow e ajude outras imobiliarias a crescer",
    lead:
      "O programa de indicacao sera criado para recompensar clientes, parceiros e especialistas que apresentarem o ImobiFlow para imobiliarias com aderencia real ao produto.",
    image: agentHandover,
    imageAlt: "Indicacao entre profissionais imobiliarios",
    highlights: [
      { value: "Parceiros", label: "Ecossistema imobiliario" },
      { value: "Credito", label: "Beneficios por indicacao" },
      { value: "Qualidade", label: "Leads com perfil ideal" },
    ],
    sections: [
      {
        title: "Como deve funcionar",
        body:
          "A indicacao precisa ser rastreavel, validada e vinculada a uma contratacao real para gerar beneficio.",
        bullets: [
          "Link ou codigo de indicacao.",
          "Validacao da empresa indicada.",
          "Beneficio liberado apos assinatura ativa.",
        ],
      },
      {
        title: "Quem pode indicar",
        body:
          "Clientes, consultores, parceiros de marketing, profissionais de tecnologia e fornecedores do mercado imobiliario podem participar conforme regras do programa.",
        bullets: [
          "Clientes ativos do ImobiFlow.",
          "Parceiros comerciais aprovados.",
          "Especialistas em implantacao e operacao.",
        ],
      },
      {
        title: "Beneficios previstos",
        body:
          "Os beneficios podem incluir creditos, descontos, comissao ou vantagens de suporte, conforme politica comercial.",
        bullets: [
          "Credito na mensalidade.",
          "Beneficio por plano contratado.",
          "Acompanhamento transparente das indicacoes.",
        ],
      },
    ],
  },
  "termos-de-uso": {
    slug: "termos-de-uso",
    category: "Legal",
    title: "Termos de uso do ImobiFlow",
    lead:
      "Esta pagina apresenta uma visao informativa dos termos esperados para uso da plataforma. A versao juridica final deve ser revisada antes da operacao comercial completa.",
    image: dashboardPreview,
    imageAlt: "Termos de uso e contrato digital",
    highlights: [
      { value: "Uso", label: "Regras da plataforma" },
      { value: "Conta", label: "Responsabilidade do usuario" },
      { value: "Assinatura", label: "Acesso condicionado" },
    ],
    sections: [
      {
        title: "Uso permitido",
        body:
          "A plataforma deve ser utilizada para gestao imobiliaria legitima, com dados reais, usuarios autorizados e respeito as leis aplicaveis.",
        bullets: [
          "Nao usar dados de terceiros sem base legal.",
          "Nao tentar acessar empresa ou modulo sem permissao.",
          "Nao burlar bloqueios de assinatura ou seguranca.",
        ],
      },
      {
        title: "Responsabilidade da conta",
        body:
          "Cada usuario deve proteger suas credenciais e a empresa deve manter usuarios, cargos e permissoes atualizados.",
        bullets: [
          "Remover acessos de colaboradores desligados.",
          "Usar permissoes adequadas para cada funcao.",
          "Comunicar suspeitas de acesso indevido.",
        ],
      },
      {
        title: "Assinatura e bloqueio",
        body:
          "O acesso ao sistema depende de assinatura ativa. Cancelamento, expiracao, inadimplencia ou inatividade podem bloquear a area interna.",
        bullets: [
          "Login valido nao garante acesso.",
          "Empresa precisa estar vinculada e regular.",
          "Regularizacao do plano libera o uso conforme regra comercial.",
        ],
      },
    ],
  },
  "politica-de-privacidade": {
    slug: "politica-de-privacidade",
    category: "Legal",
    title: "Politica de privacidade e tratamento de dados",
    lead:
      "A privacidade no ImobiFlow precisa considerar dados de empresas, usuarios, clientes, proprietarios, leads, contratos, vistorias e registros financeiros.",
    image: familyKeys,
    imageAlt: "Privacidade de dados no mercado imobiliario",
    highlights: [
      { value: "LGPD", label: "Base legal e transparencia" },
      { value: "Dados", label: "Clientes e imoveis" },
      { value: "Seguranca", label: "Controle de acesso" },
    ],
    sections: [
      {
        title: "Quais dados podem existir",
        body:
          "A plataforma pode armazenar dados de identificacao, contato, preferencias imobiliarias, historico de atendimento, documentos e registros operacionais.",
        bullets: [
          "Dados de usuarios da imobiliaria.",
          "Dados de leads, clientes e proprietarios.",
          "Dados de imoveis, contratos, vistorias e financeiro.",
        ],
      },
      {
        title: "Finalidade de uso",
        body:
          "Os dados devem ser usados para prestacao do servico contratado, organizacao da operacao, suporte, seguranca e melhoria do produto.",
        bullets: [
          "Gerenciar funil comercial e atendimento.",
          "Organizar administracao imobiliaria.",
          "Cumprir obrigacoes contratuais e legais.",
        ],
      },
      {
        title: "Protecao e acesso",
        body:
          "A protecao envolve isolamento por empresa, permissoes por usuario, assinatura ativa e boas praticas de infraestrutura.",
        bullets: [
          "Dados separados por company_id.",
          "Permissoes conforme perfil.",
          "Bloqueio de acesso quando assinatura estiver irregular.",
        ],
      },
    ],
  },
  lgpd: {
    slug: "lgpd",
    category: "Legal",
    title: "LGPD aplicada a operacoes imobiliarias",
    lead:
      "A LGPD e essencial para imobiliarias que tratam dados de compradores, locatarios, proprietarios, fiadores, colaboradores e parceiros. O ImobiFlow deve apoiar processos mais organizados e rastreaveis.",
    image: dashboardPreview,
    imageAlt: "LGPD e governanca de dados",
    highlights: [
      { value: "Base legal", label: "Tratamento justificado" },
      { value: "Acesso", label: "Permissao por funcao" },
      { value: "Auditoria", label: "Rastreabilidade futura" },
    ],
    sections: [
      {
        title: "Organizacao reduz risco",
        body:
          "Dados espalhados em planilhas, celulares e mensagens tornam a gestao de privacidade mais fragil. Centralizar com permissoes ajuda a controlar melhor a informacao.",
        bullets: [
          "Menos copias desnecessarias de dados.",
          "Acesso conforme funcao do usuario.",
          "Separacao por empresa e contexto operacional.",
        ],
      },
      {
        title: "Direitos dos titulares",
        body:
          "A imobiliaria precisa conseguir localizar, corrigir e excluir dados quando aplicavel, seguindo bases legais e prazos.",
        bullets: [
          "Consulta de registros por cliente ou proprietario.",
          "Historico para entender origem do dado.",
          "Processos internos para solicitacoes LGPD.",
        ],
      },
      {
        title: "Responsabilidades compartilhadas",
        body:
          "O fornecedor da plataforma cuida da tecnologia e a imobiliaria deve usar a ferramenta de forma adequada, com dados corretos e acessos atualizados.",
        bullets: [
          "Politicas internas de uso.",
          "Treinamento de equipe.",
          "Revisao periodica de permissoes.",
        ],
      },
    ],
  },
  "contrato-saas": {
    slug: "contrato-saas",
    category: "Legal",
    title: "Contrato SaaS, assinatura e regras de acesso",
    lead:
      "O contrato SaaS define a relacao entre a imobiliaria contratante e o ImobiFlow: plano, mensalidade, recursos, suporte, limites, renovacao, cancelamento e bloqueio por falta de pagamento.",
    image: familyKeys,
    imageAlt: "Contrato SaaS para imobiliarias",
    highlights: [
      { value: "Mensalidade", label: "Plano contratado" },
      { value: "Webhook", label: "Status de pagamento" },
      { value: "Bloqueio", label: "Assinatura irregular" },
    ],
    sections: [
      {
        title: "Assinatura como chave de acesso",
        body:
          "O usuario pode estar logado e ainda assim nao entrar na plataforma se a empresa estiver sem assinatura ativa.",
        bullets: [
          "Validacao de login.",
          "Validacao de empresa vinculada.",
          "Validacao de assinatura ativa e permissao.",
        ],
      },
      {
        title: "Eventos de pagamento",
        body:
          "Kiwify e Cakto devem informar mudancas de status por webhook, atualizando a empresa contratante.",
        bullets: [
          "Pagamento aprovado ativa ou renova acesso.",
          "Cancelamento, expiracao ou inadimplencia bloqueiam.",
          "Eventos devem ser registrados para auditoria.",
        ],
      },
      {
        title: "Planos e escopo",
        body:
          "Start, Pro e Enterprise diferenciam recursos, limites, suporte e nivel de governanca.",
        bullets: [
          "Start para comecar com CRM e cadastros.",
          "Pro para automacao, multiusuario e IA.",
          "Enterprise para operacoes estruturadas, API e auditoria.",
        ],
      },
    ],
  },
};

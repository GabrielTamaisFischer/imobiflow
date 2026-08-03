import agentHandover from "@/assets/agent-handover.jpg";
import brokerSuccess from "@/assets/broker-success.jpg";
import dashboardPreview from "@/assets/dashboard-preview.jpg";
import familyKeys from "@/assets/family-keys.jpg";

export type MarketingPageKey = "produto" | "quem-usa" | "resultados" | "inteligencia" | "planos" | "faq";

export type MarketingPageContent = {
  key: MarketingPageKey;
  eyebrow: string;
  title: string;
  lead: string;
  image: string;
  imageAlt: string;
  sections: Array<{
    title: string;
    body: string;
    bullets?: string[];
  }>;
  metrics?: Array<{
    value: string;
    label: string;
    animation?: {
      target: number;
      prefix?: string;
      suffix?: string;
      decimals?: number;
      decimalSeparator?: "," | ".";
      compact?: "none" | "thousand" | "billion";
    };
  }>;
};

export const marketingPages: Record<MarketingPageKey, MarketingPageContent> = {
  produto: {
    key: "produto",
    eyebrow: "Produto",
    title: "A plataforma completa para operar uma imobiliária moderna",
    lead:
      "O ImobiFlow conecta CRM, imóveis, proprietários, agenda, vistorias, contratos e financeiro em uma experiência única. A proposta é eliminar retrabalho, centralizar dados e dar previsibilidade para cada etapa da operação.",
    image: dashboardPreview,
    imageAlt: "Dashboard profissional do ImobiFlow com indicadores imobiliários",
    metrics: [
      { value: "CRM", label: "Funil de leads e oportunidades" },
      { value: "ERP", label: "Gestão operacional e financeira" },
      { value: "IA", label: "Automação inteligente" },
    ],
    sections: [
      {
        title: "Do lead ao contrato, sem perder contexto",
        body:
          "Cada contato, imóvel, tarefa, visita e proposta fica ligado à empresa e ao usuário responsável. Assim, gestores acompanham o funil e corretores sabem exatamente qual é o próximo passo com cada cliente.",
        bullets: [
          "Cadastro centralizado de clientes, proprietários e imóveis.",
          "Pipeline comercial com etapas claras e responsáveis definidos.",
          "Agenda de visitas, tarefas e follow-ups integrada ao CRM.",
        ],
      },
      {
        title: "Operação preparada para crescer",
        body:
          "A base foi pensada para SaaS multiempresa. Cada módulo importante nasce com separação por empresa, permissões por perfil e bloqueio por assinatura, evitando mistura de dados e liberando evolução segura.",
        bullets: [
          "Estrutura multiempresa com company_id nos módulos críticos.",
          "Permissões por owner, admin, manager, corretor e financeiro.",
          "Assinatura validada antes de liberar a área interna.",
        ],
      },
      {
        title: "Implantacao sem confundir a equipe",
        body:
          "A experiencia foi desenhada para que a imobiliaria comece com dados reais e avance por modulos. Quando nao houver informacao cadastrada, o sistema mostra estados vazios claros em vez de dashboards artificiais.",
        bullets: [
          "Primeiros cadastros guiados por contexto.",
          "Sem dados ficticios dentro da area interna.",
          "Base preparada para treinamento de equipe.",
        ],
      },
      {
        title: "Produto conectado ao pagamento",
        body:
          "A assinatura nao fica separada da operacao. A empresa so acessa a plataforma se o plano estiver ativo, permitindo controle comercial e evitando uso indevido em contas canceladas ou inadimplentes.",
        bullets: [
          "Status de assinatura como regra de autorizacao.",
          "Bloqueio para planos cancelados, expirados ou inativos.",
          "Preparacao para webhooks Kiwify e Cakto.",
        ],
      },
    ],
  },
  "quem-usa": {
    key: "quem-usa",
    eyebrow: "Quem usa",
    title: "Feito para gestores, corretores e operações imobiliárias completas",
    lead:
      "O ImobiFlow atende desde corretores autônomos até imobiliárias com equipe, carteira de locação, financeiro próprio e múltiplas áreas internas.",
    image: agentHandover,
    imageAlt: "Corretora entregando chaves para clientes",
    metrics: [
      { value: "Gestores", label: "Controle de equipe e metas" },
      { value: "Corretores", label: "Rotina comercial mais rápida" },
      { value: "Financeiro", label: "Repasses e cobranças organizados" },
    ],
    sections: [
      {
        title: "Para gestores",
        body:
          "Gestores enxergam carteira, funil, atividades atrasadas, desempenho por corretor e gargalos de atendimento. A plataforma reduz dependência de planilhas e conversas soltas.",
        bullets: [
          "Painel de indicadores por empresa.",
          "Controle de usuários e permissões.",
          "Visão clara de oportunidades e produtividade.",
        ],
      },
      {
        title: "Para corretores",
        body:
          "Corretores recebem uma rotina objetiva: leads qualificados, imóveis relacionados, lembretes de follow-up e histórico completo da conversa. Menos administração manual, mais tempo vendendo.",
        bullets: [
          "Agenda de visitas e tarefas.",
          "CRM com próximos passos.",
          "Atendimento conectado ao WhatsApp.",
        ],
      },
      {
        title: "Para financeiro e administracao",
        body:
          "A area administrativa precisa de previsibilidade. O roadmap contempla repasses, cobrancas, comissoes, reajustes e visao de inadimplencia para reduzir controles paralelos.",
        bullets: [
          "Base para contratos e lancamentos financeiros.",
          "Organizacao por empresa e permissao.",
          "Relatorios futuros de receita, repasse e pendencias.",
        ],
      },
      {
        title: "Para diretoria e expansao",
        body:
          "Operacoes multi-filial precisam padronizar processos sem misturar dados. A arquitetura multiempresa prepara o ImobiFlow para crescer com diferentes unidades, equipes e niveis de acesso.",
        bullets: [
          "Separacao por company_id.",
          "Usuarios com papeis definidos.",
          "Plano Enterprise preparado para governanca ampliada.",
        ],
      },
    ],
  },
  resultados: {
    key: "resultados",
    eyebrow: "Resultados",
    title: "Indicadores para transformar operação em crescimento previsível",
    lead:
      "A proposta do ImobiFlow é tornar a imobiliária mensurável. Em vez de depender de sensação, a equipe acompanha conversão, produtividade, faturamento, visitas e evolução de carteira.",
    image: brokerSuccess,
    imageAlt: "Profissional imobiliária celebrando crescimento",
    metrics: [
      { value: "+1.200", label: "Imobiliárias ativas", animation: { target: 1200, prefix: "+", decimalSeparator: "," } },
      { value: "3.4x", label: "Mais leads convertidos", animation: { target: 3.4, suffix: "x", decimals: 1, decimalSeparator: "." } },
      { value: "97%", label: "Satisfação dos gestores", animation: { target: 97, suffix: "%" } },
    ],
    sections: [
      {
        title: "Mais velocidade no atendimento",
        body:
          "Com CRM, agenda e automação no mesmo fluxo, a equipe responde mais rápido, registra melhor o histórico e evita que leads bons fiquem esquecidos.",
        bullets: [
          "Follow-ups organizados por prioridade.",
          "Histórico centralizado de contatos.",
          "Visão do funil por etapa e responsável.",
        ],
      },
      {
        title: "Mais clareza no financeiro",
        body:
          "A etapa financeira foi planejada para evoluir com repasses, cobranças, comissões, inadimplência e fluxo de caixa, sempre vinculando dados à empresa correta.",
        bullets: [
          "Base preparada para lançamentos e repasses.",
          "Controle por plano e assinatura.",
          "Indicadores de receita e performance.",
        ],
      },
      {
        title: "Mais confianca para decidir",
        body:
          "Gestores precisam enxergar onde o time ganha dinheiro, onde perde tempo e quais etapas travam. A pagina de resultados foi desenhada para traduzir operacao em decisao comercial.",
        bullets: [
          "Comparacao de desempenho por periodo.",
          "Leitura de gargalos por etapa do funil.",
          "Base preparada para indicadores por plano e empresa.",
        ],
      },
      {
        title: "Resultado sem maquiagem",
        body:
          "O ImobiFlow nao deve iniciar com numeros falsos na area interna. Os indicadores publicos da landing comunicam potencial de impacto; dentro do sistema, os dados aparecem a partir dos cadastros reais da imobiliaria.",
        bullets: [
          "Sistema interno inicia vazio.",
          "Estados vazios orientam o primeiro cadastro.",
          "Relatorios crescem conforme a operacao usa a plataforma.",
        ],
      },
    ],
  },
  inteligencia: {
    key: "inteligencia",
    eyebrow: "Inteligência",
    title: "IA aplicada ao cotidiano imobiliário, não só ao marketing",
    lead:
      "A inteligência do ImobiFlow foi desenhada para apoiar decisões práticas: priorizar leads, sugerir imóveis, resumir atendimentos, gerar documentos e identificar riscos operacionais.",
    image: dashboardPreview,
    imageAlt: "Interface do ImobiFlow com recursos inteligentes",
    metrics: [
      { value: "Score", label: "Priorização de leads" },
      { value: "Match", label: "Lead ligado ao imóvel ideal" },
      { value: "Resumo", label: "Histórico fácil de entender" },
    ],
    sections: [
      {
        title: "Lead scoring e priorização",
        body:
          "A IA ajuda a equipe a enxergar quais contatos têm maior intenção, urgência e aderência aos imóveis disponíveis. Isso reduz tempo perdido e melhora a taxa de resposta.",
        bullets: [
          "Classificação por intenção de compra ou locação.",
          "Sugestões de próximos passos.",
          "Alertas para oportunidades paradas.",
        ],
      },
      {
        title: "Automação sem perder controle",
        body:
          "A automação deve acelerar o trabalho, não esconder informações. Por isso, o roadmap prevê rastreabilidade, permissões e revisão humana nos pontos sensíveis.",
        bullets: [
          "Resumos de conversas e atendimentos.",
          "Geração assistida de documentos.",
          "Recomendações dentro do fluxo de trabalho.",
        ],
      },
      {
        title: "IA para operacao, nao apenas propaganda",
        body:
          "A inteligencia deve aparecer onde reduz tempo real de equipe: resumo de atendimento, sugestao de proximo passo, preparacao de texto, analise de oportunidade e apoio ao gestor.",
        bullets: [
          "Resumos para troca de responsavel sem perda de contexto.",
          "Sinais de prioridade para leads quentes.",
          "Apoio para gerar comunicacoes mais consistentes.",
        ],
      },
      {
        title: "Seguranca antes da automacao",
        body:
          "A IA opera dentro das mesmas regras do sistema. Dados de uma empresa nao devem ser misturados com outra, e a permissao do usuario define o que ele pode visualizar ou acionar.",
        bullets: [
          "Contexto limitado a empresa autorizada.",
          "Controle de acesso antes de qualquer acao sensivel.",
          "Roadmap preparado para auditoria e logs.",
        ],
      },
    ],
  },
  planos: {
    key: "planos",
    eyebrow: "Planos",
    title: "Planos para cada fase da operação imobiliária",
    lead:
      "Os planos Start, Pro e Enterprise organizam limites, recursos e permissões. A assinatura ativa será sempre obrigatória para acessar a plataforma interna.",
    image: familyKeys,
    imageAlt: "Clientes recebendo chaves de um imóvel",
    metrics: [
      { value: "Start", label: "Corretores e pequenas operações" },
      { value: "Pro", label: "Imobiliárias em escala" },
      { value: "Enterprise AI", label: "Operações estruturadas" },
    ],
    sections: [
      {
        title: "Start",
        body:
          "Para corretores autônomos e imobiliárias começando. Inclui cadastro de imóveis e clientes, CRM básico, agenda, upload de fotos, WhatsApp rápido e dashboard simples.",
        bullets: [
          "R$ 79/mês.",
          "Ideal para começar com organização comercial.",
          "Base para evoluir sem trocar de sistema.",
        ],
      },
      {
        title: "Pro",
        body:
          "Para imobiliárias que querem escalar com automação. Inclui recursos do Start, vistoria inteligente com PDF, kanban de vendas, automação WhatsApp, multiusuário, analytics e integração com IA.",
        bullets: [
          "R$ 197/mês.",
          "Plano mais escolhido.",
          "Foco em produtividade, gestão e automação.",
        ],
      },
      {
        title: "Enterprise AI",
        body:
          "Para operações estruturadas e multi-filial. Inclui ERP completo, financeiro avançado, repasses, reajustes, IA avançada, API, white label, auditoria e suporte prioritário.",
        bullets: [
          "R$ 497/mês.",
          "Para empresas com processos complexos.",
          "Preparado para governança e expansão.",
        ],
      },
      {
        title: "Como escolher o plano",
        body:
          "A escolha deve considerar tamanho da equipe, complexidade da carteira, necessidade de automacao, governanca e integracoes. O plano certo e aquele que reduz atrito sem criar excesso de processo.",
        bullets: [
          "Start: organizacao inicial e CRM essencial.",
          "Pro: escala comercial, multiusuario e automacao.",
          "Enterprise: operacao complexa, API, auditoria e suporte prioritario.",
        ],
      },
      {
        title: "Assinatura e acesso",
        body:
          "A plataforma foi desenhada para que a assinatura seja parte da seguranca do produto. Se o pagamento estiver irregular, o acesso interno e bloqueado e a empresa recebe orientacao para regularizar.",
        bullets: [
          "Status ativo libera a area interna.",
          "Status cancelado, expirado, inadimplente ou inativo bloqueia.",
          "Webhooks de pagamento mantem o status atualizado.",
        ],
      },
    ],
  },
  faq: {
    key: "faq",
    eyebrow: "FAQ",
    title: "Respostas completas para decidir com segurança",
    lead:
      "As dúvidas mais importantes sobre implantação, dados, assinatura, bloqueio de acesso e evolução do produto ficam centralizadas aqui.",
    image: dashboardPreview,
    imageAlt: "Tela de gestão do ImobiFlow",
    sections: [
      {
        title: "Como funciona o acesso?",
        body:
          "O acesso interno exige quatro validações: login válido, empresa vinculada, assinatura ativa e permissão do usuário. Se qualquer ponto falhar, a plataforma bloqueia o acesso e orienta regularização.",
        bullets: [
          "Usuário logado não significa usuário autorizado.",
          "Assinaturas canceladas, expiradas, inadimplentes ou inativas bloqueiam o sistema.",
          "Permissões controlam quais módulos cada perfil pode acessar.",
        ],
      },
      {
        title: "O sistema começa com dados fictícios?",
        body:
          "Não. A plataforma deve iniciar vazia. Quando não houver clientes, imóveis, contratos, vistorias ou lançamentos, o usuário verá estados vazios claros e ações para cadastrar dados reais.",
      },
      {
        title: "Como entram Kiwify e Cakto?",
        body:
          "O roadmap prevê webhooks de pagamento para ativar, renovar, cancelar ou bloquear assinaturas. A área interna consulta o status da assinatura antes de liberar o app.",
      },
      {
        title: "O que acontece se o pagamento atrasar?",
        body:
          "A empresa pode ser redirecionada para uma tela de assinatura bloqueada, com mensagem clara de regularizacao. A regra protege o negocio SaaS e evita uso sem plano ativo.",
        bullets: [
          "Assinatura inadimplente bloqueia acesso ao sistema.",
          "Usuarios continuam entendendo o motivo do bloqueio.",
          "A regularizacao reativa o acesso conforme status recebido.",
        ],
      },
      {
        title: "A landing depende do backend?",
        body:
          "Nao. A landing e as paginas informativas funcionam normalmente. Login real, cadastro completo e area interna dependem da API publicada e das variaveis de ambiente configuradas.",
        bullets: [
          "Landing publica continua acessivel.",
          "Autenticacao real sera liberada na etapa de ativacao da area segura.",
          "Backend, banco e integracoes de pagamento entram na proxima etapa tecnica.",
        ],
      },
    ],
  },
};

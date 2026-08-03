export type WebsiteBuilderComponentBlock = {
  name: string;
  componentType: string;
  propsJson?: Record<string, unknown>;
  styleJson?: Record<string, unknown>;
  responsiveJson?: Record<string, unknown>;
  animationJson?: Record<string, unknown>;
  interactionJson?: Record<string, unknown>;
};

export type WebsiteBuilderSectionBlock = {
  key: string;
  name: string;
  description: string;
  category: string;
  sectionType: string;
  propsJson?: Record<string, unknown>;
  styleJson?: Record<string, unknown>;
  responsiveJson?: Record<string, unknown>;
  animationJson?: Record<string, unknown>;
  components: WebsiteBuilderComponentBlock[];
};

export const websiteBuilderSectionBlocks: WebsiteBuilderSectionBlock[] = [
  {
    key: "luxury-hero",
    name: "Hero imobiliário premium",
    description: "Abertura elegante para site de imobiliária, com chamada principal e botão.",
    category: "hero",
    sectionType: "hero",
    propsJson: {
      layout: "luxury",
      eyebrow: "Imobiliária familiar",
    },
    styleJson: {
      background: "#080806",
      color: "#ffffff",
    },
    components: [
      {
        name: "Título principal",
        componentType: "heading",
        propsJson: {
          text: "Encontre o imóvel certo com atendimento de confiança",
        },
      },
      {
        name: "Texto de apoio",
        componentType: "text",
        propsJson: {
          text: "Use esta seção para apresentar a imobiliária e destacar imóveis reais publicados pelo ImobiFlow.",
        },
      },
      {
        name: "Botão de imóveis",
        componentType: "button",
        propsJson: {
          label: "Ver imóveis",
          href: "/imoveis",
        },
      },
    ],
  },
  {
    key: "property-carousel",
    name: "Carrossel de imóveis",
    description: "Seção preparada para listar imóveis publicados no site.",
    category: "properties",
    sectionType: "property_carousel",
    propsJson: {
      source: "published_properties",
      title: "Imóveis em destaque",
      emptyState: "Nenhum imóvel publicado ainda.",
    },
    components: [],
  },
  {
    key: "property-grid",
    name: "Grade de imóveis",
    description: "Lista filtrável de imóveis reais, preparada para a página de imóveis.",
    category: "properties",
    sectionType: "property_grid",
    propsJson: {
      source: "published_properties",
      title: "Vitrine de imóveis",
      emptyState: "Nenhum imóvel publicado ainda.",
    },
    components: [],
  },
  {
    key: "owner-lead-form",
    name: "Captação de proprietário",
    description: "Formulário estrutural para proprietários anunciarem imóveis.",
    category: "forms",
    sectionType: "owner_lead_form",
    propsJson: {
      destination: "crm_owner_leads",
      title: "Anuncie seu imóvel",
    },
    components: [
      {
        name: "Título do formulário",
        componentType: "heading",
        propsJson: {
          text: "Quer anunciar seu imóvel?",
        },
      },
      {
        name: "Texto do formulário",
        componentType: "text",
        propsJson: {
          text: "Receba uma avaliação e organize sua captação com dados reais no ImobiFlow.",
        },
      },
    ],
  },
  {
    key: "trust-differentials",
    name: "Diferenciais de confiança",
    description: "Bloco institucional para mostrar atendimento, segurança e organização.",
    category: "institutional",
    sectionType: "differentials",
    propsJson: {
      title: "Atendimento completo para cada etapa",
    },
    components: [
      {
        name: "Diferencial atendimento",
        componentType: "feature",
        propsJson: {
          title: "Atendimento humanizado",
          text: "Acompanhe compradores, locatários e proprietários com histórico centralizado.",
        },
      },
      {
        name: "Diferencial segurança",
        componentType: "feature",
        propsJson: {
          title: "Segurança documental",
          text: "Mantenha contratos, vistorias e dados sensíveis organizados.",
        },
      },
      {
        name: "Diferencial divulgação",
        componentType: "feature",
        propsJson: {
          title: "Divulgação integrada",
          text: "Prepare imóveis para site e portais sem duplicar cadastro.",
        },
      },
    ],
  },
  {
    key: "contact-cta",
    name: "Chamada para contato",
    description: "Seção simples para WhatsApp, telefone ou formulário.",
    category: "contact",
    sectionType: "contact_cta",
    propsJson: {
      destination: "crm_leads",
    },
    components: [
      {
        name: "Título",
        componentType: "heading",
        propsJson: {
          text: "Fale com a imobiliária",
        },
      },
      {
        name: "Botão WhatsApp",
        componentType: "button",
        propsJson: {
          label: "Chamar no WhatsApp",
          href: "wa.me",
        },
      },
    ],
  },
];

export function listWebsiteBuilderSectionBlocks(category?: string) {
  return websiteBuilderSectionBlocks.filter((block) => !category || block.category === category);
}

export function getWebsiteBuilderSectionBlock(key: string) {
  return websiteBuilderSectionBlocks.find((block) => block.key === key) ?? null;
}

import type { Prisma, PrismaClient } from "@prisma/client";

export const SYSTEM_WEBSITE_TEMPLATE_COMPANY_ID = "system";

type WebsiteTemplateDelegate = Pick<PrismaClient["websiteTemplate"], "upsert">;

type SystemWebsiteTemplate = {
  name: string;
  slug: string;
  description: string;
  category: string;
  thumbnailUrl?: string;
  structureJson: Prisma.InputJsonValue;
  themeJson: Prisma.InputJsonValue;
};

export const systemWebsiteTemplates: SystemWebsiteTemplate[] = [
  {
    name: "Site em branco",
    slug: "site-em-branco",
    description: "Template estrutural vazio para iniciar um site sem dados ficticios.",
    category: "system",
    structureJson: {
      pages: [
        {
          title: "Página inicial",
          slug: "home",
          pageType: "home",
          sections: [],
        },
      ],
    },
    themeJson: {
      colors: {},
      fonts: {},
      spacing: {},
    },
  },
  {
    name: "Imobiliária premium dourado",
    slug: "imobiliaria-premium-dourado",
    description: "Template estrutural elegante para imobiliária familiar de alto padrão, sem imóveis ou leads fictícios.",
    category: "real_estate_premium",
    thumbnailUrl: "/site-templates/imoveis-logo.png",
    structureJson: premiumRealEstateTemplate(),
    themeJson: premiumRealEstateTheme(),
  },
];

export async function ensureSystemWebsiteTemplates(prisma: { websiteTemplate: WebsiteTemplateDelegate }) {
  for (const template of systemWebsiteTemplates) {
    await prisma.websiteTemplate.upsert({
      where: {
        companyId_slug: {
          companyId: SYSTEM_WEBSITE_TEMPLATE_COMPANY_ID,
          slug: template.slug,
        },
      },
      update: {
        name: template.name,
        description: template.description,
        category: template.category,
        thumbnailUrl: template.thumbnailUrl,
        isSystem: true,
        isActive: true,
        structureJson: template.structureJson,
        themeJson: template.themeJson,
      },
      create: {
        companyId: SYSTEM_WEBSITE_TEMPLATE_COMPANY_ID,
        name: template.name,
        slug: template.slug,
        description: template.description,
        category: template.category,
        thumbnailUrl: template.thumbnailUrl,
        isSystem: true,
        isActive: true,
        structureJson: template.structureJson,
        themeJson: template.themeJson,
      },
    });
  }
}

function premiumRealEstateTheme(): Prisma.InputJsonValue {
  return {
    colors: {
      background: "#080806",
      foreground: "#ffffff",
      primary: "#c89b3c",
      secondary: "#f6f0df",
      muted: "#a7a29a",
    },
    fonts: {
      heading: "Playfair Display",
      body: "Inter",
    },
    radius: {
      cards: 8,
      buttons: 6,
    },
    spacing: {
      sectionY: 96,
    },
  };
}

function premiumRealEstateTemplate(): Prisma.InputJsonValue {
  return {
    pages: [
      {
        title: "Página inicial",
        slug: "home",
        pageType: "home",
        sections: [
          {
            name: "Hero principal",
            sectionType: "hero",
            propsJson: {
              layout: "luxury_real_estate",
            },
            styleJson: {
              background: "#080806",
              color: "#ffffff",
            },
            components: [
              {
                name: "Headline",
                componentType: "heading",
                propsJson: {
                  text: "Imóveis selecionados com atendimento familiar e alto padrão",
                },
              },
              {
                name: "Subtítulo",
                componentType: "text",
                propsJson: {
                  text: "Estrutura preparada para receber imóveis reais publicados pelo ImobiFlow.",
                },
              },
              {
                name: "Botão principal",
                componentType: "button",
                propsJson: {
                  label: "Ver imóveis",
                  href: "/imoveis",
                },
              },
            ],
          },
          {
            name: "Imóveis em destaque",
            sectionType: "property_carousel",
            propsJson: {
              source: "published_properties",
              title: "Destaques da carteira",
              emptyState: "Nenhum imóvel publicado ainda.",
            },
            components: [],
          },
          {
            name: "Como trabalhamos",
            sectionType: "process",
            propsJson: {
              title: "Uma jornada clara do primeiro contato até a chave",
            },
            components: [
              {
                name: "Etapa avaliação",
                componentType: "process_item",
                propsJson: {
                  title: "Avaliação",
                  text: "Organize dados reais do imóvel, proprietário e documentação.",
                },
              },
              {
                name: "Etapa divulgação",
                componentType: "process_item",
                propsJson: {
                  title: "Divulgação",
                  text: "Publique no site escolhido quando o imóvel estiver completo.",
                },
              },
              {
                name: "Etapa atendimento",
                componentType: "process_item",
                propsJson: {
                  title: "Atendimento",
                  text: "Receba leads reais no CRM do ImobiFlow.",
                },
              },
            ],
          },
          {
            name: "Contato",
            sectionType: "lead_form",
            propsJson: {
              title: "Fale com a imobiliária",
              destination: "crm_leads",
            },
            components: [],
          },
        ],
      },
      {
        title: "Imóveis",
        slug: "imoveis",
        pageType: "custom",
        sections: [
          {
            name: "Lista de imóveis",
            sectionType: "property_grid",
            propsJson: {
              source: "published_properties",
              emptyState: "Nenhum imóvel publicado ainda.",
            },
            components: [],
          },
        ],
      },
      {
        title: "Sobre",
        slug: "sobre",
        pageType: "about",
        sections: [
          {
            name: "Institucional",
            sectionType: "content",
            components: [
              {
                name: "Título",
                componentType: "heading",
                propsJson: {
                  text: "Atendimento imobiliário com confiança familiar",
                },
              },
              {
                name: "Texto",
                componentType: "text",
                propsJson: {
                  text: "Edite esta seção com a história, missão e diferenciais da imobiliária.",
                },
              },
            ],
          },
        ],
      },
      {
        title: "Contato",
        slug: "contato",
        pageType: "contact",
        sections: [
          {
            name: "Formulário de contato",
            sectionType: "contact_form",
            propsJson: {
              destination: "crm_leads",
            },
            components: [],
          },
        ],
      },
    ],
  };
}

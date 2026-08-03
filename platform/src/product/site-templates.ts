export type SiteTemplateKey = "premium_family_gold";

export type SiteTemplate = {
  key: SiteTemplateKey;
  name: string;
  subtitle: string;
  description: string;
  palette: string[];
  preview_image: string;
  recommended_for: string[];
};

export const defaultSiteTemplateKey: SiteTemplateKey = "premium_family_gold";

export const siteTemplates: SiteTemplate[] = [
  {
    key: "premium_family_gold",
    name: "Imóveis Premium Gold",
    subtitle: "Alto padrão, familiar e sofisticado",
    description:
      "Modelo preto, branco e dourado para imobiliárias que querem transmitir confiança, luxo, atendimento consultivo e forte desejo de compra ou locação.",
    palette: ["#050505", "#ffffff", "#c89b3c", "#f4e1a1", "#111827"],
    preview_image: "/site-templates/imoveis-logo.png",
    recommended_for: ["Imobiliária familiar", "Imóveis premium", "Venda e locação", "Captação de proprietários"],
  },
];

export function getSiteTemplate(key?: string | null) {
  return siteTemplates.find((template) => template.key === key) ?? siteTemplates[0];
}

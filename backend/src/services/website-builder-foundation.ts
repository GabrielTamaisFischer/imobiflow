import { z } from "zod";

export const websitePageTypeSchema = z.enum([
  "home",
  "property",
  "about",
  "contact",
  "landing",
  "blog",
  "terms",
  "privacy",
  "custom",
]);

const jsonRecord = z.record(z.unknown()).default({});

const componentTemplateSchema = z.object({
  name: z.string().default("Componente"),
  componentType: z.string().default("text"),
  propsJson: jsonRecord.optional(),
  styleJson: jsonRecord.optional(),
  responsiveJson: jsonRecord.optional(),
  animationJson: jsonRecord.optional(),
  interactionJson: jsonRecord.optional(),
});

const sectionTemplateSchema = z.object({
  name: z.string().default("Seção"),
  sectionType: z.string().default("section"),
  propsJson: jsonRecord.optional(),
  styleJson: jsonRecord.optional(),
  responsiveJson: jsonRecord.optional(),
  animationJson: jsonRecord.optional(),
  components: z.array(componentTemplateSchema).default([]),
});

const pageTemplateSchema = z.object({
  title: z.string().default("Página"),
  slug: z.string().default("pagina"),
  pageType: websitePageTypeSchema.default("custom"),
  sections: z.array(sectionTemplateSchema).default([]),
});

export const templateStructureSchema = z.object({
  pages: z.array(pageTemplateSchema).default([]),
});

export type WebsiteTemplateStructure = z.infer<typeof templateStructureSchema>;

export function sanitizeWebsiteSlug(value: string, fallback = "site") {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || fallback
  );
}

export function buildBlankHomePageTemplate() {
  return {
    title: "Página inicial",
    slug: "home",
    pageType: "home" as const,
    sections: [],
  };
}

export function normalizeTemplateStructure(input: unknown): WebsiteTemplateStructure {
  const parsed = templateStructureSchema.parse(input);
  const pages = parsed.pages.length > 0 ? parsed.pages : [buildBlankHomePageTemplate()];

  return {
    pages: pages.map((page, pageIndex) => ({
      ...page,
      slug: sanitizeWebsiteSlug(page.slug || page.title, `pagina-${pageIndex + 1}`),
      sections: page.sections.map((section) => ({
        ...section,
        components: section.components.map((component) => ({
          ...component,
          propsJson: component.propsJson ?? {},
          styleJson: component.styleJson ?? {},
          responsiveJson: component.responsiveJson ?? {},
          animationJson: component.animationJson ?? {},
          interactionJson: component.interactionJson ?? {},
        })),
        propsJson: section.propsJson ?? {},
        styleJson: section.styleJson ?? {},
        responsiveJson: section.responsiveJson ?? {},
        animationJson: section.animationJson ?? {},
      })),
    })),
  };
}

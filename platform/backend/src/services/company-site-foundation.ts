import { z } from "zod";

export const COMPANY_SITE_SECTION_TYPES = [
  "HEADER",
  "HERO",
  "SEARCH",
  "FEATURED_PROPERTIES",
  "PROPERTY_LIST",
  "ABOUT",
  "SERVICES",
  "BROKERS",
  "TESTIMONIALS",
  "CONTACT",
  "MAP",
  "CTA",
  "FORM",
  "FOOTER",
] as const;

const sectionTypeSchema = z.enum(COMPANY_SITE_SECTION_TYPES);
const jsonObjectSchema = z.record(z.unknown());

export const companySiteSectionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/),
  type: sectionTypeSchema,
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).max(1000),
  props: jsonObjectSchema.default({}),
});

export const companySiteThemeSchema = z
  .object({
    primary: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#c8a24b"),
    secondary: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#111827"),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#f4e1a1"),
    background: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#080806"),
    text: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#ffffff"),
    typography: z.string().min(1).max(80).default("Inter"),
    spacing: z.number().int().min(0).max(128).default(24),
    radius: z.number().int().min(0).max(64).default(12),
  })
  .strict();

export const companySiteConfigSchema = z
  .object({
    theme: companySiteThemeSchema.optional(),
    sections: z.array(companySiteSectionSchema).max(40).optional(),
    show_full_address: z.boolean().optional(),
    show_prices: z.boolean().optional(),
    allow_lead_capture: z.boolean().optional(),
    auto_publish_properties: z.boolean().optional(),
    template_key: z.string().min(1).max(100).optional(),
    active_template_key: z.string().min(1).max(100).optional(),
    favorite_template_keys: z.array(z.string().min(1).max(100)).max(20).optional(),
    featured_property_ids: z.array(z.string().uuid()).max(50).optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (containsUnsafeSiteConfig(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configuração contém conteúdo não permitido.",
      });
    }
  });

export type CompanySiteConfig = z.infer<typeof companySiteConfigSchema>;

export type CompanySiteTemplate = {
  key: string;
  name: string;
  description: string;
  theme: z.infer<typeof companySiteThemeSchema>;
  sections: Array<z.infer<typeof companySiteSectionSchema>>;
};

const template = (
  key: string,
  name: string,
  description: string,
  theme: z.infer<typeof companySiteThemeSchema>,
  sections: Array<z.infer<typeof companySiteSectionSchema>>,
): CompanySiteTemplate => ({ key, name, description, theme, sections });

export const COMPANY_SITE_TEMPLATES: readonly CompanySiteTemplate[] = [
  template(
    "classic",
    "Clássico",
    "Estrutura institucional com catálogo e contato.",
    {
      primary: "#c8a24b",
      secondary: "#111827",
      accent: "#f4e1a1",
      background: "#080806",
      text: "#ffffff",
      typography: "Inter",
      spacing: 24,
      radius: 12,
    },
    [
      { id: "header", type: "HEADER", enabled: true, order: 0, props: {} },
      { id: "hero", type: "HERO", enabled: true, order: 1, props: {} },
      { id: "properties", type: "PROPERTY_LIST", enabled: true, order: 2, props: {} },
      { id: "about", type: "ABOUT", enabled: true, order: 3, props: {} },
      { id: "contact", type: "CONTACT", enabled: true, order: 4, props: {} },
      { id: "footer", type: "FOOTER", enabled: true, order: 5, props: {} },
    ],
  ),
  template(
    "modern",
    "Moderno",
    "Busca, destaques e chamadas de conversão.",
    {
      primary: "#2563eb",
      secondary: "#0f172a",
      accent: "#93c5fd",
      background: "#f8fafc",
      text: "#0f172a",
      typography: "Inter",
      spacing: 20,
      radius: 16,
    },
    [
      { id: "header", type: "HEADER", enabled: true, order: 0, props: {} },
      { id: "hero", type: "HERO", enabled: true, order: 1, props: {} },
      { id: "search", type: "SEARCH", enabled: true, order: 2, props: {} },
      { id: "featured", type: "FEATURED_PROPERTIES", enabled: true, order: 3, props: {} },
      { id: "services", type: "SERVICES", enabled: true, order: 4, props: {} },
      { id: "form", type: "FORM", enabled: true, order: 5, props: {} },
      { id: "footer", type: "FOOTER", enabled: true, order: 6, props: {} },
    ],
  ),
  template(
    "minimal",
    "Minimal",
    "Catálogo enxuto para publicação rápida.",
    {
      primary: "#111827",
      secondary: "#374151",
      accent: "#d1d5db",
      background: "#ffffff",
      text: "#111827",
      typography: "Inter",
      spacing: 16,
      radius: 8,
    },
    [
      { id: "header", type: "HEADER", enabled: true, order: 0, props: {} },
      { id: "properties", type: "PROPERTY_LIST", enabled: true, order: 1, props: {} },
      { id: "cta", type: "CTA", enabled: true, order: 2, props: {} },
      { id: "footer", type: "FOOTER", enabled: true, order: 3, props: {} },
    ],
  ),
];

export function getCompanySiteTemplate(key: string | null | undefined) {
  return COMPANY_SITE_TEMPLATES.find((item) => item.key === key) ?? COMPANY_SITE_TEMPLATES[0];
}

export function applyCompanySiteTemplate(key: string | null | undefined): CompanySiteConfig {
  const selected = getCompanySiteTemplate(key);
  return {
    template_key: selected.key,
    active_template_key: selected.key,
    theme: structuredClone(selected.theme),
    sections: structuredClone(selected.sections),
  };
}

export function parseCompanySiteConfig(value: unknown) {
  return companySiteConfigSchema.parse(value ?? {});
}

function containsUnsafeSiteConfig(value: unknown): boolean {
  if (typeof value === "string") {
    return /javascript\s*:|<\s*script|on[a-z]+\s*=|data\s*:\s*text\/html/i.test(value);
  }
  if (Array.isArray(value)) return value.some(containsUnsafeSiteConfig);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) => /custom[_-]?js|script|html/i.test(key) || containsUnsafeSiteConfig(child),
  );
}

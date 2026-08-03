import { apiRequest, isUnavailableProductionApi } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";
import { safeSetPreviewItem } from "./preview-storage";

export type WebsiteBuilderStatus = "draft" | "published" | "offline" | "archived";

export type WebsiteBuilderFoundationStatus = {
  database: {
    provider: "mysql";
    configured: boolean;
    message: string;
  };
  storage: {
    provider: "cloudinary" | "cloudflare_r2" | "s3";
    configured: boolean;
    missing: string[];
    message: string;
  };
};

export type WebsiteBuilderWebsite = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  status: WebsiteBuilderStatus;
  templateId: string | null;
  themeJson: Record<string, unknown>;
  settingsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  pages?: WebsiteBuilderPage[];
  _count?: {
    pages?: number;
    assets?: number;
    versions?: number;
  };
};

export type WebsiteBuilderPage = {
  id: string;
  companyId: string;
  websiteId: string;
  title: string;
  slug: string;
  pageType: "home" | "property" | "about" | "contact" | "landing" | "blog" | "custom" | "terms" | "privacy";
  status: "draft" | "published" | "hidden" | "archived";
  sortOrder: number;
  seoJson: Record<string, unknown>;
  settingsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _count?: {
    sections?: number;
  };
};

export type WebsiteBuilderSection = {
  id: string;
  companyId: string;
  websiteId: string;
  pageId: string;
  name: string;
  sectionType: string;
  sortOrder: number;
  propsJson: Record<string, unknown>;
  styleJson: Record<string, unknown>;
  responsiveJson: Record<string, unknown>;
  animationJson: Record<string, unknown>;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    components?: number;
  };
};

export type WebsiteBuilderComponent = {
  id: string;
  companyId: string;
  websiteId: string;
  pageId: string;
  sectionId: string;
  parentComponentId: string | null;
  name: string;
  componentType: string;
  sortOrder: number;
  propsJson: Record<string, unknown>;
  styleJson: Record<string, unknown>;
  responsiveJson: Record<string, unknown>;
  animationJson: Record<string, unknown>;
  interactionJson: Record<string, unknown>;
  isVisible: boolean;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
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
  components: Array<{
    name: string;
    componentType: string;
    propsJson?: Record<string, unknown>;
    styleJson?: Record<string, unknown>;
    responsiveJson?: Record<string, unknown>;
    animationJson?: Record<string, unknown>;
    interactionJson?: Record<string, unknown>;
  }>;
};

export type WebsiteBuilderTemplate = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  structureJson: Record<string, unknown>;
  themeJson: Record<string, unknown>;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteBuilderAsset = {
  id: string;
  companyId: string;
  websiteId: string | null;
  assetType: "image" | "video" | "document" | "icon" | "font" | "other";
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string;
  publicUrl: string | null;
  status: "pending_upload" | "uploaded" | "failed" | "deleted";
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteBuilderCodeFile = {
  id: string;
  companyId: string;
  websiteId: string;
  pageId: string | null;
  filePath: string;
  fileType: string;
  language: "html" | "css" | "javascript" | "json" | "tsx" | "ts" | "markdown";
  content: string;
  createdById: string | null;
  updatedById: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteBuilderVersion = {
  id: string;
  companyId: string;
  websiteId: string;
  versionNumber: number;
  label: string | null;
  createdById: string | null;
  createdAt: string;
};

export type WebsiteBuilderPublishLog = {
  id: string;
  companyId: string;
  websiteId: string;
  status: "queued" | "success" | "failed";
  message: string | null;
  metadataJson: Record<string, unknown>;
  createdById: string | null;
  createdAt: string;
};

export type WebsiteBuilderDomain = {
  id: string;
  companyId: string;
  websiteId: string;
  domain: string;
  status: "pending" | "verified" | "failed" | "disabled";
  isPrimary: boolean;
  dnsJson: Record<string, unknown>;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteBuilderSeo = {
  id: string;
  companyId: string;
  websiteId: string;
  pageId: string | null;
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  ogImageAssetId: string | null;
  schemaJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteBuilderCreateWebsiteInput = {
  name: string;
  slug: string;
  theme_json?: Record<string, unknown>;
  settings_json?: Record<string, unknown>;
};

export type WebsiteBuilderCreatePageInput = {
  title: string;
  slug: string;
  page_type?: WebsiteBuilderPage["pageType"];
  status?: WebsiteBuilderPage["status"];
  sort_order?: number;
  seo_json?: Record<string, unknown>;
  settings_json?: Record<string, unknown>;
};

export type WebsiteBuilderCreateSectionInput = {
  name: string;
  section_type?: string;
  sort_order?: number;
  props_json?: Record<string, unknown>;
  style_json?: Record<string, unknown>;
  responsive_json?: Record<string, unknown>;
  animation_json?: Record<string, unknown>;
  is_visible?: boolean;
};

export type WebsiteBuilderCreateComponentInput = {
  parent_component_id?: string | null;
  name: string;
  component_type?: string;
  sort_order?: number;
  props_json?: Record<string, unknown>;
  style_json?: Record<string, unknown>;
  responsive_json?: Record<string, unknown>;
  animation_json?: Record<string, unknown>;
  interaction_json?: Record<string, unknown>;
  is_visible?: boolean;
  is_locked?: boolean;
};

export type WebsiteBuilderCodeFileInput = {
  page_id?: string | null;
  file_path: string;
  file_type: string;
  language: WebsiteBuilderCodeFile["language"];
  content: string;
};

function token() {
  return getStoredToken() ?? undefined;
}

export async function getWebsiteBuilderFoundationStatus() {
  if (isPreviewWebsiteBuilder()) {
    return {
      status: {
        database: {
          provider: "mysql" as const,
          configured: false,
          message: "Modo preview ativo ate o backend seguro publicado ficar conectado.",
        },
        storage: {
          provider: "cloudinary" as const,
          configured: false,
          missing: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
          message: "Cloudinary ainda nao configurado neste ambiente.",
        },
      },
    };
  }

  return apiRequest<{ status: WebsiteBuilderFoundationStatus }>("/website-builder/status", {
    token: token(),
  });
}

export async function listWebsiteBuilderWebsites() {
  if (isPreviewWebsiteBuilder()) return { websites: readPreviewBuilder().websites.map(withWebsiteCounts) };

  return apiRequest<{ websites: WebsiteBuilderWebsite[] }>("/website-builder/websites", {
    token: token(),
  });
}

export async function getWebsiteBuilderWebsite(id: string) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const website = ensurePreviewWebsite(state, id);
    writePreviewBuilder(state);
    return { website: withWebsiteCounts(website) };
  }

  return apiRequest<{ website: WebsiteBuilderWebsite }>(`/website-builder/websites/${id}`, {
    token: token(),
  });
}

export async function listWebsiteBuilderVersions(websiteId: string) {
  if (isPreviewWebsiteBuilder()) {
    return { versions: readPreviewBuilder().versions.filter((item) => item.websiteId === websiteId) };
  }

  return apiRequest<{ versions: WebsiteBuilderVersion[] }>(`/website-builder/websites/${websiteId}/versions`, {
    token: token(),
  });
}

export async function restoreWebsiteBuilderVersion(websiteId: string, versionId: string) {
  if (isPreviewWebsiteBuilder()) {
    return { restored: true };
  }

  return apiRequest<{ restored: true }>(`/website-builder/websites/${websiteId}/versions/${versionId}/restore`, {
    method: "POST",
    token: token(),
  });
}

export async function listWebsiteBuilderPublishLogs(websiteId: string) {
  if (isPreviewWebsiteBuilder()) {
    return { publish_logs: readPreviewBuilder().publishLogs.filter((item) => item.websiteId === websiteId) };
  }

  return apiRequest<{ publish_logs: WebsiteBuilderPublishLog[] }>(`/website-builder/websites/${websiteId}/publish-logs`, {
    token: token(),
  });
}

export async function listWebsiteBuilderDomains(websiteId: string) {
  if (isPreviewWebsiteBuilder()) {
    return { domains: readPreviewBuilder().domains.filter((item) => item.websiteId === websiteId) };
  }

  return apiRequest<{ domains: WebsiteBuilderDomain[] }>(`/website-builder/websites/${websiteId}/domains`, {
    token: token(),
  });
}

export async function createWebsiteBuilderDomain(
  websiteId: string,
  input: { domain: string; is_primary?: boolean },
) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const domain: WebsiteBuilderDomain = {
      id: previewId("domain"),
      companyId: previewCompanyId,
      websiteId,
      domain: input.domain,
      status: "pending",
      isPrimary: Boolean(input.is_primary),
      dnsJson: {},
      verifiedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.domains = input.is_primary
      ? [...state.domains.map((item) => ({ ...item, isPrimary: false })), domain]
      : [...state.domains, domain];
    writePreviewBuilder(state);
    return { domain };
  }

  return apiRequest<{ domain: WebsiteBuilderDomain }>(`/website-builder/websites/${websiteId}/domains`, {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function updateWebsiteBuilderDomain(
  domainId: string,
  input: { domain?: string; is_primary?: boolean },
) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    let updated: WebsiteBuilderDomain | null = null;
    state.domains = state.domains.map((domain) => {
      if (domain.id !== domainId) return input.is_primary ? { ...domain, isPrimary: false } : domain;
      updated = { ...domain, domain: input.domain ?? domain.domain, isPrimary: input.is_primary ?? domain.isPrimary, updatedAt: nowIso() };
      return updated;
    });
    if (!updated) throw new Error("Dominio nao encontrado no preview.");
    writePreviewBuilder(state);
    return { domain: updated };
  }

  return apiRequest<{ domain: WebsiteBuilderDomain }>(`/website-builder/domains/${domainId}`, {
    method: "PUT",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function deleteWebsiteBuilderDomain(domainId: string) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const domain = state.domains.find((item) => item.id === domainId);
    if (!domain) throw new Error("Dominio nao encontrado no preview.");
    state.domains = state.domains.filter((item) => item.id !== domainId);
    writePreviewBuilder(state);
    return { domain };
  }

  return apiRequest<{ domain: WebsiteBuilderDomain }>(`/website-builder/domains/${domainId}`, {
    method: "DELETE",
    token: token(),
  });
}

export async function listWebsiteBuilderSeo(websiteId: string) {
  if (isPreviewWebsiteBuilder()) {
    return { seo: readPreviewBuilder().seo.filter((item) => item.websiteId === websiteId) };
  }

  return apiRequest<{ seo: WebsiteBuilderSeo[] }>(`/website-builder/websites/${websiteId}/seo`, {
    token: token(),
  });
}

export async function upsertWebsiteBuilderSeo(
  websiteId: string,
  input: {
    page_id?: string | null;
    title?: string;
    description?: string;
    canonical_url?: string;
    og_image_asset_id?: string | null;
    schema_json?: Record<string, unknown>;
  },
) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const current = state.seo.find((item) => item.websiteId === websiteId && (item.pageId ?? null) === (input.page_id ?? null));
    const seo: WebsiteBuilderSeo = {
      id: current?.id ?? previewId("seo"),
      companyId: previewCompanyId,
      websiteId,
      pageId: input.page_id ?? null,
      title: input.title ?? current?.title ?? null,
      description: input.description ?? current?.description ?? null,
      canonicalUrl: input.canonical_url ?? current?.canonicalUrl ?? null,
      ogImageAssetId: input.og_image_asset_id ?? current?.ogImageAssetId ?? null,
      schemaJson: input.schema_json ?? current?.schemaJson ?? {},
      createdAt: current?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    state.seo = current ? state.seo.map((item) => (item.id === current.id ? seo : item)) : [...state.seo, seo];
    writePreviewBuilder(state);
    return { seo };
  }

  return apiRequest<{ seo: WebsiteBuilderSeo }>(`/website-builder/websites/${websiteId}/seo`, {
    method: "PUT",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function listWebsiteBuilderCodeFiles(websiteId: string) {
  return apiRequest<{ code_files: WebsiteBuilderCodeFile[] }>(`/website-builder/websites/${websiteId}/code-files`, {
    token: token(),
  });
}

export async function getWebsiteBuilderCodeFile(websiteId: string, fileId: string) {
  return apiRequest<{ code_file: WebsiteBuilderCodeFile }>(`/website-builder/websites/${websiteId}/code-files/${fileId}`, {
    token: token(),
  });
}

export async function createWebsiteBuilderCodeFile(websiteId: string, input: WebsiteBuilderCodeFileInput) {
  return apiRequest<{ code_file: WebsiteBuilderCodeFile }>(`/website-builder/websites/${websiteId}/code-files`, {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function updateWebsiteBuilderCodeFile(
  websiteId: string,
  fileId: string,
  input: Partial<WebsiteBuilderCodeFileInput>,
) {
  return apiRequest<{ code_file: WebsiteBuilderCodeFile }>(`/website-builder/websites/${websiteId}/code-files/${fileId}`, {
    method: "PUT",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function deleteWebsiteBuilderCodeFile(websiteId: string, fileId: string) {
  return apiRequest<{ code_file: WebsiteBuilderCodeFile }>(`/website-builder/websites/${websiteId}/code-files/${fileId}`, {
    method: "DELETE",
    token: token(),
  });
}

export async function createWebsiteBuilderWebsite(input: WebsiteBuilderCreateWebsiteInput) {
  if (isPreviewWebsiteBuilder()) return createPreviewWebsite(input, false);

  return apiRequest<{ website: WebsiteBuilderWebsite }>("/website-builder/websites", {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function createBlankWebsite(input: WebsiteBuilderCreateWebsiteInput) {
  if (isPreviewWebsiteBuilder()) return createPreviewWebsite(input, true);

  return apiRequest<{ website: WebsiteBuilderWebsite }>("/website-builder/websites/blank", {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function updateWebsiteBuilderWebsite(id: string, input: Partial<WebsiteBuilderCreateWebsiteInput>) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    ensurePreviewWebsite(state, id);
    let updated: WebsiteBuilderWebsite | null = null;
    state.websites = state.websites.map((website) => {
      if (website.id !== id) return website;
      updated = {
        ...website,
        name: input.name ?? website.name,
        slug: input.slug ?? website.slug,
        themeJson: input.theme_json ?? website.themeJson,
        settingsJson: input.settings_json ?? website.settingsJson,
        updatedAt: nowIso(),
      };
      return updated;
    });
    if (!updated) throw new Error("Site nao encontrado no preview.");
    addPreviewVersion(state, id, "Site atualizado");
    writePreviewBuilder(state);
    return { website: withWebsiteCounts(updated) };
  }

  return apiRequest<{ website: WebsiteBuilderWebsite }>(`/website-builder/websites/${id}`, {
    method: "PUT",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function deleteWebsiteBuilderWebsite(id: string) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const website = state.websites.find((item) => item.id === id);
    if (!website) throw new Error("Site nao encontrado no preview.");
    state.websites = state.websites.filter((item) => item.id !== id);
    state.pages = state.pages.filter((item) => item.websiteId !== id);
    state.sections = state.sections.filter((item) => item.websiteId !== id);
    state.components = state.components.filter((item) => item.websiteId !== id);
    state.assets = state.assets.filter((item) => item.websiteId !== id);
    state.versions = state.versions.filter((item) => item.websiteId !== id);
    writePreviewBuilder(state);
    return { website };
  }

  return apiRequest<{ website: WebsiteBuilderWebsite }>(`/website-builder/websites/${id}`, {
    method: "DELETE",
    token: token(),
  });
}

export async function listWebsiteBuilderTemplates() {
  if (isPreviewWebsiteBuilder()) return { templates: systemPreviewTemplates };

  return apiRequest<{ templates: WebsiteBuilderTemplate[] }>("/website-builder/templates", {
    token: token(),
  });
}

export async function listWebsiteBuilderSectionBlocks(category?: string) {
  if (isPreviewWebsiteBuilder()) {
    return { blocks: category ? previewSectionBlocks.filter((block) => block.category === category) : previewSectionBlocks };
  }

  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiRequest<{ blocks: WebsiteBuilderSectionBlock[] }>(`/website-builder/section-blocks${query}`, {
    token: token(),
  });
}

export async function cloneWebsiteBuilderTemplate(input: { template_id: string; name: string; slug: string }) {
  if (isPreviewWebsiteBuilder()) return createPreviewWebsite({ name: input.name, slug: input.slug }, true, input.template_id);

  return apiRequest<{ website: WebsiteBuilderWebsite }>("/website-builder/websites/from-template", {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function createWebsiteBuilderSectionFromBlock(
  pageId: string,
  input: { block_key: string; sort_order?: number },
) {
  if (isPreviewWebsiteBuilder()) {
    const block = previewSectionBlocks.find((item) => item.key === input.block_key);
    if (!block) throw new Error("Bloco nao encontrado no preview.");
    const sectionResponse = await createWebsiteBuilderSection(pageId, {
      name: block.name,
      section_type: block.sectionType,
      sort_order: input.sort_order,
      props_json: block.propsJson,
      style_json: block.styleJson,
      responsive_json: block.responsiveJson,
      animation_json: block.animationJson,
    });
    for (const [index, component] of block.components.entries()) {
      await createWebsiteBuilderComponent(sectionResponse.section.id, {
        ...component,
        component_type: component.componentType,
        sort_order: index,
      });
    }
    return sectionResponse;
  }

  return apiRequest<{ section: WebsiteBuilderSection }>(`/website-builder/pages/${pageId}/section-blocks`, {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function listWebsiteBuilderPages(websiteId: string) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    ensurePreviewWebsite(state, websiteId);
    writePreviewBuilder(state);
    return { pages: state.pages.filter((item) => item.websiteId === websiteId).map(withPageCounts) };
  }

  return apiRequest<{ pages: WebsiteBuilderPage[] }>(`/website-builder/websites/${websiteId}/pages`, {
    token: token(),
  });
}

export async function createWebsiteBuilderPage(websiteId: string, input: WebsiteBuilderCreatePageInput) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const page = makePreviewPage(websiteId, input);
    state.pages.push(page);
    addPreviewVersion(state, websiteId, "Pagina criada");
    writePreviewBuilder(state);
    return { page: withPageCounts(page) };
  }

  return apiRequest<{ page: WebsiteBuilderPage }>(`/website-builder/websites/${websiteId}/pages`, {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function updateWebsiteBuilderPage(pageId: string, input: Partial<WebsiteBuilderCreatePageInput>) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    let updated: WebsiteBuilderPage | null = null;
    state.pages = state.pages.map((page) => {
      if (page.id !== pageId) return page;
      updated = {
        ...page,
        title: input.title ?? page.title,
        slug: input.slug ?? page.slug,
        pageType: input.page_type ?? page.pageType,
        status: input.status ?? page.status,
        sortOrder: input.sort_order ?? page.sortOrder,
        seoJson: input.seo_json ?? page.seoJson,
        settingsJson: input.settings_json ?? page.settingsJson,
        updatedAt: nowIso(),
      };
      return updated;
    });
    if (!updated) throw new Error("Pagina nao encontrada no preview.");
    addPreviewVersion(state, updated.websiteId, "Pagina atualizada");
    writePreviewBuilder(state);
    return { page: withPageCounts(updated) };
  }

  return apiRequest<{ page: WebsiteBuilderPage }>(`/website-builder/pages/${pageId}`, {
    method: "PUT",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function deleteWebsiteBuilderPage(pageId: string) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const page = state.pages.find((item) => item.id === pageId);
    if (!page) throw new Error("Pagina nao encontrada no preview.");
    state.pages = state.pages.filter((item) => item.id !== pageId);
    state.sections = state.sections.filter((item) => item.pageId !== pageId);
    state.components = state.components.filter((item) => item.pageId !== pageId);
    addPreviewVersion(state, page.websiteId, "Pagina removida");
    writePreviewBuilder(state);
    return { page };
  }

  return apiRequest<{ page: WebsiteBuilderPage }>(`/website-builder/pages/${pageId}`, {
    method: "DELETE",
    token: token(),
  });
}

export async function listWebsiteBuilderSections(pageId: string) {
  if (isPreviewWebsiteBuilder()) {
    return { sections: readPreviewBuilder().sections.filter((item) => item.pageId === pageId).map(withSectionCounts) };
  }

  return apiRequest<{ sections: WebsiteBuilderSection[] }>(`/website-builder/pages/${pageId}/sections`, {
    token: token(),
  });
}

export async function createWebsiteBuilderSection(pageId: string, input: WebsiteBuilderCreateSectionInput) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const page = state.pages.find((item) => item.id === pageId);
    if (!page) throw new Error("Pagina nao encontrada no preview.");
    const section: WebsiteBuilderSection = {
      id: previewId("section"),
      companyId: previewCompanyId,
      websiteId: page.websiteId,
      pageId,
      name: input.name,
      sectionType: input.section_type ?? "section",
      sortOrder: input.sort_order ?? state.sections.filter((item) => item.pageId === pageId).length,
      propsJson: input.props_json ?? {},
      styleJson: input.style_json ?? {},
      responsiveJson: input.responsive_json ?? {},
      animationJson: input.animation_json ?? {},
      isVisible: input.is_visible ?? true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.sections.push(section);
    addPreviewVersion(state, page.websiteId, "Secao criada");
    writePreviewBuilder(state);
    return { section: withSectionCounts(section) };
  }

  return apiRequest<{ section: WebsiteBuilderSection }>(`/website-builder/pages/${pageId}/sections`, {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function updateWebsiteBuilderSection(sectionId: string, input: Partial<WebsiteBuilderCreateSectionInput>) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    let updated: WebsiteBuilderSection | null = null;
    state.sections = state.sections.map((section) => {
      if (section.id !== sectionId) return section;
      updated = {
        ...section,
        name: input.name ?? section.name,
        sectionType: input.section_type ?? section.sectionType,
        sortOrder: input.sort_order ?? section.sortOrder,
        propsJson: input.props_json ?? section.propsJson,
        styleJson: input.style_json ?? section.styleJson,
        responsiveJson: input.responsive_json ?? section.responsiveJson,
        animationJson: input.animation_json ?? section.animationJson,
        isVisible: input.is_visible ?? section.isVisible,
        updatedAt: nowIso(),
      };
      return updated;
    });
    if (!updated) throw new Error("Secao nao encontrada no preview.");
    addPreviewVersion(state, updated.websiteId, "Secao atualizada");
    writePreviewBuilder(state);
    return { section: withSectionCounts(updated) };
  }

  return apiRequest<{ section: WebsiteBuilderSection }>(`/website-builder/sections/${sectionId}`, {
    method: "PUT",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function deleteWebsiteBuilderSection(sectionId: string) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const section = state.sections.find((item) => item.id === sectionId);
    if (!section) throw new Error("Secao nao encontrada no preview.");
    state.sections = state.sections.filter((item) => item.id !== sectionId);
    state.components = state.components.filter((item) => item.sectionId !== sectionId);
    addPreviewVersion(state, section.websiteId, "Secao removida");
    writePreviewBuilder(state);
    return { section };
  }

  return apiRequest<{ section: WebsiteBuilderSection }>(`/website-builder/sections/${sectionId}`, {
    method: "DELETE",
    token: token(),
  });
}

export async function listWebsiteBuilderComponents(sectionId: string) {
  if (isPreviewWebsiteBuilder()) {
    return { components: readPreviewBuilder().components.filter((item) => item.sectionId === sectionId) };
  }

  return apiRequest<{ components: WebsiteBuilderComponent[] }>(`/website-builder/sections/${sectionId}/components`, {
    token: token(),
  });
}

export async function createWebsiteBuilderComponent(sectionId: string, input: WebsiteBuilderCreateComponentInput) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const section = state.sections.find((item) => item.id === sectionId);
    if (!section) throw new Error("Secao nao encontrada no preview.");
    const component: WebsiteBuilderComponent = {
      id: previewId("component"),
      companyId: previewCompanyId,
      websiteId: section.websiteId,
      pageId: section.pageId,
      sectionId,
      parentComponentId: input.parent_component_id ?? null,
      name: input.name,
      componentType: input.component_type ?? "text",
      sortOrder: input.sort_order ?? state.components.filter((item) => item.sectionId === sectionId).length,
      propsJson: input.props_json ?? {},
      styleJson: input.style_json ?? {},
      responsiveJson: input.responsive_json ?? {},
      animationJson: input.animation_json ?? {},
      interactionJson: input.interaction_json ?? {},
      isVisible: input.is_visible ?? true,
      isLocked: input.is_locked ?? false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.components.push(component);
    addPreviewVersion(state, section.websiteId, "Componente criado");
    writePreviewBuilder(state);
    return { component };
  }

  return apiRequest<{ component: WebsiteBuilderComponent }>(`/website-builder/sections/${sectionId}/components`, {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function updateWebsiteBuilderComponent(componentId: string, input: Partial<WebsiteBuilderCreateComponentInput>) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    let updated: WebsiteBuilderComponent | null = null;
    state.components = state.components.map((component) => {
      if (component.id !== componentId) return component;
      updated = {
        ...component,
        parentComponentId: input.parent_component_id ?? component.parentComponentId,
        name: input.name ?? component.name,
        componentType: input.component_type ?? component.componentType,
        sortOrder: input.sort_order ?? component.sortOrder,
        propsJson: input.props_json ?? component.propsJson,
        styleJson: input.style_json ?? component.styleJson,
        responsiveJson: input.responsive_json ?? component.responsiveJson,
        animationJson: input.animation_json ?? component.animationJson,
        interactionJson: input.interaction_json ?? component.interactionJson,
        isVisible: input.is_visible ?? component.isVisible,
        isLocked: input.is_locked ?? component.isLocked,
        updatedAt: nowIso(),
      };
      return updated;
    });
    if (!updated) throw new Error("Componente nao encontrado no preview.");
    addPreviewVersion(state, updated.websiteId, "Componente atualizado");
    writePreviewBuilder(state);
    return { component: updated };
  }

  return apiRequest<{ component: WebsiteBuilderComponent }>(`/website-builder/components/${componentId}`, {
    method: "PUT",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function deleteWebsiteBuilderComponent(componentId: string) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const component = state.components.find((item) => item.id === componentId);
    if (!component) throw new Error("Componente nao encontrado no preview.");
    state.components = state.components.filter((item) => item.id !== componentId);
    addPreviewVersion(state, component.websiteId, "Componente removido");
    writePreviewBuilder(state);
    return { component };
  }

  return apiRequest<{ component: WebsiteBuilderComponent }>(`/website-builder/components/${componentId}`, {
    method: "DELETE",
    token: token(),
  });
}

export async function listWebsiteBuilderAssets(websiteId?: string) {
  if (isPreviewWebsiteBuilder()) {
    const assets = readPreviewBuilder().assets.filter((asset) => !websiteId || asset.websiteId === websiteId);
    return { assets };
  }

  const query = websiteId ? `?website_id=${encodeURIComponent(websiteId)}` : "";
  return apiRequest<{ assets: WebsiteBuilderAsset[] }>(`/website-builder/assets${query}`, {
    token: token(),
  });
}

export async function requestWebsiteBuilderAssetUpload(input: {
  website_id?: string | null;
  asset_type: WebsiteBuilderAsset["assetType"];
  file_name: string;
  mime_type: string;
  file_size: number;
  content_base64: string;
  metadata_json?: Record<string, unknown>;
}) {
  if (isPreviewWebsiteBuilder()) {
    throw new Error("Upload real de arquivos exige backend e storage configurados. No preview, use imagens por URL ate ligarmos o storage real.");
  }

  return apiRequest<{
    asset: WebsiteBuilderAsset;
    upload: {
      storageProvider: string;
      storageBucket: string;
      storageKey: string;
      publicUrl: string;
      expiresInSeconds: number;
    };
    method: "POST";
  }>("/website-builder/assets/upload", {
    method: "POST",
    token: token(),
    body: JSON.stringify(input),
  });
}

export async function deleteWebsiteBuilderAsset(assetId: string) {
  if (isPreviewWebsiteBuilder()) {
    const state = readPreviewBuilder();
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error("Asset nao encontrado no preview.");
    state.assets = state.assets.filter((item) => item.id !== assetId);
    writePreviewBuilder(state);
    return { asset };
  }

  return apiRequest<{ asset: WebsiteBuilderAsset }>(`/website-builder/assets/${assetId}`, {
    method: "DELETE",
    token: token(),
  });
}

const previewCompanyId = "preview-company";
const previewBuilderKey = "imobiflow.preview.website_builder";

type PreviewBuilderState = {
  websites: WebsiteBuilderWebsite[];
  pages: WebsiteBuilderPage[];
  sections: WebsiteBuilderSection[];
  components: WebsiteBuilderComponent[];
  assets: WebsiteBuilderAsset[];
  versions: WebsiteBuilderVersion[];
  publishLogs: WebsiteBuilderPublishLog[];
  domains: WebsiteBuilderDomain[];
  seo: WebsiteBuilderSeo[];
};

const systemPreviewTemplates: WebsiteBuilderTemplate[] = [
  {
    id: "template-premium-family-gold",
    companyId: previewCompanyId,
    name: "Imoveis Premium Gold",
    slug: "premium-family-gold",
    category: "premium",
    description: "Modelo preto, branco e dourado para imobiliarias familiares e imoveis de alto padrao.",
    thumbnailUrl: "/site-templates/imoveis-logo.png",
    structureJson: {},
    themeJson: {
      colors: {
        primary: "#c89b3c",
        background: "#070707",
        foreground: "#ffffff",
      },
    },
    isSystem: true,
    isActive: true,
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
  },
];

const previewSectionBlocks: WebsiteBuilderSectionBlock[] = [
  {
    key: "hero-premium-real-estate",
    name: "Hero imobiliario premium",
    description: "Abertura elegante com chamada, subtitulo e botoes comerciais.",
    category: "hero",
    sectionType: "hero",
    propsJson: { eyebrow: "Imobiliaria familiar", title: "Imoveis que unem desejo, confianca e negociacao segura." },
    styleJson: { minHeight: "720px", background: "#070707", color: "#ffffff" },
    components: [
      { name: "Chamada principal", componentType: "heading", propsJson: { text: "Imoveis que unem desejo, confianca e negociacao segura." } },
      { name: "Texto de apoio", componentType: "text", propsJson: { text: "Uma vitrine premium conectada ao ImobiFlow para venda, locacao e captacao." } },
      { name: "Botao WhatsApp", componentType: "button", propsJson: { label: "Falar no WhatsApp", href: "#contato" } },
    ],
  },
  {
    key: "property-showcase",
    name: "Vitrine de imoveis",
    description: "Lista premium de imoveis reais publicados.",
    category: "properties",
    sectionType: "property_grid",
    propsJson: { title: "Imoveis em destaque", source: "published_properties" },
    styleJson: { padding: "96px 24px" },
    components: [
      { name: "Titulo da vitrine", componentType: "heading", propsJson: { text: "Uma curadoria elegante para compra e locacao." } },
      { name: "Grade de imoveis", componentType: "property_grid", propsJson: { source: "published_properties", limit: 9 } },
    ],
  },
  {
    key: "contact-premium",
    name: "Contato e captacao",
    description: "Formulario de interesse e CTA para proprietarios.",
    category: "contact",
    sectionType: "contact",
    propsJson: { title: "Fale com a equipe" },
    styleJson: { padding: "88px 24px", background: "#111111" },
    components: [
      { name: "Titulo contato", componentType: "heading", propsJson: { text: "Fale com a equipe e transforme interesse em atendimento." } },
      { name: "Formulario", componentType: "form", propsJson: { fields: ["name", "phone", "email", "message"] } },
    ],
  },
];

function isPreviewWebsiteBuilder() {
  return isPreviewToken(getStoredToken()) && isUnavailableProductionApi();
}

function createEmptyPreviewState(): PreviewBuilderState {
  return {
    websites: [],
    pages: [],
    sections: [],
    components: [],
    assets: [],
    versions: [],
    publishLogs: [],
    domains: [],
    seo: [],
  };
}

function readPreviewBuilder(): PreviewBuilderState {
  if (typeof window === "undefined") return createEmptyPreviewState();
  try {
    return { ...createEmptyPreviewState(), ...JSON.parse(window.localStorage.getItem(previewBuilderKey) ?? "{}") };
  } catch {
    return createEmptyPreviewState();
  }
}

function writePreviewBuilder(state: PreviewBuilderState) {
  safeSetPreviewItem(previewBuilderKey, JSON.stringify(state), () => JSON.stringify(compactPreviewBuilder(state)));
}

function compactPreviewBuilder(state: PreviewBuilderState): PreviewBuilderState {
  return {
    ...state,
    assets: state.assets.slice(0, 80),
    versions: state.versions.slice(0, 80),
    publishLogs: state.publishLogs.slice(0, 80),
  };
}

function ensurePreviewWebsite(state: PreviewBuilderState, websiteId: string): WebsiteBuilderWebsite {
  let website = state.websites.find((item) => item.id === websiteId);
  if (!website) {
    website = {
      id: websiteId,
      companyId: previewCompanyId,
      name: "Magnifico Imoveis - site em branco",
      slug: sanitizeSlug(websiteId.replace(/^website_/, "site-")),
      status: "draft",
      templateId: null,
      themeJson: systemPreviewTemplates[0].themeJson,
      settingsJson: {
        live_editor_url: "/site/magnificopaginainicial#topo",
        external_preview_url: "/site/magnificopaginainicial#topo",
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      publishedAt: null,
    };
    state.websites.unshift(website);
    addPreviewVersion(state, website.id, "Site de preview criado");
  }

  if (!state.pages.some((page) => page.websiteId === website.id)) {
    state.pages.push({
      id: `${website.id}-home`,
      companyId: previewCompanyId,
      websiteId: website.id,
      title: "Pagina inicial",
      slug: "home",
      pageType: "home",
      status: "draft",
      sortOrder: 0,
      seoJson: {},
      settingsJson: {
        preview_path: "#topo",
        preview_url: "/site/magnificopaginainicial#topo",
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  return website;
}

function createPreviewWebsite(input: WebsiteBuilderCreateWebsiteInput, createHomePage: boolean, templateId: string | null = null) {
  const state = readPreviewBuilder();
  const website = makePreviewWebsite(input, templateId);
  state.websites.unshift(website);

  if (createHomePage) {
    const page = makePreviewPage(website.id, { title: "Pagina inicial", slug: "home", page_type: "home" });
    state.pages.push(page);
    const hero = makePreviewSection(page, previewSectionBlocks[0], 0);
    const showcase = makePreviewSection(page, previewSectionBlocks[1], 1);
    state.sections.push(hero, showcase);
    state.components.push(...makePreviewComponents(hero, previewSectionBlocks[0]), ...makePreviewComponents(showcase, previewSectionBlocks[1]));
  }

  addPreviewVersion(state, website.id, createHomePage ? "Site em branco criado" : "Site criado");
  writePreviewBuilder(state);
  return Promise.resolve({ website: withWebsiteCounts(website) });
}

function makePreviewWebsite(input: WebsiteBuilderCreateWebsiteInput, templateId: string | null): WebsiteBuilderWebsite {
  return {
    id: previewId("website"),
    companyId: previewCompanyId,
    name: input.name,
    slug: sanitizeSlug(input.slug),
    status: "draft",
    templateId,
    themeJson: input.theme_json ?? systemPreviewTemplates[0].themeJson,
    settingsJson: input.settings_json ?? {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
    publishedAt: null,
  };
}

function makePreviewPage(websiteId: string, input: WebsiteBuilderCreatePageInput): WebsiteBuilderPage {
  return {
    id: previewId("page"),
    companyId: previewCompanyId,
    websiteId,
    title: input.title,
    slug: sanitizeSlug(input.slug || "pagina"),
    pageType: input.page_type ?? "custom",
    status: input.status ?? "draft",
    sortOrder: input.sort_order ?? 0,
    seoJson: input.seo_json ?? {},
    settingsJson: input.settings_json ?? {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function makePreviewSection(page: WebsiteBuilderPage, block: WebsiteBuilderSectionBlock, sortOrder: number): WebsiteBuilderSection {
  return {
    id: previewId("section"),
    companyId: previewCompanyId,
    websiteId: page.websiteId,
    pageId: page.id,
    name: block.name,
    sectionType: block.sectionType,
    sortOrder,
    propsJson: block.propsJson ?? {},
    styleJson: block.styleJson ?? {},
    responsiveJson: block.responsiveJson ?? {},
    animationJson: block.animationJson ?? {},
    isVisible: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function makePreviewComponents(section: WebsiteBuilderSection, block: WebsiteBuilderSectionBlock): WebsiteBuilderComponent[] {
  return block.components.map((component, index) => ({
    id: previewId("component"),
    companyId: previewCompanyId,
    websiteId: section.websiteId,
    pageId: section.pageId,
    sectionId: section.id,
    parentComponentId: null,
    name: component.name,
    componentType: component.componentType,
    sortOrder: index,
    propsJson: component.propsJson ?? {},
    styleJson: component.styleJson ?? {},
    responsiveJson: component.responsiveJson ?? {},
    animationJson: component.animationJson ?? {},
    interactionJson: component.interactionJson ?? {},
    isVisible: true,
    isLocked: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));
}

function withWebsiteCounts(website: WebsiteBuilderWebsite): WebsiteBuilderWebsite {
  const state = readPreviewBuilder();
  return {
    ...website,
    _count: {
      pages: state.pages.filter((page) => page.websiteId === website.id).length,
      assets: state.assets.filter((asset) => asset.websiteId === website.id).length,
      versions: state.versions.filter((version) => version.websiteId === website.id).length,
    },
  };
}

function withPageCounts(page: WebsiteBuilderPage): WebsiteBuilderPage {
  return {
    ...page,
    _count: {
      sections: readPreviewBuilder().sections.filter((section) => section.pageId === page.id).length,
    },
  };
}

function withSectionCounts(section: WebsiteBuilderSection): WebsiteBuilderSection {
  return {
    ...section,
    _count: {
      components: readPreviewBuilder().components.filter((component) => component.sectionId === section.id).length,
    },
  };
}

function addPreviewVersion(state: PreviewBuilderState, websiteId: string, label: string) {
  const nextNumber = state.versions.filter((version) => version.websiteId === websiteId).length + 1;
  state.versions.unshift({
    id: previewId("version"),
    companyId: previewCompanyId,
    websiteId,
    versionNumber: nextNumber,
    label,
    createdById: "preview-user",
    createdAt: nowIso(),
  });
}

function previewId(prefix: string) {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "site";
}

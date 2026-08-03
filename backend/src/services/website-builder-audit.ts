import type { RequestWithAccess } from "../types/access.js";

export type WebsiteBuilderAuditAction =
  | "website_created"
  | "website_updated"
  | "website_deleted"
  | "website_cloned"
  | "page_created"
  | "page_updated"
  | "page_deleted"
  | "section_created"
  | "section_updated"
  | "section_deleted"
  | "component_created"
  | "component_updated"
  | "component_deleted"
  | "asset_upload_requested"
  | "asset_uploaded"
  | "asset_deleted"
  | "domain_created"
  | "domain_updated"
  | "domain_deleted"
  | "seo_updated"
  | "code_editor_opened"
  | "code_file_selected"
  | "code_file_created"
  | "code_file_updated"
  | "code_file_deleted"
  | "code_editor_saved";

type WebsiteBuilderAuditClient = {
  websiteAuditLog: {
    create: (input: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export type WebsiteBuilderAuditInput = {
  action: WebsiteBuilderAuditAction;
  entityType: string;
  entityId?: string | null;
  websiteId?: string | null;
  pageId?: string | null;
  sectionId?: string | null;
  componentId?: string | null;
  assetId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
};

export async function createWebsiteBuilderAuditLog(
  prisma: WebsiteBuilderAuditClient,
  req: RequestWithAccess,
  input: WebsiteBuilderAuditInput,
) {
  const companyId = req.access?.company.id;

  if (!companyId) {
    throw Object.assign(new Error("Contexto de empresa obrigatório para auditoria."), { statusCode: 403 });
  }

  await prisma.websiteAuditLog.create({
    data: {
      companyId,
      websiteId: input.websiteId ?? null,
      pageId: input.pageId ?? null,
      sectionId: input.sectionId ?? null,
      componentId: input.componentId ?? null,
      assetId: input.assetId ?? null,
      actorUserId: req.access?.appUser.id ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      metadataJson: input.metadata ?? {},
      ipAddress: req.ip?.slice(0, 80) ?? null,
      userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
}

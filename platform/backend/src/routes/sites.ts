import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import {
  isSiteSlugTakenByAnotherCompany,
  prisma,
  serializeCompanySite,
  syncMysqlPropertyPublication,
  WATERMARK_LOGO_ENTITY_TYPE,
} from "../services/mysql-real-estate.js";
import {
  emitPropertyPublishedEvent,
  recordWhatsAppLinkOpened,
  resolveWhatsAppOwnerNotification,
} from "../services/property-events.js";
import { validateUploadFile } from "../services/storage/file-policy.js";
import { buildStorageFolder, getStorageProvider, getStorageProviderForName } from "../services/storage/index.js";
import {
  createStoredFileRecord,
  deleteStoredFileRecordsForEntity,
  findStoredFileForEntity,
} from "../services/storage/stored-files.js";
import { WATERMARK_POSITIONS } from "../services/storage/types.js";
import type { StorageProviderName, StorageResourceType } from "../services/storage/types.js";
import type { RequestWithAccess } from "../types/access.js";

export const sitesRouter = Router();

sitesRouter.use(requireAuth, requireCompany, requireActiveSubscription);

// F3C (2026-09-04): configuração de marca d'água por empresa. Vive dentro de
// settings_json (CompanySite já tinha esse Json e já aceitava chaves extras
// via catchall — nenhuma migration nova foi necessária). Validado aqui de
// forma explícita (enum de posição, faixa de opacidade) em vez de confiar no
// catchall — é a única parte de settings_json que precisa rejeitar valor
// malformado/malicioso em vez de só aceitar qualquer coisa.
export const watermarkSettingsSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    position: z.enum(WATERMARK_POSITIONS).optional().default("bottom-right"),
    // 10-100: abaixo de 10% a marca d'água deixa de ser útil (imperceptível);
    // acima de 100% não faz sentido (opacidade máxima já é 100).
    opacity: z.number().int().min(10).max(100).optional().default(60),
  })
  .strict();

export const siteSchema = z.object({
  slug: z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  custom_domain: z.string().max(180).optional().or(z.literal("")),
  brand_name: z.string().min(2).max(160),
  headline: z.string().max(180).optional().or(z.literal("")),
  description: z.string().max(1200).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  whatsapp: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  // Achado real em QA (2026-08-30): z.string().url() exige URL absoluta com
  // protocolo (https://...), mas o próprio formulário do frontend usa como
  // valor padrão um caminho RELATIVO ("/site-templates/imoveis-logo.png",
  // asset estático do próprio app) — válido como src de <img>, mas
  // rejeitado por esta validação. Resultado: qualquer empresa nova que
  // clicasse em "Salvar site" pela primeira vez, sem trocar o logo padrão,
  // recebia um 400 genérico ("Dados inválidos. Revise os campos.") sem
  // indicar qual campo, e ficava sem conseguir criar o CompanySite — a
  // própria pergunta que o item 7 do escopo pede para nunca deixar sem
  // resposta. logo_url aceita tanto um caminho relativo (asset local)
  // quanto uma URL absoluta (upload real via Local/Cloudinary/R2); o que
  // importa é ser uma string razoável, não uma URL RFC-estrita.
  logo_url: z.string().max(300).optional().or(z.literal("")),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#111827"),
  settings_json: z
    .object({
      show_full_address: z.boolean().optional().default(false),
      show_prices: z.boolean().optional().default(true),
      allow_lead_capture: z.boolean().optional().default(true),
      auto_publish_properties: z.boolean().optional().default(true),
      template_key: z.string().optional(),
      active_template_key: z.string().optional(),
      favorite_template_keys: z.array(z.string()).optional().default([]),
      featured_property_ids: z.array(z.string()).optional().default([]),
      watermark: watermarkSettingsSchema.optional().default({ enabled: false, position: "bottom-right", opacity: 60 }),
    })
    .catchall(z.unknown())
    .default({}),
  seo_json: z.record(z.unknown()).optional().default({}),
});

sitesRouter.get("/settings", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const [site, watermarkLogo] = await Promise.all([
      prisma().companySite.findFirst({ where: { companyId } }),
      findStoredFileForEntity(companyId, WATERMARK_LOGO_ENTITY_TYPE, companyId),
    ]);

    res.json({ site: site ? serializeCompanySite(site) : null, watermark_logo: serializeWatermarkLogo(watermarkLogo) });
  } catch (error) {
    next(error);
  }
});

const watermarkLogoUploadSchema = z.object({
  file_name: z.string().min(1).max(180),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  size_bytes: z.number().int().positive().max(4 * 1024 * 1024),
  content_base64: z.string().min(1),
});

// F3C: upload do logo usado como marca d'água. Reaproveita 100% a
// infraestrutura de storage já existente para property_media (mesmo
// validateUploadFile/getStorageProvider/StoredFile) — só troca o "purpose"
// para "website_logo" (já existia em StoragePurpose/file-policy.ts/
// buildStorageFolder, nunca tinha um endpoint real usando-o) e o
// entityType/entityId do StoredFile para WATERMARK_LOGO_ENTITY_TYPE +
// companyId (nunca um id vindo do cliente — ver mysql-real-estate.ts).
// Sempre substitui o logo anterior (remove o StoredFile + o asset remoto
// antigo antes de gravar o novo) para nunca acumular lixo nem deixar dúvida
// sobre "qual é o logo atual".
sitesRouter.post(
  "/settings/watermark-logo",
  requirePermission("site.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = watermarkLogoUploadSchema.parse(req.body);
      const body = decodeBase64File(input.content_base64);
      const policy = validateUploadFile({
        purpose: "website_logo",
        fileName: input.file_name,
        mimeType: input.mime_type,
        declaredSizeBytes: input.size_bytes,
        body,
      });

      await removeExistingWatermarkLogo(companyId);

      const storage = getStorageProvider();
      const uploaded = await storage.uploadFile({
        companyId,
        entityType: WATERMARK_LOGO_ENTITY_TYPE,
        entityId: companyId,
        purpose: "website_logo",
        fileName: input.file_name,
        mimeType: policy.normalizedMimeType,
        sizeBytes: policy.measuredSizeBytes,
        body,
        folder: buildStorageFolder({ companyId, purpose: "website_logo" }),
      });

      const storedFile = await createStoredFileRecord({
        companyId,
        entityType: WATERMARK_LOGO_ENTITY_TYPE,
        entityId: companyId,
        file: uploaded,
        uploadedBy: userId,
        purpose: "company_logo",
      });

      await prisma().websiteAuditLog.create({
        data: {
          companyId,
          actorUserId: uuidOrNull(userId),
          // "asset_uploaded"/"asset_deleted" (enum WebsiteAuditAction já
          // existente, mesmo usado por property_media) evita precisar de uma
          // migration só para 2 valores novos de enum — entityType já
          // distingue este evento como sendo do logo de watermark.
          action: "asset_uploaded",
          entityType: WATERMARK_LOGO_ENTITY_TYPE,
          entityId: companyId,
          metadataJson: { provider: uploaded.provider, mimeType: policy.normalizedMimeType, purpose: "company_logo" },
        },
      });

      res.status(201).json({ watermark_logo: serializeWatermarkLogo(storedFile) });
    } catch (error) {
      next(error);
    }
  },
);

sitesRouter.delete(
  "/settings/watermark-logo",
  requirePermission("site.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const removed = await removeExistingWatermarkLogo(companyId);

      await prisma().websiteAuditLog.create({
        data: {
          companyId,
          actorUserId: uuidOrNull(userId),
          action: "asset_deleted",
          entityType: WATERMARK_LOGO_ENTITY_TYPE,
          entityId: companyId,
          metadataJson: { hadLogo: Boolean(removed), purpose: "company_logo" },
        },
      });

      res.json({ ok: true, watermark_logo: null });
    } catch (error) {
      next(error);
    }
  },
);

// companyId vem sempre de req.access! (contexto autenticado) — nunca do
// cliente — então esta função nunca pode tocar o logo de outra empresa por
// construção, não só por checagem.
async function removeExistingWatermarkLogo(companyId: string) {
  const existing = await findStoredFileForEntity(companyId, WATERMARK_LOGO_ENTITY_TYPE, companyId);
  if (!existing) return null;

  try {
    await getStorageProviderForName(existing.provider as StorageProviderName).deleteFile({
      publicId: existing.publicId,
      resourceType: existing.resourceType as StorageResourceType,
    });
  } catch {
    // Mesmo se a remoção remota falhar (provider indisponível/asset já
    // removido manualmente), o registro local é removido — nunca deixamos o
    // logo "travado" impossível de trocar por causa de uma falha externa.
  }
  await deleteStoredFileRecordsForEntity(companyId, WATERMARK_LOGO_ENTITY_TYPE, companyId);
  return existing;
}

function serializeWatermarkLogo(
  storedFile: { secureUrl: string; originalFilename: string; provider: string; createdAt: Date } | null,
) {
  if (!storedFile) return null;
  return {
    url: storedFile.secureUrl,
    original_filename: storedFile.originalFilename,
    provider: storedFile.provider,
    uploaded_at: storedFile.createdAt.toISOString(),
  };
}

sitesRouter.put("/settings", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const userId = req.access!.appUser.id;
    const input = siteSchema.parse(req.body);
    const existing = await prisma().companySite.findFirst({ where: { companyId } });

    // P0 multiempresa: o schema ja garante slug globalmente unico
    // (@@unique([slug]) em CompanySite), exatamente para que o roteamento
    // publico (GET /public/sites/:slug, que nao tem como saber qual empresa
    // o visitante pretendia) sempre resolva para uma unica empresa. Esta
    // checagem aplicativa complementa a constraint do banco: ela distingue
    // "este e o MEU proprio site, estou apenas atualizando" (permitido) de
    // "outra empresa ja publicou este slug" (bloqueado), retornando um erro
    // de negocio claro em vez de um erro generico de constraint violation —
    // sem isso, duas empresas tentando o mesmo slug so descobririam o
    // conflito por um 500/erro de banco pouco informativo. Ver auditoria de
    // isolamento multiempresa do site publico.
    if (await isSiteSlugTakenByAnotherCompany(companyId, input.slug)) throw siteSlugTaken();

    const data = {
      companyId,
      createdBy: uuidOrNull(userId),
      slug: input.slug,
      customDomain: emptyToNull(input.custom_domain),
      brandName: input.brand_name,
      headline: emptyToNull(input.headline),
      description: emptyToNull(input.description),
      phone: emptyToNull(input.phone),
      whatsapp: emptyToNull(input.whatsapp),
      email: emptyToNull(input.email),
      logoUrl: emptyToNull(input.logo_url),
      primaryColor: input.primary_color,
      settingsJson: input.settings_json as Prisma.InputJsonValue,
      seoJson: input.seo_json as Prisma.InputJsonValue,
    };

    const site = existing
      ? await prisma().companySite.update({ where: { id: existing.id }, data })
      : await prisma().companySite.create({ data: { ...data, status: "draft" } });

    await prisma().websiteAuditLog.create({
      data: {
        companyId,
        actorUserId: uuidOrNull(userId),
        action: "site_settings_saved",
        entityType: "company_sites",
        entityId: site.id,
        metadataJson: { slug: site.slug, status: site.status },
      },
    });

    res.json({ site: serializeCompanySite(site) });
  } catch (error) {
    next(error);
  }
});

sitesRouter.post("/publish", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const userId = req.access!.appUser.id;
    const existing = await prisma().companySite.findFirst({ where: { companyId } });
    if (!existing) throw siteNotFound();

    const site = await prisma().companySite.update({
      where: { id: existing.id },
      data: { status: "published", publishedAt: new Date() },
    });

    await prisma().websiteAuditLog.create({
      data: {
        companyId,
        actorUserId: uuidOrNull(userId),
        action: "site_published",
        entityType: "company_sites",
        entityId: site.id,
        metadataJson: { slug: site.slug },
      },
    });

    res.json({ site: serializeCompanySite(site) });
  } catch (error) {
    next(error);
  }
});

sitesRouter.post("/unpublish", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const userId = req.access!.appUser.id;
    const existing = await prisma().companySite.findFirst({ where: { companyId } });
    if (!existing) throw siteNotFound();

    const site = await prisma().companySite.update({
      where: { id: existing.id },
      data: { status: "offline" },
    });

    await prisma().websiteAuditLog.create({
      data: {
        companyId,
        actorUserId: uuidOrNull(userId),
        action: "site_unpublished",
        entityType: "company_sites",
        entityId: site.id,
        metadataJson: { slug: site.slug },
      },
    });

    res.json({ site: serializeCompanySite(site) });
  } catch (error) {
    next(error);
  }
});

sitesRouter.get("/leads", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const leads = await prisma().siteLead.findMany({
      where: { companyId },
      include: {
        property: { select: { id: true, code: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({
      leads: leads.map((lead) => ({
        id: lead.id,
        site_id: lead.siteId,
        property_id: lead.propertyId,
        lead_id: lead.leadId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        message: lead.message,
        source_url: lead.sourceUrl,
        metadata: lead.metadata,
        created_at: lead.createdAt.toISOString(),
        properties: lead.property
          ? { id: lead.property.id, code: lead.property.code, title: lead.property.title }
          : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// BUG-SITE-001 (corrigido): publicar um imóvel nunca deve sobrescrever o
// status operacional dele. Antes, este endpoint forçava status="available"
// incondicionalmente, o que fazia um imóvel "alugado"/"vendido"/"reservado"
// voltar a aparecer como disponível só por ter sido (re)publicado no site.
//
// Correção: publicar/despublicar por aqui agora usa exatamente a mesma
// lógica de prontidão (syncMysqlPropertyPublication) já usada pelo
// formulário normal de edição de imóvel (toggle "Liberado no site?"),
// evitando duas implementações divergentes da mesma regra de negócio.
// O status do imóvel só é alterado pelo próprio usuário, via edição
// explícita do imóvel — nunca como efeito colateral de publicar no site.
sitesRouter.post(
  "/properties/:id/publish",
  requirePermission("site.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const propertyId = String(req.params.id);
      const existing = await prisma().property.findFirst({ where: { id: propertyId, companyId } });
      if (!existing) throw propertyNotFound();

      if (!["available", "reserved"].includes(existing.status)) {
        throw propertyNotPublishable(existing.status);
      }

      await prisma().property.update({
        where: { id: existing.id },
        data: {
          publicationSettingsJson: {
            ...asRecord(existing.publicationSettingsJson),
            site_enabled: true,
          } as Prisma.InputJsonValue,
        },
      });

      const { published } = await syncMysqlPropertyPublication(companyId, existing.id);
      if (!published) throw propertyNotReadyForPublication();

      const property = await prisma().property.findFirst({
        where: { id: existing.id, companyId },
        select: { id: true, code: true, title: true, status: true, publishedAt: true },
      });
      if (!property) throw propertyNotFound();

      await prisma().websiteAuditLog.create({
        data: {
          companyId,
          actorUserId: uuidOrNull(userId),
          action: "site_property_published",
          entityType: "properties",
          entityId: property.id,
          metadataJson: { code: property.code, title: property.title, status: property.status },
        },
      });

      // Item 15 do escopo / Diretriz Mestre Seção 7: evento property.published
      // só AVALIA se um deeplink de WhatsApp pode ser oferecido (e registra em
      // auditoria quando não pode) — nunca envia nada pelo servidor. Toda a
      // lógica vive em property-events.ts. Nunca deve derrubar esta resposta.
      void emitPropertyPublishedEvent(companyId, property.id).catch((eventError) => {
        console.error("[property.published] evento falhou de forma inesperada", eventError);
      });

      res.json({ property: serializeSiteProperty(property) });
    } catch (error) {
      next(error);
    }
  },
);

// Diretriz Mestre do MVP, Seção 7: chamada SOB DEMANDA pela UI (ex.: ao abrir
// a tela do imóvel publicado) para decidir se mostra o botão "Enviar anúncio
// ao proprietário pelo WhatsApp" e montar o texto/URL prontos. Não envia nada
// — só calcula. A mesma validação real de URL pública de emitPropertyPublishedEvent
// é reaproveitada (resolveWhatsAppOwnerNotification), nunca reimplementada aqui.
sitesRouter.get(
  "/properties/:id/whatsapp-link",
  requirePermission("site.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const propertyId = String(req.params.id);
      const result = await resolveWhatsAppOwnerNotification(companyId, propertyId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// Diretriz Mestre do MVP, Seção 7: chamada pelo FRONTEND no exato momento em
// que o link wa.me é aberto (após o clique do usuário no botão), só para
// deixar auditável que o link foi aberto. NUNCA implica que a mensagem foi
// enviada/recebida — só que o usuário abriu o WhatsApp com o texto pronto.
sitesRouter.post(
  "/properties/:id/whatsapp-link-opened",
  requirePermission("site.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const propertyId = String(req.params.id);
      const existing = await prisma().property.findFirst({
        where: { id: propertyId, companyId },
        select: { id: true },
      });
      if (!existing) throw propertyNotFound();
      await recordWhatsAppLinkOpened(companyId, propertyId, uuidOrNull(userId));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

sitesRouter.post(
  "/properties/:id/unpublish",
  requirePermission("site.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const propertyId = String(req.params.id);
      const existing = await prisma().property.findFirst({ where: { id: propertyId, companyId } });
      if (!existing) throw propertyNotFound();

      await prisma().property.update({
        where: { id: existing.id },
        data: {
          publicationSettingsJson: {
            ...asRecord(existing.publicationSettingsJson),
            site_enabled: false,
          } as Prisma.InputJsonValue,
        },
      });

      await syncMysqlPropertyPublication(companyId, existing.id);

      const property = await prisma().property.findFirst({
        where: { id: existing.id, companyId },
        select: { id: true, code: true, title: true, status: true, publishedAt: true },
      });
      if (!property) throw propertyNotFound();

      await prisma().websiteAuditLog.create({
        data: {
          companyId,
          actorUserId: uuidOrNull(userId),
          action: "site_property_unpublished",
          entityType: "properties",
          entityId: property.id,
          metadataJson: { code: property.code, title: property.title, status: property.status },
        },
      });

      res.json({ property: serializeSiteProperty(property) });
    } catch (error) {
      next(error);
    }
  },
);

function serializeSiteProperty(property: {
  id: string;
  code: string | null;
  title: string;
  status: string;
  publishedAt: Date | null;
}) {
  return {
    id: property.id,
    code: property.code,
    title: property.title,
    status: property.status,
    published_at: property.publishedAt?.toISOString() ?? null,
  };
}

function decodeBase64File(content: string) {
  const base64 = content.includes(",") ? content.split(",").at(-1) : content;
  return Buffer.from(base64 ?? "", "base64");
}

function emptyToNull(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function uuidOrNull(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function siteNotFound() {
  return Object.assign(new Error("Site não encontrado para esta empresa."), {
    statusCode: 404,
    code: "SITE_NOT_FOUND",
  });
}

function siteSlugTaken() {
  return Object.assign(
    new Error("Este endereço (slug) já está em uso por outra imobiliária. Escolha outro."),
    { statusCode: 409, code: "SITE_SLUG_TAKEN" },
  );
}

function propertyNotFound() {
  return Object.assign(new Error("Imóvel não encontrado para esta empresa."), {
    statusCode: 404,
    code: "PROPERTY_NOT_FOUND",
  });
}

function propertyNotPublishable(currentStatus: string) {
  return Object.assign(
    new Error(
      `Imóvel com status "${currentStatus}" não pode ser publicado no site. ` +
        `Defina o status do imóvel como "available" (disponível) ou "reserved" (reservado) antes de publicar.`,
    ),
    { statusCode: 409, code: "PROPERTY_NOT_PUBLISHABLE" },
  );
}

function propertyNotReadyForPublication() {
  return Object.assign(
    new Error(
      "Imóvel ainda não está pronto para publicação no site: verifique proprietário, título, descrição, " +
        "endereço completo, preço e ao menos uma foto de capa.",
    ),
    { statusCode: 422, code: "PROPERTY_NOT_READY_FOR_PUBLICATION" },
  );
}

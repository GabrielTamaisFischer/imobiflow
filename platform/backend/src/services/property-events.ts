import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { getWhatsAppProvider } from "./whatsapp/index.js";
import { loadMysqlPublicPropertyByReference, prisma } from "./mysql-real-estate.js";

// NOTA TÉCNICA (2026-08-30, atualizada): "property_published_owner_notified"
// e "property_published_owner_notification_skipped" já existem de verdade no
// enum website_audit_logs.action no banco (migração
// 202608300004_property_published_notification_audit, aplicada e
// verificada via SHOW COLUMNS). O Prisma Client gerado neste sandbox está
// desatualizado porque `prisma generate` precisa baixar o schema-engine de
// binaries.prisma.sh, bloqueado pela rede deste ambiente.
//
// Verificação end-to-end real (2026-08-30) mostrou que um simples cast de
// TIPO (`as WebsiteAuditActionWorkaround as never`) NÃO bastava: o Prisma
// Client valida o valor do enum em TEMPO DE EXECUÇÃO contra os metadados
// (DMMF) gerados — que são os antigos, sem os dois valores novos — e lança
// PrismaClientValidationError mesmo a coluna aceitando o valor no MySQL.
// Por isso estes dois inserts usam SQL bruto ($executeRaw) só para estes
// dois valores de enum novos, contornando a validação client-side do
// Prisma. O restante do módulo (Property, CompanySite) continua usando o
// Prisma Client normalmente. Remover o $executeRaw e voltar a usar
// prisma().websiteAuditLog.create() assim que o client for regenerado num
// ambiente com acesso à rede da Prisma.
async function insertWebsiteAuditLogRaw(row: {
  companyId: string;
  action: "property_published_owner_notified" | "property_published_owner_notification_skipped";
  entityType: string;
  entityId: string;
  metadataJson: Record<string, unknown>;
}) {
  const id = randomUUID();
  await prisma().$executeRaw`
    INSERT INTO website_audit_logs (id, company_id, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (${id}, ${row.companyId}, ${row.action}, ${row.entityType}, ${row.entityId}, ${JSON.stringify(row.metadataJson)}, NOW())
  `;
}

// Item 15 do escopo (2026-08-30): evento property.published -> notifica o
// proprietário via um WhatsAppProvider sintético (R$0, logado — nunca uma
// chamada real). Regras duras do escopo, todas aplicadas aqui:
//
//   1) Nunca hardcoded na rota de Property/Site — a rota (sites.ts,
//      POST /properties/:id/publish) só CHAMA emitPropertyPublishedEvent();
//      toda a lógica de quando/como notificar vive aqui, não lá.
//   2) Só notifica DEPOIS que a URL pública foi validada de verdade — não
//      "publishedAt != null", mas uma chamada real a
//      loadMysqlPublicPropertyByReference(), o MESMO código que a rota
//      pública (GET /public/sites/:slug/properties/:ref) usa. Se isso
//      lançar, não há notificação — silenciosamente registrado como
//      "skipped", nunca como erro que derruba a resposta de publish.
//   3) Nunca bloqueia a resposta HTTP de publish: qualquer erro aqui é
//      capturado e logado, nunca propagado.
//   4) Fica auditável (WebsiteAuditLog), mesmo sendo um envio sintético.

export async function emitPropertyPublishedEvent(companyId: string, propertyId: string) {
  try {
    const property = await prisma().property.findFirst({
      where: { id: propertyId, companyId },
      include: { owner: true },
    });
    if (!property) return { notified: false, reason: "PROPERTY_NOT_FOUND" as const };

    const site = await prisma().companySite.findFirst({
      where: { companyId, status: "published" },
    });
    if (!site) {
      await recordSkip(companyId, propertyId, "SITE_NOT_PUBLISHED");
      return { notified: false, reason: "SITE_NOT_PUBLISHED" as const };
    }

    // Validação real da URL pública: reusa o MESMO caminho de código que um
    // visitante real percorre. Se o imóvel não estiver de fato visível
    // (checklist incompleto, empresa suspensa, assinatura vencida etc.),
    // isto lança e cai no catch abaixo — nunca notifica com um link quebrado.
    await loadMysqlPublicPropertyByReference(
      { companyId: site.companyId, settingsJson: site.settingsJson },
      property.code || property.id,
    );

    const ownerPhone = property.owner?.whatsapp || property.owner?.phone;
    if (!ownerPhone) {
      await recordSkip(companyId, propertyId, "OWNER_WITHOUT_PHONE");
      return { notified: false, reason: "OWNER_WITHOUT_PHONE" as const };
    }

    const publicUrl = `${env.APP_URL}/site/${site.slug}`;
    const message = `Seu imóvel "${property.title}" (código ${property.code ?? property.id.slice(0, 8)}) já está publicado no site: ${publicUrl}`;

    const provider = getWhatsAppProvider();
    const sent = await provider.sendMessage({
      companyId,
      toPhone: ownerPhone,
      toName: property.owner?.name ?? null,
      message,
      relatedEntityType: "properties",
      relatedEntityId: propertyId,
      metadata: { event: "property.published", public_url: publicUrl },
    });

    await insertWebsiteAuditLogRaw({
      companyId,
      action: "property_published_owner_notified",
      entityType: "properties",
      entityId: propertyId,
      metadataJson: {
        provider: sent.provider,
        provider_message_id: sent.providerMessageId,
        status: sent.status,
        public_url: publicUrl,
      },
    });

    return { notified: true as const, provider: sent.provider };
  } catch (error) {
    console.error("[property.published] Falha ao notificar proprietário (não bloqueia a publicação).", error);
    await recordSkip(companyId, propertyId, "VALIDATION_OR_SEND_FAILED").catch(() => undefined);
    return { notified: false, reason: "ERROR" as const };
  }
}

async function recordSkip(companyId: string, propertyId: string, reason: string) {
  await insertWebsiteAuditLogRaw({
    companyId,
    action: "property_published_owner_notification_skipped",
    entityType: "properties",
    entityId: propertyId,
    metadataJson: { reason },
  });
}

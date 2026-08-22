import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { ensureDefaultCrmPipeline } from "./crm-bootstrap.js";

export type LeadIntakeInput = {
  companyId: string;
  source: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  propertyId?: string | null;
  sourceUrl?: string | null;
  provider?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  receivedAt?: Date;
  siteId?: string | null;
};

export function normalizeLeadEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function normalizeLeadPhone(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

async function routeNewLead(tx: Prisma.TransactionClient, companyId: string) {
  // Compare-and-swap makes the persisted cursor the coordinator across Render restarts.
  // TiDB/MySQL execute updateMany atomically; a failed CAS retries with the newer cursor.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const config = await tx.crmRoutingConfig.findUnique({ where: { companyId }, select: { mode: true, lastAssignedUserId: true } });
    if (!config || config.mode !== "round_robin") return { userId: null, mode: "manual" as const };
    const members = await tx.crmRoutingMember.findMany({
      where: { companyId, active: true, user: { companyId, status: "active" } }, orderBy: { position: "asc" },
      select: { userId: true, user: { select: { roleRecord: { select: { companyId: true, permissions: { select: { permission: { select: { key: true } } } } } } } } },
    });
    const eligible = members.filter((member) => member.user.roleRecord.companyId === companyId && member.user.roleRecord.permissions.some(({ permission }) => permission.key === "crm.view" || permission.key === "crm.manage"));
    if (!eligible.length) return { userId: null, mode: "round_robin" as const };
    const previous = eligible.findIndex((member) => member.userId === config.lastAssignedUserId);
    const selected = eligible[(previous + 1 + eligible.length) % eligible.length];
    const claimed = await tx.crmRoutingConfig.updateMany({ where: { companyId, lastAssignedUserId: config.lastAssignedUserId }, data: { lastAssignedUserId: selected.userId } });
    if (claimed.count === 1) return { userId: selected.userId, mode: "round_robin" as const };
  }
  throw Object.assign(new Error("Não foi possível coordenar a distribuição do lead."), { statusCode: 409, code: "ROUTING_CONFLICT" });
}

export async function ingestLead(input: LeadIntakeInput) {
  const prisma = getPrisma();
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;
  const emailNormalized = normalizeLeadEmail(email);
  const phoneNormalized = normalizeLeadPhone(phone);
  const metadata = {
    channel: input.source,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.siteId ? { site_id: input.siteId } : {}),
    ...(input.propertyId ? { property_id: input.propertyId } : {}),
    ...(input.metadata ?? {}),
    received_at: (input.receivedAt ?? new Date()).toISOString(),
  } satisfies Prisma.InputJsonValue;

  return prisma.$transaction(async (tx) => {
    let property: { id: string; code: string | null; title: string; operation: string; status: string; publishedAt: Date | null } | null = null;
    if (input.propertyId) {
      property = await tx.property.findFirst({
        where: { id: input.propertyId, companyId: input.companyId },
        select: { id: true, code: true, title: true, operation: true, status: true, publishedAt: true },
      });
      if (!property || !property.publishedAt || !["available", "reserved"].includes(property.status)) {
        throw Object.assign(new Error("Imóvel indisponível."), { statusCode: 404, code: "PUBLIC_PROPERTY_NOT_FOUND" });
      }
    }

    const existing = emailNormalized || phoneNormalized
      ? await tx.lead.findFirst({
          where: {
            companyId: input.companyId,
            status: "open",
            OR: [
              ...(emailNormalized ? [{ emailNormalized }] : []),
              ...(phoneNormalized ? [{ phoneNormalized }] : []),
            ],
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : null;

    let lead = existing;
    let created = false;
    if (!lead) {
      const pipeline = await ensureDefaultCrmPipeline(input.companyId, null, tx);
      const stageId = pipeline.stages[0]?.id ?? null;
      const routing = await routeNewLead(tx, input.companyId);
      lead = await tx.lead.create({
        data: {
          companyId: input.companyId,
          stageId,
          assignedTo: routing.userId,
          name: input.name.trim(),
          email,
          emailNormalized,
          phone,
          phoneNormalized,
          source: input.source,
          interestType: "not_defined",
          propertyReference: property?.code ?? property?.title ?? null,
          notes: input.message?.trim() || null,
          status: "open",
        },
      });
      created = true;
      await tx.leadEvent.create({
        data: {
          companyId: input.companyId,
          leadId: lead.id,
          eventType: "lead.created",
          payloadJson: { source: input.source, stage_id: stageId } as Prisma.InputJsonValue,
        },
      });
      if (routing.userId) {
        await tx.leadEvent.create({ data: { companyId: input.companyId, leadId: lead.id, eventType: "lead.assigned", payloadJson: { assigned_to: routing.userId, assignment_mode: routing.mode } as Prisma.InputJsonValue } });
      }
    }

    const siteLead = await tx.siteLead.create({
      data: {
        companyId: input.companyId,
        siteId: input.siteId ?? null,
        propertyId: property?.id ?? input.propertyId ?? null,
        leadId: lead.id,
        name: input.name.trim(),
        email,
        phone,
        message: input.message?.trim() || null,
        sourceUrl: input.sourceUrl ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata,
      },
    });
    await tx.leadEvent.create({
      data: {
        companyId: input.companyId,
        leadId: lead.id,
        eventType: "lead.received",
        payloadJson: { source: input.source, property_id: property?.id ?? input.propertyId ?? null, site_id: input.siteId ?? null, provider: input.provider ?? null, received_at: (input.receivedAt ?? new Date()).toISOString() } as Prisma.InputJsonValue,
      },
    });
    return { lead, siteLead, created, matchedExisting: Boolean(existing) };
  });
}

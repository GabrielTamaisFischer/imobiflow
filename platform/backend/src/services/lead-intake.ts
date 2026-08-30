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

// A5 (corrigido — TD-GLOBAL-008): a checagem anterior ("existe lead aberto
// com este e-mail/telefone?") era um SELECT comum seguido de um INSERT
// condicional, tudo dentro de uma transação Prisma — mas isso NÃO impede
// duas transações concorrentes de, ambas, verem "nenhum lead aberto" antes
// de qualquer uma commitar, e ambas criarem um lead duplicado (o clássico
// race de "check-then-act"). A correção usa SELECT ... FOR UPDATE via SQL
// bruto contra os índices já existentes (@@index([companyId, emailNormalized,
// status]) / phoneNormalized): no InnoDB/MySQL, uma leitura de bloqueio sobre
// um predicado indexado toma um lock de linha (se existir) OU de "gap" (se
// não existir), bloqueando qualquer segunda transação concorrente que tente
// inserir na mesma lacuna até a primeira commitar/reverter. É proteção real
// de banco, não uma checagem apenas na aplicação.
async function lockExistingOpenLead(
  tx: Prisma.TransactionClient,
  companyId: string,
  emailNormalized: string | null,
  phoneNormalized: string | null,
): Promise<{ id: string } | null> {
  if (emailNormalized) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM leads
      WHERE company_id = ${companyId} AND email_normalized = ${emailNormalized} AND status = 'open'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE
    `;
    if (rows[0]) return rows[0];
  }
  if (phoneNormalized) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM leads
      WHERE company_id = ${companyId} AND phone_normalized = ${phoneNormalized} AND status = 'open'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE
    `;
    if (rows[0]) return rows[0];
  }
  return null;
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

function isTransientDbConflict(error: unknown): boolean {
  // Achado durante a homologação da Fase A (A5): sob concorrência real (N
  // submissões simultâneas do mesmo lead para uma empresa nova), múltiplas
  // transações podem colidir tentando bootstrap do funil padrão de CRM
  // (ensureDefaultCrmPipeline) ou do lock de dedupe de lead ao mesmo tempo.
  // Isso é relatado pelo MySQL como deadlock/conflito de escrita — não como
  // dado duplicado (o commit da transação perdedora nunca ocorre, então
  // nenhuma duplicidade é criada). É uma condição transitória e esperada
  // sob alta concorrência real; a resposta correta é reexecutar a transação
  // inteira do zero, não propagar um 500 para quem enviou o lead.
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034" || error.code === "P2002") return true;
  // P2010 = "raw query failed" — o código genérico do Prisma para qualquer
  // erro do driver em $queryRaw (usado no lock FOR UPDATE do funil padrão e
  // no lock FOR UPDATE de dedupe de lead). Aqui o MySQL devolve o erro 1213
  // (deadlock) ou 1205 (lock wait timeout) dentro da mensagem — ambos são a
  // mesma condição transitória de concorrência, não um bug de dado.
  if (error.code === "P2010" && /deadlock|lock wait timeout/i.test(error.message)) return true;
  return false;
}

async function runLeadIntakeTransaction<T>(
  prisma: ReturnType<typeof getPrisma>,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(fn);
    } catch (error) {
      if (!isTransientDbConflict(error) || attempt === maxAttempts) throw error;
      // Pequeno atraso aleatório para reduzir a chance de as transações
      // que colidiram tentarem de novo exatamente ao mesmo tempo.
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40));
    }
  }
  throw new Error("unreachable");
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

  return runLeadIntakeTransaction(prisma, async (tx) => {
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

    const lockedLead = emailNormalized || phoneNormalized
      ? await lockExistingOpenLead(tx, input.companyId, emailNormalized, phoneNormalized)
      : null;
    const existing = lockedLead ? await tx.lead.findUnique({ where: { id: lockedLead.id } }) : null;

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

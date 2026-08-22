import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";
import {
  assertPasswordPolicy,
  authError,
  buildMysqlAccessContextForUser,
  createSession,
  hashOpaqueToken,
  hashPassword,
} from "./mysql-auth.js";
import { ensureDefaultCompanyRoles } from "./roles.js";

type ActivationDatabase = PrismaClient | Prisma.TransactionClient;

export async function validateAccountActivation(
  rawToken: string,
  database: ActivationDatabase = getPrisma(),
) {
  const provisioning = await database.accountProvisioning.findUnique({
    where: { tokenHash: hashOpaqueToken(rawToken) },
    include: {
      plan: { select: { slug: true, name: true } },
      checkoutSession: {
        select: {
          status: true,
          confirmedAt: true,
          paymentEvents: { where: { status: "VERIFIED" }, select: { id: true }, take: 1 },
        },
      },
    },
  });
  assertProvisioningCanActivate(provisioning);
  return {
    email: provisioning.purchaserEmail,
    plan: provisioning.plan,
    expires_at: provisioning.expiresAt.toISOString(),
    synthetic: provisioning.isSynthetic,
  };
}

export async function activatePaidAccount(
  input: {
    token: string;
    ownerName: string;
    password: string;
    companyName: string;
    companyDocument?: string;
    phone?: string;
  },
  metadata: { ipAddress?: string | null; userAgent?: string | null } = {},
  database: PrismaClient = getPrisma(),
) {
  assertPasswordPolicy(input.password);
  const tokenHash = hashOpaqueToken(input.token);
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const activated = await database.$transaction(
    async (transaction) => {
      const provisioning = await transaction.accountProvisioning.findUnique({
        where: { tokenHash },
        include: {
          plan: true,
          checkoutSession: {
            include: { paymentEvents: { where: { status: "VERIFIED" }, take: 1 } },
          },
        },
      });
      assertProvisioningCanActivate(provisioning, now);

      const claimed = await transaction.accountProvisioning.updateMany({
        where: {
          id: provisioning.id,
          tokenHash,
          status: "READY",
          activatedAt: null,
          expiresAt: { gt: now },
          companyId: null,
          ownerUserId: null,
          subscriptionId: null,
        },
        data: { status: "ACTIVATING" },
      });
      if (claimed.count !== 1) {
        throw authError("ACTIVATION_TOKEN_USED", "Este link de ativacao ja foi utilizado.", 409);
      }

      const existingUser = await transaction.appUser.findUnique({
        where: { email: provisioning.purchaserEmail },
        select: { id: true },
      });
      if (existingUser) {
        throw authError("ACTIVATION_EMAIL_IN_USE", "O e-mail da compra ja possui uma conta.", 409);
      }

      const syntheticPrefix = provisioning.isSynthetic ? "[SYNTHETIC] " : "";
      const company = await transaction.company.create({
        data: {
          name: `${syntheticPrefix}${input.companyName}`.slice(0, 160),
          document: input.companyDocument || null,
          phone: input.phone || null,
          email: provisioning.purchaserEmail,
          status: "active",
          isSynthetic: provisioning.isSynthetic,
        },
      });
      await ensureDefaultCompanyRoles(company.id, transaction);
      const ownerRole = await transaction.role.findFirstOrThrow({
        where: { companyId: company.id, systemKey: "owner" },
      });
      const owner = await transaction.appUser.create({
        data: {
          companyId: company.id,
          roleId: ownerRole.id,
          name: `${syntheticPrefix}${input.ownerName}`.slice(0, 160),
          email: provisioning.purchaserEmail,
          phone: input.phone || null,
          passwordHash,
          passwordChangedAt: now,
          status: "active",
          isSynthetic: provisioning.isSynthetic,
          role: "owner",
          permissionsJson: [],
        },
      });
      const currentPeriodEnd = subscriptionPeriodEnd(now, provisioning.plan.billingInterval);
      const subscription = await transaction.subscription.create({
        data: {
          companyId: company.id,
          planId: provisioning.planId,
          status: "ACTIVE",
          planSlug: provisioning.plan.slug,
          billingProvider: provisioning.checkoutSession.provider,
          externalSubscriptionId: provisioning.checkoutSession.externalSubscriptionId,
          currentPeriodStart: now,
          currentPeriodEnd,
          expiresAt: currentPeriodEnd,
          isSynthetic: provisioning.isSynthetic,
        },
      });
      await transaction.accountProvisioning.update({
        where: { id: provisioning.id },
        data: {
          status: "ACTIVATED",
          activatedAt: now,
          companyId: company.id,
          ownerUserId: owner.id,
          subscriptionId: subscription.id,
        },
      });
      await transaction.authAuditLog.create({
        data: {
          companyId: company.id,
          actorUserId: owner.id,
          action: "auth.account_activated",
          entityType: "account_provisionings",
          entityId: provisioning.id,
          metadataJson: {
            plan_slug: provisioning.plan.slug,
            billing_provider: provisioning.checkoutSession.provider,
            synthetic: provisioning.isSynthetic,
          },
        },
      });
      return { company, owner, subscription, plan: provisioning.plan };
    },
    { maxWait: 5_000, timeout: 20_000 },
  );

  const session = await createSession(activated.owner.id, activated.company.id, metadata, database);
  return {
    message: "Conta ativada com sucesso.",
    company: {
      id: activated.company.id,
      name: activated.company.name,
      status: activated.company.status,
      synthetic: activated.company.isSynthetic,
    },
    owner: {
      id: activated.owner.id,
      name: activated.owner.name,
      email: activated.owner.email,
      role: "owner",
    },
    subscription: {
      id: activated.subscription.id,
      status: activated.subscription.status,
      plan_slug: activated.plan.slug,
      synthetic: activated.subscription.isSynthetic,
    },
    session: session.publicSession,
    access: await buildMysqlAccessContextForUser(
      activated.owner.id,
      activated.company.id,
      database,
    ),
  };
}

function assertProvisioningCanActivate(
  provisioning: {
    status: string;
    expiresAt: Date;
    activatedAt: Date | null;
    companyId: string | null;
    ownerUserId: string | null;
    subscriptionId: string | null;
    purchaserEmail: string;
    isSynthetic: boolean;
    plan: unknown;
    checkoutSession: {
      status: string;
      confirmedAt: Date | null;
      paymentEvents: Array<{ id: string }>;
    };
  } | null,
  now = new Date(),
): asserts provisioning is NonNullable<typeof provisioning> {
  if (!provisioning) throw authError("ACTIVATION_TOKEN_INVALID", "Link de ativacao invalido.", 404);
  if (provisioning.expiresAt.getTime() <= now.getTime()) {
    throw authError("ACTIVATION_TOKEN_EXPIRED", "Link de ativacao expirado.", 410);
  }
  if (
    provisioning.status !== "READY" ||
    provisioning.activatedAt ||
    provisioning.companyId ||
    provisioning.ownerUserId ||
    provisioning.subscriptionId
  ) {
    throw authError("ACTIVATION_TOKEN_USED", "Este link de ativacao ja foi utilizado.", 409);
  }
  if (
    provisioning.checkoutSession.status !== "PAYMENT_CONFIRMED" ||
    !provisioning.checkoutSession.confirmedAt ||
    provisioning.checkoutSession.paymentEvents.length === 0
  ) {
    throw authError("PAYMENT_NOT_CONFIRMED", "Pagamento ainda nao confirmado.", 403);
  }
}

function subscriptionPeriodEnd(start: Date, interval: string) {
  const result = new Date(start);
  result.setUTCMonth(result.getUTCMonth() + (interval === "quarterly" ? 3 : 1));
  return result;
}

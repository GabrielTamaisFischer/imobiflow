import type { Prisma, PrismaClient } from "@prisma/client";
import { env, isFreeRegistrationEnabled } from "../config/env.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import {
  assertPasswordPolicy,
  authError,
  buildMysqlAccessContextForUser,
  createSession,
  hashOpaqueToken,
  hashPassword,
  normalizeEmail,
} from "./mysql-auth.js";
import { ensureDefaultCompanyRoles } from "./roles.js";

const FREE_REGISTRATION_PLAN_SLUG = "staging-free-registration";

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

/**
 * Cadastro aberto (sem cobranca) — Diretriz Mestre do MVP, Secoes 3 e 52/54.
 *
 * SOMENTE valido quando isFreeRegistrationEnabled() retorna true (nunca em producao,
 * mesmo que as flags estejam mal configuradas — ver config/env.ts). Reaproveita
 * exatamente o mesmo pipeline de criacao de Company/Role/AppUser/Subscription/Session
 * que activatePaidAccount(), sem exigir AccountProvisioning/CheckoutSession/pagamento.
 * Nao remove nem contorna o fluxo comercial de producao: activatePaidAccount() continua
 * intocado e e o unico caminho valido quando billing e obrigatorio.
 */
export async function registerFreeAccount(
  input: {
    email: string;
    ownerName: string;
    password: string;
    companyName: string;
    companyDocument?: string;
    phone?: string;
  },
  metadata: { ipAddress?: string | null; userAgent?: string | null } = {},
  database: PrismaClient = getPrisma(),
) {
  if (!isFreeRegistrationEnabled()) {
    throw authError(
      "PAID_ACTIVATION_REQUIRED",
      "Para criar sua conta ImobiFlow, escolha um plano.",
      403,
    );
  }
  assertPasswordPolicy(input.password);
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  const created = await database.$transaction(
    async (transaction) => {
      const existingUser = await transaction.appUser.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        throw authError("REGISTRATION_EMAIL_IN_USE", "Este e-mail ja possui uma conta.", 409);
      }

      const company = await transaction.company.create({
        data: {
          name: input.companyName.slice(0, 160),
          document: input.companyDocument || null,
          phone: input.phone || null,
          email,
          status: "active",
          isSynthetic: false,
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
          name: input.ownerName.slice(0, 160),
          email,
          phone: input.phone || null,
          passwordHash,
          passwordChangedAt: now,
          status: "active",
          isSynthetic: false,
          role: "owner",
          permissionsJson: [],
        },
      });
      const plan = await transaction.plan.upsert({
        where: { slug: FREE_REGISTRATION_PLAN_SLUG },
        update: { active: true },
        create: {
          slug: FREE_REGISTRATION_PLAN_SLUG,
          name: "Cadastro aberto (desenvolvimento/staging)",
          description:
            "Conta criada via cadastro aberto em ambiente de desenvolvimento/staging, sem cobranca. Nunca disponivel em producao (ver isFreeRegistrationEnabled).",
          billingInterval: "monthly",
          priceCents: 0,
          currency: "BRL",
          active: true,
          isSynthetic: false,
          featuresJson: ["staging-free-registration"],
        },
      });
      const currentPeriodEnd = subscriptionPeriodEnd(now, plan.billingInterval);
      const subscription = await transaction.subscription.create({
        data: {
          companyId: company.id,
          planId: plan.id,
          status: "ACTIVE",
          planSlug: plan.slug,
          billingProvider: FREE_REGISTRATION_PLAN_SLUG,
          externalSubscriptionId: `free-registration-${company.id}`,
          currentPeriodStart: now,
          currentPeriodEnd,
          expiresAt: currentPeriodEnd,
          isSynthetic: false,
        },
      });
      await transaction.authAuditLog.create({
        data: {
          companyId: company.id,
          actorUserId: owner.id,
          action: "auth.free_registration",
          entityType: "companies",
          entityId: company.id,
          metadataJson: {
            environment: env.NODE_ENV,
            plan_slug: plan.slug,
          },
        },
      });
      return { company, owner, subscription, plan };
    },
    { maxWait: 5_000, timeout: 20_000 },
  );

  const session = await createSession(created.owner.id, created.company.id, metadata, database);
  return {
    message: "Conta criada com sucesso.",
    company: {
      id: created.company.id,
      name: created.company.name,
      status: created.company.status,
    },
    owner: {
      id: created.owner.id,
      name: created.owner.name,
      email: created.owner.email,
      role: "owner",
    },
    subscription: {
      id: created.subscription.id,
      status: created.subscription.status,
      plan_slug: created.plan.slug,
    },
    session: session.publicSession,
    access: await buildMysqlAccessContextForUser(created.owner.id, created.company.id, database),
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

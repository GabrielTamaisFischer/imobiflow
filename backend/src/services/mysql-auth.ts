import { createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import type { AccessContext, SubscriptionStatus } from "../types/access.js";

const tokenPrefix = "imobiflow.mysql.";
const defaultPermissions = [
  "site.manage",
  "properties.view",
  "properties.manage",
  "owners.view",
  "owners.manage",
  "crm.view",
  "crm.manage",
  "appointments.view",
  "appointments.manage",
  "users.manage",
];

export function isMysqlAuthEnabled() {
  return env.IMOBIFLOW_AUTH_PROVIDER === "mysql" || env.IMOBIFLOW_MYSQL_AUTH === "true";
}

export async function loginWithMysqlBootstrap(email: string, password: string) {
  if (!isMysqlAuthEnabled()) return null;

  const bootstrapEmail = env.IMOBIFLOW_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = env.IMOBIFLOW_BOOTSTRAP_PASSWORD;

  if (!bootstrapEmail || !bootstrapPassword || email.trim().toLowerCase() !== bootstrapEmail) {
    return null;
  }

  if (!safeEqual(password, bootstrapPassword)) return null;

  const context = await ensureBootstrapAccess(bootstrapEmail);
  const token = signMysqlToken({
    userId: context.appUser.id,
    companyId: context.company.id,
    email: context.appUser.email,
  });

  return {
    session: {
      access_token: token,
      refresh_token: token,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    },
    access: context,
  };
}

export async function buildMysqlAccessContextFromToken(token: string | null): Promise<AccessContext | null> {
  if (!isMysqlAuthEnabled() || !token?.startsWith(tokenPrefix)) return null;

  const payload = verifyMysqlToken(token);
  if (!payload) return null;

  const prisma = getPrisma();
  const user = await prisma.appUser.findFirst({
    where: {
      id: payload.userId,
      companyId: payload.companyId,
      status: "active",
    },
    include: {
      company: true,
    },
  });

  if (!user || user.company.status !== "active") return null;

  const subscription = await prisma.subscription.findFirst({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
  });

  return accessContextFromRows({
    user,
    company: user.company,
    subscription,
  });
}

async function ensureBootstrapAccess(email: string): Promise<AccessContext> {
  const prisma = getPrisma();
  const companyName = env.IMOBIFLOW_BOOTSTRAP_COMPANY_NAME || "ImobiFlow";

  let user = await prisma.appUser.findFirst({
    where: { email },
    include: { company: true },
  });

  if (!user) {
    const company = await prisma.company.create({
      data: {
        name: companyName,
        email,
        status: "active",
        subscriptions: {
          create: {
            status: "active",
            planSlug: "bootstrap",
          },
        },
        users: {
          create: {
            name: "Administrador ImobiFlow",
            email,
            role: "owner",
            status: "active",
            permissionsJson: defaultPermissions,
          },
        },
      },
      include: {
        users: true,
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    user = await prisma.appUser.findUniqueOrThrow({
      where: { id: company.users[0]!.id },
      include: { company: true },
    });
  }

  const subscription =
    (await prisma.subscription.findFirst({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.subscription.create({
      data: {
        companyId: user.companyId,
        status: "active",
        planSlug: "bootstrap",
      },
    }));

  return accessContextFromRows({
    user,
    company: user.company,
    subscription,
  });
}

function accessContextFromRows(params: {
  user: {
    id: string;
    companyId: string;
    name: string;
    email: string;
    status: string;
    role: string;
    permissionsJson: unknown;
  };
  company: { id: string; name: string; status: string };
  subscription: { id: string; status: string; planSlug: string | null; expiresAt: Date | null } | null;
}): AccessContext {
  const permissions = Array.isArray(params.user.permissionsJson)
    ? params.user.permissionsJson.filter((item): item is string => typeof item === "string")
    : defaultPermissions;

  return {
    authUser: {
      id: params.user.id,
      email: params.user.email,
      app_metadata: {},
      user_metadata: { name: params.user.name },
      aud: "authenticated",
      created_at: new Date(0).toISOString(),
    } as User,
    appUser: {
      id: params.user.id,
      company_id: params.user.companyId,
      name: params.user.name,
      email: params.user.email,
      status: params.user.status,
      role: params.user.role,
      permissions,
    },
    company: params.company,
    subscription: params.subscription
      ? {
          id: params.subscription.id,
          status: params.subscription.status as SubscriptionStatus,
          plan_slug: params.subscription.planSlug,
          expires_at: params.subscription.expiresAt?.toISOString() ?? null,
        }
      : null,
  };
}

function signMysqlToken(payload: { userId: string; companyId: string; email: string }) {
  const body = base64Url(JSON.stringify({ ...payload, iat: Date.now() }));
  const signature = hmac(body);
  return `${tokenPrefix}${body}.${signature}`;
}

function verifyMysqlToken(token: string) {
  const raw = token.slice(tokenPrefix.length);
  const [body, signature] = raw.split(".");
  if (!body || !signature || hmac(body) !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      userId?: string;
      companyId?: string;
      email?: string;
    };
    if (!payload.userId || !payload.companyId || !payload.email) return null;
    return payload as { userId: string; companyId: string; email: string };
  } catch {
    return null;
  }
}

function hmac(value: string) {
  const secret = env.JWT_SECRET || env.IMOBIFLOW_BOOTSTRAP_PASSWORD || "imobiflow-local-secret";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

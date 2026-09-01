import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import type { AccessContext, SubscriptionStatus } from "../types/access.js";

const jwtIssuer = "imobiflow-api";
const jwtAudience = "imobiflow-platform";
const accessLifetimeSeconds = 15 * 60;
const refreshLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1000;
const maxFailedLogins = 5;
const lockDurationMilliseconds = 15 * 60 * 1000;
const dummyPasswordHash =
  "scrypt$v1$BwcHBwcHBwcHBwcHBwcHBw$5Vja6mOHpm7YQWFCfHSACROk9kngKXocnBJlmae6xAkEAMTetIMGaDAvL9p_FFY0IKMf0aizZMUhkBnOLsI2wg";

type AuthDatabase = PrismaClient | Prisma.TransactionClient;

type AccessClaims = {
  iss: string;
  aud: string;
  sub: string;
  company_id: string;
  sid: string;
  jti: string;
  type: "access";
  iat: number;
  exp: number;
};

type SessionMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function isMysqlAuthEnabled() {
  return true;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function hashPassword(password: string) {
  assertPasswordPolicy(password);
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt, 64);
  return `scrypt$v1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [algorithm, version, encodedSalt, encodedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || version !== "v1" || !encodedSalt || !encodedHash) return false;

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expected = Buffer.from(encodedHash, "base64url");
    const actual = await derivePassword(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function assertPasswordPolicy(password: string) {
  if (
    password.length < 12 ||
    password.length > 128 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw authError(
      "WEAK_PASSWORD",
      "A senha deve ter entre 12 e 128 caracteres e incluir maiuscula, minuscula, numero e simbolo.",
      400,
    );
  }
}

export async function loginWithMysql(
  email: string,
  password: string,
  metadata: SessionMetadata = {},
  database: AuthDatabase = getPrisma(),
) {
  const normalizedEmail = normalizeEmail(email);
  const user = await database.appUser.findUnique({
    where: { email: normalizedEmail },
    include: {
      company: true,
      roleRecord: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  });

  if (!user) {
    await verifyPassword(password, dummyPasswordHash);
    throw invalidCredentials();
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw authError(
      "ACCOUNT_TEMPORARILY_LOCKED",
      "Conta temporariamente bloqueada. Tente novamente mais tarde.",
      423,
    );
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    const failedLoginAttempts = user.failedLoginAttempts + 1;
    await database.appUser.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts,
        lockedUntil:
          failedLoginAttempts >= maxFailedLogins
            ? new Date(Date.now() + lockDurationMilliseconds)
            : null,
      },
    });
    await writeAuthAudit(database, user.companyId, user.id, "auth.login_failed", "users", user.id, {
      failed_attempts: failedLoginAttempts,
    });
    throw invalidCredentials();
  }

  if (user.status !== "active") throw authError("USER_INACTIVE", "Usuario interno inativo.", 403);
  if (user.company.status !== "active")
    throw authError("COMPANY_INACTIVE", "Empresa inativa.", 403);
  if (user.roleRecord.companyId !== user.companyId) {
    throw authError("INVALID_ROLE_LINK", "Vinculo de papel invalido.", 403);
  }

  await database.appUser.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  const session = await createSession(user.id, user.companyId, metadata, database);
  await writeAuthAudit(
    database,
    user.companyId,
    user.id,
    "auth.login_succeeded",
    "auth_sessions",
    session.sessionId,
    {},
  );

  return {
    session: session.publicSession,
    access: await buildMysqlAccessContextForUser(user.id, user.companyId, database),
  };
}

export async function createSession(
  userId: string,
  companyId: string,
  metadata: SessionMetadata = {},
  database: AuthDatabase = getPrisma(),
) {
  const sessionId = randomUUID();
  const accessTokenJti = randomUUID();
  const refreshToken = `${sessionId}.${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + refreshLifetimeMilliseconds);

  await database.authSession.create({
    data: {
      id: sessionId,
      companyId,
      userId,
      accessTokenJti,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt,
      ipAddress: metadata.ipAddress?.slice(0, 80) || null,
      userAgent: metadata.userAgent?.slice(0, 300) || null,
    },
  });

  return {
    sessionId,
    publicSession: buildPublicSession({
      userId,
      companyId,
      sessionId,
      accessTokenJti,
      refreshToken,
      expiresAt,
    }),
  };
}

export async function refreshMysqlSession(
  refreshToken: string,
  metadata: SessionMetadata = {},
  database: AuthDatabase = getPrisma(),
) {
  const sessionId = readOpaqueSessionId(refreshToken);
  if (!sessionId) throw invalidSession();

  const session = await database.authSession.findFirst({
    where: {
      id: sessionId,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: { include: { company: true, roleRecord: true } } },
  });
  if (
    !session ||
    session.userId !== session.user.id ||
    session.companyId !== session.user.companyId
  ) {
    throw invalidSession();
  }
  if (
    session.user.status !== "active" ||
    session.user.company.status !== "active" ||
    session.user.roleRecord.companyId !== session.companyId
  ) {
    await database.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw invalidSession();
  }

  const accessTokenJti = randomUUID();
  const nextRefreshToken = `${session.id}.${randomBytes(32).toString("base64url")}`;
  const rotated = await database.authSession.updateMany({
    where: {
      id: session.id,
      refreshTokenHash: session.refreshTokenHash,
      accessTokenJti: session.accessTokenJti,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: {
      accessTokenJti,
      refreshTokenHash: hashOpaqueToken(nextRefreshToken),
      lastUsedAt: new Date(),
      ipAddress: metadata.ipAddress?.slice(0, 80) || session.ipAddress,
      userAgent: metadata.userAgent?.slice(0, 300) || session.userAgent,
    },
  });
  if (rotated.count !== 1) throw invalidSession();

  return {
    session: buildPublicSession({
      userId: session.userId,
      companyId: session.companyId,
      sessionId: session.id,
      accessTokenJti,
      refreshToken: nextRefreshToken,
      expiresAt: session.expiresAt,
    }),
    access: await buildMysqlAccessContextForUser(session.userId, session.companyId, database),
  };
}

export async function revokeMysqlSession(
  sessionId: string,
  userId: string,
  companyId: string,
  database: AuthDatabase = getPrisma(),
) {
  const result = await database.authSession.updateMany({
    where: { id: sessionId, userId, companyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count) {
    await writeAuthAudit(
      database,
      companyId,
      userId,
      "auth.logout",
      "auth_sessions",
      sessionId,
      {},
    );
  }
}

export async function revokeAllUserSessions(
  userId: string,
  companyId: string,
  database: AuthDatabase = getPrisma(),
) {
  await database.authSession.updateMany({
    where: { userId, companyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function buildMysqlAccessContextFromToken(
  token: string | null,
  database: AuthDatabase = getPrisma(),
): Promise<(AccessContext & { sessionId: string }) | null> {
  if (!token) return null;
  const claims = verifyAccessToken(token);
  if (!claims) return null;

  const session = await database.authSession.findFirst({
    where: {
      id: claims.sid,
      userId: claims.sub,
      companyId: claims.company_id,
      accessTokenJti: claims.jti,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!session) return null;

  try {
    return {
      ...(await buildMysqlAccessContextForUser(claims.sub, claims.company_id, database)),
      sessionId: claims.sid,
    };
  } catch {
    return null;
  }
}

export async function buildMysqlAccessContextForUser(
  userId: string,
  companyId: string,
  database: AuthDatabase = getPrisma(),
): Promise<AccessContext> {
  const user = await database.appUser.findFirst({
    where: { id: userId, companyId, status: "active" },
    include: {
      company: true,
      roleRecord: { include: { permissions: { include: { permission: true } } } },
    },
  });
  if (!user)
    throw authError(
      "INTERNAL_USER_REQUIRED",
      "Usuario interno ativo e vinculado a empresa e obrigatorio.",
      403,
    );
  if (user.status !== "active") throw authError("USER_INACTIVE", "Usuario interno inativo.", 403);
  if (user.company.status !== "active")
    throw authError("COMPANY_INACTIVE", "Empresa inativa.", 403);
  if (user.roleRecord.companyId !== companyId)
    throw authError("INVALID_ROLE_LINK", "Vinculo de papel invalido.", 403);

  const subscription = await database.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });
  const permissions = user.roleRecord.permissions.map(({ permission }) => permission.key);
  const permissionScopes = Object.fromEntries(
    user.roleRecord.permissions.map(({ permission, scope }) => [
      permission.key,
      scope === "own" || scope === "shared" || scope === "company" ? scope : "own",
    ]),
  );
  const role = user.roleRecord.systemKey ?? user.roleRecord.name;

  return {
    authUser: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    appUser: {
      id: user.id,
      company_id: companyId,
      name: user.name,
      email: user.email,
      status: user.status,
      role,
      permissions,
      permissionScopes,
    },
    company: { id: user.company.id, name: user.company.name, status: user.company.status },
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status as SubscriptionStatus,
          plan_slug: subscription.planSlug,
          expires_at: subscription.expiresAt?.toISOString() ?? null,
          grace_ends_at: subscription.graceEndsAt?.toISOString() ?? null,
        }
      : null,
  };
}

export function verifyAccessToken(token: string): AccessClaims | null {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) return null;
  const signedValue = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac("sha256", getJwtSecret())
    .update(signedValue)
    .digest("base64url");
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const claims = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<AccessClaims>;
    const now = Math.floor(Date.now() / 1000);
    if (
      header.alg !== "HS256" ||
      header.typ !== "JWT" ||
      claims.iss !== jwtIssuer ||
      claims.aud !== jwtAudience ||
      claims.type !== "access" ||
      typeof claims.sub !== "string" ||
      typeof claims.company_id !== "string" ||
      typeof claims.sid !== "string" ||
      typeof claims.jti !== "string" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number" ||
      claims.iat > now + 60 ||
      claims.exp <= now
    ) {
      return null;
    }
    return claims as AccessClaims;
  } catch {
    return null;
  }
}

export async function writeAuthAudit(
  database: AuthDatabase,
  companyId: string,
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Prisma.InputJsonValue,
) {
  await database.authAuditLog.create({
    data: { companyId, actorUserId, action, entityType, entityId, metadataJson: metadata },
  });
}

export function authError(code: string, message: string, statusCode: number) {
  return Object.assign(new Error(message), { code, statusCode });
}

function invalidCredentials() {
  return authError("INVALID_CREDENTIALS", "E-mail ou senha invalidos.", 401);
}

function invalidSession() {
  return authError("INVALID_SESSION", "Sessao invalida ou expirada.", 401);
}

function buildPublicSession(params: {
  userId: string;
  companyId: string;
  sessionId: string;
  accessTokenJti: string;
  refreshToken: string;
  expiresAt: Date;
}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: signAccessToken({
      iss: jwtIssuer,
      aud: jwtAudience,
      sub: params.userId,
      company_id: params.companyId,
      sid: params.sessionId,
      jti: params.accessTokenJti,
      type: "access",
      iat: now,
      exp: now + accessLifetimeSeconds,
    }),
    refresh_token: params.refreshToken,
    expires_at: now + accessLifetimeSeconds,
    refresh_expires_at: Math.floor(params.expiresAt.getTime() / 1000),
  };
}

function signAccessToken(claims: AccessClaims) {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8").toString(
    "base64url",
  );
  const encodedPayload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signedValue = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", getJwtSecret()).update(signedValue).digest("base64url");
  return `${signedValue}.${signature}`;
}

function getJwtSecret() {
  const secret = env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function readOpaqueSessionId(refreshToken: string) {
  const [sessionId, secret, extra] = refreshToken.split(".");
  if (extra || !sessionId || !secret || secret.length < 32) return null;
  return /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : null;
}

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function derivePassword(password: string, salt: Buffer, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey)),
    );
  });
}

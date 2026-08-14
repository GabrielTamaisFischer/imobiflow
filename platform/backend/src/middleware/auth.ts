import type { NextFunction, Response } from "express";
import { buildMysqlAccessContextFromToken } from "../services/mysql-auth.js";
import { isSubscriptionAllowed } from "../services/subscription-access.js";
import type { RequestWithAccess } from "../types/access.js";

function readBearerToken(header?: string) {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export async function requireAuth(req: RequestWithAccess, res: Response, next: NextFunction) {
  try {
    const token = readBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "AUTH_REQUIRED", message: "Login obrigatorio." });
    }

    const mysqlAccess = await buildMysqlAccessContextFromToken(token);
    if (!mysqlAccess) {
      return res
        .status(401)
        .json({ error: "INVALID_TOKEN", message: "Sessao invalida ou expirada." });
    }

    const { sessionId, ...access } = mysqlAccess;
    req.access = access;
    req.authSessionId = sessionId;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireCompany(req: RequestWithAccess, res: Response, next: NextFunction) {
  if (!req.access?.company?.id || req.access.appUser.company_id !== req.access.company.id) {
    return res
      .status(403)
      .json({ error: "COMPANY_REQUIRED", message: "Usuario sem empresa vinculada." });
  }
  if (req.access.company.status !== "active") {
    return res.status(403).json({ error: "COMPANY_INACTIVE", message: "Empresa inativa." });
  }
  return next();
}

export function requireActiveSubscription(
  req: RequestWithAccess,
  res: Response,
  next: NextFunction,
) {
  const subscription = req.access?.subscription;
  if (
    !isSubscriptionAllowed(
      subscription?.status,
      subscription?.expires_at,
      subscription?.grace_ends_at,
    )
  ) {
    return res.status(402).json({
      error: "SUBSCRIPTION_INACTIVE",
      message: "Acesso bloqueado por assinatura inativa.",
      subscription,
    });
  }
  return next();
}

export function requirePermission(permission: string) {
  return (req: RequestWithAccess, res: Response, next: NextFunction) => {
    const permissions = req.access?.appUser.permissions ?? [];
    if (!permissions.includes(permission)) {
      return res
        .status(403)
        .json({ error: "PERMISSION_DENIED", message: "Usuario sem permissao para esta acao." });
    }
    return next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: RequestWithAccess, res: Response, next: NextFunction) => {
    if (!req.access || !roles.includes(req.access.appUser.role)) {
      return res
        .status(403)
        .json({ error: "ROLE_REQUIRED", message: "Papel insuficiente para esta acao." });
    }
    return next();
  };
}

export function getAuthenticatedCompanyId(req: RequestWithAccess) {
  const companyId = req.access?.company.id;
  if (!companyId || req.access?.appUser.company_id !== companyId) {
    throw Object.assign(new Error("Contexto de empresa invalido."), {
      code: "COMPANY_REQUIRED",
      statusCode: 403,
    });
  }
  return companyId;
}

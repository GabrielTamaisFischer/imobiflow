import type { NextFunction, Response } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { buildAccessContext, isSubscriptionAllowed } from "../services/access-context.js";
import { buildLocalDevAccessContext } from "../services/local-dev-access.js";
import { buildMysqlAccessContextFromToken, isMysqlAuthEnabled } from "../services/mysql-auth.js";
import type { RequestWithAccess } from "../types/access.js";

function readBearerToken(header?: string) {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function requireAuth(req: RequestWithAccess, res: Response, next: NextFunction) {
  try {
    const token = readBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "AUTH_REQUIRED", message: "Login obrigatório." });
    }

    const localDevAccess = buildLocalDevAccessContext(token, {
      hostname: req.hostname,
      remoteAddress: req.socket.remoteAddress,
      forwardedHost: req.get("x-forwarded-host"),
      forwardedFor: req.get("x-forwarded-for"),
    });
    if (localDevAccess) {
      req.access = localDevAccess;
      return next();
    }

    const mysqlAccess = await buildMysqlAccessContextFromToken(token);
    if (mysqlAccess) {
      req.access = mysqlAccess;
      return next();
    }

    if (isMysqlAuthEnabled()) {
      return res.status(401).json({ error: "INVALID_TOKEN", message: "Sessao invalida." });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: "INVALID_TOKEN", message: "Sessão inválida." });
    }

    req.access = await buildAccessContext(data.user);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireCompany(req: RequestWithAccess, res: Response, next: NextFunction) {
  if (!req.access?.company?.id) {
    return res.status(403).json({
      error: "COMPANY_REQUIRED",
      message: "Usuário sem empresa vinculada.",
    });
  }

  if (req.access.company.status !== "active") {
    return res.status(403).json({
      error: "COMPANY_INACTIVE",
      message: "Empresa inativa.",
    });
  }

  return next();
}

export function requireActiveSubscription(
  req: RequestWithAccess,
  res: Response,
  next: NextFunction,
) {
  const subscription = req.access?.subscription;
  const allowed = isSubscriptionAllowed(subscription?.status, subscription?.expires_at);

  if (!allowed) {
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
    const isOwner = req.access?.appUser.role === "owner";

    if (!isOwner && !permissions.includes(permission)) {
      return res.status(403).json({
        error: "PERMISSION_DENIED",
        message: "Usuário sem permissão para esta ação.",
      });
    }

    return next();
  };
}

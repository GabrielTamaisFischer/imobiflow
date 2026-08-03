import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { supabaseAdmin, supabaseAuth } from "../lib/supabase.js";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { buildAccessContext } from "../services/access-context.js";
import { ensureDefaultCrmPipeline } from "../services/crm-bootstrap.js";
import { isMysqlAuthEnabled, loginWithMysqlBootstrap } from "../services/mysql-auth.js";
import { ensureDefaultCompanyRoles, getCompanyRoleBySystemKey } from "../services/roles.js";
import type { RequestWithAccess } from "../types/access.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(2),
  companyDocument: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).optional(),
  roleSystemKey: z
    .enum(["admin", "manager", "broker", "financial", "inspector", "legal"])
    .default("broker"),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

const acceptInviteSchema = z.object({
  token: z.string().min(32),
  name: z.string().min(2),
  password: z.string().min(8),
  phone: z.string().optional(),
});

const userUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().max(32).optional().or(z.literal("")),
  roleSystemKey: z
    .enum(["admin", "manager", "broker", "financial", "inspector", "legal"])
    .optional(),
  status: z.enum(["active", "inactive", "blocked"]).optional(),
});

authRouter.post("/register", async (req, res, next) => {
  let createdUserId: string | undefined;
  let createdCompanyId: string | undefined;

  try {
    if (isMysqlAuthEnabled()) {
      return res.status(501).json({
        error: "MYSQL_AUTH_BOOTSTRAP_ONLY",
        message: "Cadastro publico ainda nao esta habilitado no modo MySQL. Use o usuario bootstrap configurado no ambiente.",
      });
    }

    const input = registerSchema.parse(req.body);

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: false,
      user_metadata: {
        name: input.name,
      },
    });

    if (authError || !authData.user) throw authError;
    createdUserId = authData.user.id;

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .insert({
        name: input.companyName,
        document: input.companyDocument,
        phone: input.phone,
        email: input.email,
        status: "active",
      })
      .select("id, name, status")
      .single();

    if (companyError) throw companyError;
    createdCompanyId = company.id;

    await ensureDefaultCompanyRoles(company.id);

    const ownerRole = await getCompanyRoleBySystemKey(company.id, "owner");
    if (!ownerRole) throw Object.assign(new Error("Cargo owner não encontrado."), { statusCode: 500 });

    const { error: userError } = await supabaseAdmin.from("users").insert({
      id: authData.user.id,
      company_id: company.id,
      role_id: ownerRole.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      status: "active",
    });

    if (userError) throw userError;

    const { error: subscriptionError } = await supabaseAdmin.from("subscriptions").insert({
      company_id: company.id,
      status: "inactive",
    });

    if (subscriptionError) throw subscriptionError;

    await ensureDefaultCrmPipeline(company.id, authData.user.id);

    res.status(201).json({
      message: "Cadastro criado. Acesse o checkout para ativar sua assinatura.",
      company,
      authorization: {
        authenticated: true,
        companyLinked: true,
        subscriptionActive: false,
        blockedReason: "SUBSCRIPTION_INACTIVE",
      },
    });
  } catch (error) {
    if (createdCompanyId) {
      await supabaseAdmin.from("companies").delete().eq("id", createdCompanyId);
    }

    if (createdUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    }
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const mysqlLogin = await loginWithMysqlBootstrap(input.email, input.password);
    if (mysqlLogin) {
      return res.json(mysqlLogin);
    }

    if (isMysqlAuthEnabled()) {
      return res
        .status(401)
        .json({ error: "INVALID_CREDENTIALS", message: "E-mail ou senha invalidos." });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword(input);

    if (error || !data.session || !data.user) {
      return res
        .status(401)
        .json({ error: "INVALID_CREDENTIALS", message: "E-mail ou senha inválidos." });
    }

    const context = await buildAccessContext(data.user);

    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      access: context,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/session", requireAuth, (req: RequestWithAccess, res) => {
  res.json({ access: req.access });
});

authRouter.get(
  "/users",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;

      const { data: users, error } = await supabaseAdmin
        .from("users")
        .select(
          "id, company_id, role_id, name, email, phone, status, created_at, updated_at, roles(id, system_key, name)",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      res.json({ users: users ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.patch(
  "/users/:id",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const input = userUpdateSchema.parse(req.body);
      const updates: Record<string, unknown> = {};

      if (input.name !== undefined) updates.name = input.name;
      if (input.phone !== undefined) updates.phone = input.phone || null;
      if (input.status !== undefined) updates.status = input.status;
      if (input.roleSystemKey !== undefined) {
        const role = await getCompanyRoleBySystemKey(companyId, input.roleSystemKey);
        if (!role) {
          return res.status(400).json({
            error: "ROLE_NOT_FOUND",
            message: "Cargo informado não existe para esta empresa.",
          });
        }
        updates.role_id = role.id;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          error: "EMPTY_UPDATE",
          message: "Informe ao menos um campo para atualizar.",
        });
      }

      updates.updated_at = new Date().toISOString();

      const { data: user, error } = await supabaseAdmin
        .from("users")
        .update(updates)
        .eq("id", req.params.id)
        .eq("company_id", companyId)
        .select("id, company_id, role_id, name, email, phone, status, created_at, updated_at, roles(id, system_key, name)")
        .single();

      if (error) throw error;

      await writeAuditLog(req, "user.updated", "users", user.id, {
        updated_fields: Object.keys(updates).filter((key) => key !== "updated_at"),
      });

      res.json({ user });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  "/invitations",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;

      const { data: invitations, error } = await supabaseAdmin
        .from("user_invitations")
        .select("id, company_id, role_id, invited_by, email, name, status, expires_at, accepted_at, created_at, updated_at, roles(id, system_key, name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      res.json({ invitations: invitations ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/invite",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = inviteSchema.parse(req.body);
      const companyId = req.access!.company.id;
      const invitedBy = req.access!.appUser.id;
      const normalizedEmail = input.email.trim().toLowerCase();

      const { data: existingUser, error: existingUserError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("company_id", companyId)
        .ilike("email", normalizedEmail)
        .maybeSingle<{ id: string }>();

      if (existingUserError) throw existingUserError;
      if (existingUser) {
        return res.status(409).json({
          error: "USER_ALREADY_EXISTS",
          message: "Este e-mail já pertence a um usuário da empresa.",
        });
      }

      const role = await getCompanyRoleBySystemKey(companyId, input.roleSystemKey);
      if (!role) {
        return res.status(400).json({
          error: "ROLE_NOT_FOUND",
          message: "Cargo de convite não encontrado.",
        });
      }

      const token = randomBytes(32).toString("hex");
      const tokenHash = hashInviteToken(token);
      const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();

      const { data: invitation, error: invitationError } = await supabaseAdmin
        .from("user_invitations")
        .insert({
          company_id: companyId,
          role_id: role.id,
          invited_by: invitedBy,
          email: normalizedEmail,
          name: input.name,
          token_hash: tokenHash,
          expires_at: expiresAt,
          metadata: {
            role_system_key: role.system_key,
          },
        })
        .select("id, email, name, status, expires_at, roles(system_key, name)")
        .single();

      if (invitationError) throw invitationError;

      await writeAuditLog(req, "user.invited", "user_invitations", invitation.id, {
        email: normalizedEmail,
        role_system_key: input.roleSystemKey,
      });

      res.status(201).json({
        invitation,
        invite_url: `${env.APP_URL.replace(/\/$/, "")}/aceitar-convite?token=${token}`,
        token,
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/invitations/:id/cancel",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const now = new Date().toISOString();

      const { data: invitation, error } = await supabaseAdmin
        .from("user_invitations")
        .update({ status: "cancelled", updated_at: now })
        .eq("id", req.params.id)
        .eq("company_id", companyId)
        .eq("status", "pending")
        .select("id, email, name, status, expires_at, roles(system_key, name)")
        .single();

      if (error) throw error;

      await writeAuditLog(req, "user.invitation_cancelled", "user_invitations", invitation.id, {
        email: invitation.email,
      });

      res.json({ invitation });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/invitations/:id/reissue",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashInviteToken(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: invitation, error } = await supabaseAdmin
        .from("user_invitations")
        .update({ token_hash: tokenHash, status: "pending", expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .eq("company_id", companyId)
        .neq("status", "accepted")
        .select("id, email, name, status, expires_at, roles(system_key, name)")
        .single();

      if (error) throw error;

      await writeAuditLog(req, "user.invitation_reissued", "user_invitations", invitation.id, {
        email: invitation.email,
      });

      res.json({
        invitation,
        invite_url: `${env.APP_URL.replace(/\/$/, "")}/aceitar-convite?token=${token}`,
        token,
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post("/accept-invite", async (req, res, next) => {
  let createdUserId: string | undefined;

  try {
    const input = acceptInviteSchema.parse(req.body);
    const tokenHash = hashInviteToken(input.token);

    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from("user_invitations")
      .select("id, company_id, role_id, email, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle<{
        id: string;
        company_id: string;
        role_id: string | null;
        email: string;
        status: string;
        expires_at: string;
      }>();

    if (invitationError) throw invitationError;
    if (!invitation || invitation.status !== "pending") {
      return res.status(404).json({
        error: "INVITATION_NOT_FOUND",
        message: "Convite inválido ou já utilizado.",
      });
    }

    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await supabaseAdmin
        .from("user_invitations")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", invitation.id);

      return res.status(410).json({
        error: "INVITATION_EXPIRED",
        message: "Convite expirado. Solicite um novo convite ao administrador.",
      });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: invitation.email,
      password: input.password,
      email_confirm: false,
      user_metadata: {
        name: input.name,
      },
    });

    if (authError || !authData.user) throw authError;
    createdUserId = authData.user.id;

    const { error: userError } = await supabaseAdmin.from("users").insert({
      id: authData.user.id,
      company_id: invitation.company_id,
      role_id: invitation.role_id,
      name: input.name,
      email: invitation.email,
      phone: input.phone,
      status: "active",
    });

    if (userError) throw userError;

    const acceptedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("user_invitations")
      .update({ status: "accepted", accepted_at: acceptedAt, updated_at: acceptedAt })
      .eq("id", invitation.id);

    if (updateError) throw updateError;

    await supabaseAdmin.from("audit_logs").insert({
      company_id: invitation.company_id,
      user_id: authData.user.id,
      action: "user.invitation_accepted",
      entity_type: "users",
      entity_id: authData.user.id,
      metadata: {
        invitation_id: invitation.id,
        email: invitation.email,
      },
    });

    res.status(201).json({
      message: "Convite aceito. Faça login para acessar o ImobiFlow.",
    });
  } catch (error) {
    if (createdUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    }
    next(error);
  }
});

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function writeAuditLog(
  req: RequestWithAccess,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await supabaseAdmin.from("audit_logs").insert({
    company_id: req.access?.company.id,
    user_id: req.access?.appUser.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"],
  });
}

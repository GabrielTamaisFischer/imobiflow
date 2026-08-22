import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import {
  getAuthenticatedCompanyId,
  requireAuth,
  requireCompany,
  requirePermission,
  requireRole,
} from "../middleware/auth.js";
import {
  mayExposeAuthenticationTokenForTests,
  sendAuthenticationEmail,
} from "../services/auth-email.js";
import {
  assertPasswordPolicy,
  authError,
  createSession,
  hashOpaqueToken,
  hashPassword,
  loginWithMysql,
  normalizeEmail,
  refreshMysqlSession,
  revokeAllUserSessions,
  revokeMysqlSession,
  verifyPassword,
  writeAuthAudit,
} from "../services/mysql-auth.js";
import {
  ensureDefaultCompanyRoles,
  getCompanyRoleBySystemKey,
  listCompanyRoles,
  serializeRole,
} from "../services/roles.js";
import type { RequestWithAccess } from "../types/access.js";
import { updateCompanyUser } from "../services/user-management.js";
import { activatePaidAccount, validateAccountActivation } from "../services/account-activation.js";

export const authRouter = Router();

const passwordSchema = z.string().min(12).max(128);
const activationSchema = z.object({
  token: z.string().min(40).max(256),
  name: z.string().trim().min(2).max(160),
  password: passwordSchema,
  company_name: z.string().trim().min(2).max(160),
  company_document: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.never().optional(),
  plan_id: z.never().optional(),
  plan_slug: z.never().optional(),
  company_id: z.never().optional(),
  payment_status: z.never().optional(),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
const refreshSchema = z.object({ refresh_token: z.string().min(40).max(300) });
const roleSystemKeySchema = z.enum([
  "owner",
  "admin",
  "manager",
  "broker",
  "assistant",
  "read_only",
  "financial",
  "inspector",
  "legal",
]);
const inviteSchema = z.object({
  email: z.string().email().max(180),
  name: z.string().trim().min(2).max(160).optional(),
  roleSystemKey: roleSystemKeySchema.optional(),
  roleId: z.string().uuid().optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
const acceptInviteSchema = z.object({
  token: z.string().min(40).max(256),
  name: z.string().trim().min(2).max(160),
  password: passwordSchema,
  phone: z.string().trim().max(40).optional(),
});
const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  roleSystemKey: roleSystemKeySchema.optional(),
  roleId: z.string().uuid().optional(),
  status: z.enum(["active", "inactive", "blocked"]).optional(),
});
const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});
const companyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  document: z.string().trim().max(40).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().email().max(160).optional().or(z.literal("")),
});
const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: passwordSchema,
});
const forgotPasswordSchema = z.object({ email: z.string().email().max(180) });
const resetPasswordSchema = z.object({
  token: z.string().min(40).max(256),
  new_password: passwordSchema,
});
const roleCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  permissionKeys: z.array(z.string().min(1).max(120)).min(1).max(100),
});
const roleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  permissionKeys: z.array(z.string().min(1).max(120)).min(1).max(100).optional(),
});

authRouter.post("/register", (_req, res) => {
  res.status(403).json({
    error: "PAID_ACTIVATION_REQUIRED",
    message: "Para criar sua conta ImobiFlow, escolha um plano.",
    plans_path: "/planos",
  });
});

authRouter.get("/activations/validate", async (req, res, next) => {
  try {
    const token = z.string().min(40).max(256).parse(req.query.token);
    res.json({ activation: await validateAccountActivation(token) });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/activate-account", async (req, res, next) => {
  try {
    const input = activationSchema.parse(req.body);
    const result = await activatePaidAccount(
      {
        token: input.token,
        ownerName: input.name,
        password: input.password,
        companyName: input.company_name,
        companyDocument: input.company_document,
        phone: input.phone,
      },
      requestMetadata(req),
    );
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    res.json(await loginWithMysql(input.email, input.password, requestMetadata(req)));
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const input = refreshSchema.parse(req.body);
    res.json(await refreshMysqlSession(input.refresh_token, requestMetadata(req)));
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", requireAuth, async (req: RequestWithAccess, res, next) => {
  try {
    await revokeMysqlSession(
      req.authSessionId!,
      req.access!.appUser.id,
      getAuthenticatedCompanyId(req),
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/session", requireAuth, (req: RequestWithAccess, res) => {
  res.json({ access: req.access });
});

authRouter.get(
  "/company",
  requireAuth,
  requireCompany,
  async (req: RequestWithAccess, res, next) => {
    try {
      const company = await getPrisma().company.findFirst({
        where: { id: getAuthenticatedCompanyId(req) },
      });
      if (!company) throw authError("COMPANY_NOT_FOUND", "Empresa nao encontrada.", 404);
      res.json({ company: serializeCompany(company) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.patch(
  "/company",
  requireAuth,
  requireCompany,
  requirePermission("settings.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = companyUpdateSchema.parse(req.body);
      if (!Object.keys(input).length)
        throw authError("EMPTY_UPDATE", "Informe ao menos um campo.", 400);
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      const result = await prisma.company.updateMany({
        where: { id: companyId, status: "active" },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.document !== undefined ? { document: input.document || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
          ...(input.email !== undefined
            ? { email: input.email ? normalizeEmail(input.email) : null }
            : {}),
        },
      });
      if (!result.count) throw authError("COMPANY_NOT_FOUND", "Empresa nao encontrada.", 404);
      const company = await prisma.company.findFirstOrThrow({ where: { id: companyId } });
      await writeAuthAudit(
        prisma,
        companyId,
        req.access!.appUser.id,
        "company.updated",
        "companies",
        companyId,
        {
          updated_fields: Object.keys(input),
        },
      );
      res.json({ company: serializeCompany(company) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.patch(
  "/profile",
  requireAuth,
  requireCompany,
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = profileUpdateSchema.parse(req.body);
      if (!Object.keys(input).length)
        throw authError("EMPTY_UPDATE", "Informe ao menos um campo.", 400);
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      await prisma.appUser.updateMany({
        where: { id: req.access!.appUser.id, companyId, status: "active" },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        },
      });
      const user = await loadCompanyUser(prisma, companyId, req.access!.appUser.id);
      res.json({ user: serializeUser(user) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  "/roles",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const roles = await listCompanyRoles(getAuthenticatedCompanyId(req));
      res.json({ roles: roles.map(serializeRole) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  "/permissions",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  async (_req, res, next) => {
    try {
      const permissions = await getPrisma().permission.findMany({ orderBy: { key: "asc" } });
      res.json({ permissions });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/roles",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  requireRole("owner", "admin"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = roleCreateSchema.parse(req.body);
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      const role = await prisma.$transaction(async (transaction) => {
        const permissions = await transaction.permission.findMany({
          where: { key: { in: [...new Set(input.permissionKeys)] } },
        });
        if (permissions.length !== new Set(input.permissionKeys).size) {
          throw authError("PERMISSION_NOT_FOUND", "Uma ou mais permissoes nao existem.", 400);
        }
        const createdRole = await transaction.role.create({
          data: { companyId, name: input.name, isSystem: false },
        });
        await transaction.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: createdRole.id,
            permissionId: permission.id,
          })),
        });
        await writeAuthAudit(
          transaction,
          companyId,
          req.access!.appUser.id,
          "role.created",
          "roles",
          createdRole.id,
          {
            permission_keys: input.permissionKeys,
          },
        );
        return transaction.role.findFirstOrThrow({
          where: { id: createdRole.id, companyId },
          include: {
            permissions: { include: { permission: true } },
            _count: { select: { users: true } },
          },
        });
      });
      res.status(201).json({ role: serializeRole(role) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.patch(
  "/roles/:id",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  requireRole("owner", "admin"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = roleUpdateSchema.parse(req.body);
      if (!Object.keys(input).length)
        throw authError("EMPTY_UPDATE", "Informe ao menos um campo.", 400);
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      const role = await prisma.$transaction(async (transaction) => {
        const current = await transaction.role.findFirst({
          where: { id: req.params.id, companyId },
        });
        if (!current) throw authError("ROLE_NOT_FOUND", "Papel nao encontrado.", 404);
        if (current.isSystem)
          throw authError("SYSTEM_ROLE_IMMUTABLE", "Papeis padrao nao podem ser alterados.", 409);
        if (input.name !== undefined) {
          await transaction.role.update({ where: { id: current.id }, data: { name: input.name } });
        }
        if (input.permissionKeys) {
          const uniqueKeys = [...new Set(input.permissionKeys)];
          const permissions = await transaction.permission.findMany({
            where: { key: { in: uniqueKeys } },
          });
          if (permissions.length !== uniqueKeys.length)
            throw authError("PERMISSION_NOT_FOUND", "Uma ou mais permissoes nao existem.", 400);
          await transaction.rolePermission.deleteMany({ where: { roleId: current.id } });
          await transaction.rolePermission.createMany({
            data: permissions.map((permission) => ({
              roleId: current.id,
              permissionId: permission.id,
            })),
          });
        }
        await writeAuthAudit(
          transaction,
          companyId,
          req.access!.appUser.id,
          "role.updated",
          "roles",
          current.id,
          {
            updated_fields: Object.keys(input),
          },
        );
        return transaction.role.findFirstOrThrow({
          where: { id: current.id, companyId },
          include: {
            permissions: { include: { permission: true } },
            _count: { select: { users: true } },
          },
        });
      });
      res.json({ role: serializeRole(role) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.delete(
  "/roles/:id",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  requireRole("owner", "admin"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      await prisma.$transaction(async (transaction) => {
        const role = await transaction.role.findFirst({
          where: { id: req.params.id, companyId },
          include: { _count: { select: { users: true, invitations: true } } },
        });
        if (!role) throw authError("ROLE_NOT_FOUND", "Papel nao encontrado.", 404);
        if (role.isSystem)
          throw authError("SYSTEM_ROLE_IMMUTABLE", "Papeis padrao nao podem ser excluidos.", 409);
        if (role._count.users || role._count.invitations) {
          throw authError(
            "ROLE_IN_USE",
            "Remova usuarios e convites deste papel antes de exclui-lo.",
            409,
          );
        }
        const deleted = await transaction.role.deleteMany({
          where: { id: role.id, companyId, isSystem: false },
        });
        if (deleted.count !== 1) throw authError("ROLE_NOT_FOUND", "Papel nao encontrado.", 404);
        await writeAuthAudit(
          transaction,
          companyId,
          req.access!.appUser.id,
          "role.deleted",
          "roles",
          role.id,
          {},
        );
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  "/users",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = getAuthenticatedCompanyId(req);
      const users = await getPrisma().appUser.findMany({
        where: { companyId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { roleRecord: true },
      });
      res.json({ users: users.map(serializeUser) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.patch(
  "/users/:id",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  requireRole("owner", "admin"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = userUpdateSchema.parse(req.body);
      if (!Object.keys(input).length)
        throw authError("EMPTY_UPDATE", "Informe ao menos um campo.", 400);
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      const user = await updateCompanyUser({
        prisma,
        companyId,
        actorUserId: req.access!.appUser.id,
        actorRole: req.access!.appUser.role,
        targetUserId: req.params.id,
        update: input,
      });
      res.json({ user: serializeUser(user) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  "/invitations",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const invitations = await getPrisma().userInvitation.findMany({
        where: { companyId: getAuthenticatedCompanyId(req) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { role: true },
      });
      res.json({ invitations: invitations.map(serializeInvitation) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/invite",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  requireRole("owner", "admin"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = inviteSchema.parse(req.body);
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      const email = normalizeEmail(input.email);
      if (await prisma.appUser.findUnique({ where: { email }, select: { id: true } })) {
        throw authError("USER_ALREADY_EXISTS", "Este e-mail ja pertence a um usuario.", 409);
      }
      if (
        await prisma.userInvitation.findFirst({
          where: { email, status: "pending", expiresAt: { gt: new Date() } },
        })
      ) {
        throw authError(
          "INVITATION_ALREADY_PENDING",
          "Ja existe um convite pendente para este e-mail.",
          409,
        );
      }
      const role = input.roleId
        ? await prisma.role.findFirst({
            where: { id: input.roleId, companyId },
            include: { permissions: { include: { permission: true } } },
          })
        : await getCompanyRoleBySystemKey(companyId, input.roleSystemKey ?? "broker", prisma);
      if (!role) throw authError("ROLE_NOT_FOUND", "Papel de convite nao encontrado.", 400);
      if (role.systemKey === "owner" && req.access!.appUser.role !== "owner") {
        throw authError("OWNER_ROLE_REQUIRED", "Somente um owner pode convidar outro owner.", 403);
      }
      const token = randomBytes(32).toString("base64url");
      const invitation = await prisma.userInvitation.create({
        data: {
          companyId,
          roleId: role.id,
          invitedById: req.access!.appUser.id,
          email,
          name: input.name,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
        },
        include: { role: true },
      });
      const inviteUrl = `${env.APP_URL.replace(/\/$/, "")}/aceitar-convite?token=${encodeURIComponent(token)}`;
      const delivered = await sendAuthenticationEmail({
        to: email,
        subject: "Convite para o ImobiFlow",
        body: `Voce recebeu um convite para o ImobiFlow. O link expira em ${input.expiresInDays} dia(s): ${inviteUrl}`,
        action: "invitation",
      });
      await writeAuthAudit(
        prisma,
        companyId,
        req.access!.appUser.id,
        "user.invited",
        "user_invitations",
        invitation.id,
        {
          role_id: role.id,
          delivered,
        },
      );
      res
        .status(201)
        .json({ invitation: serializeInvitation(invitation), invite_url: inviteUrl, delivered });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/invitations/:id/cancel",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  requireRole("owner", "admin"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      const result = await prisma.userInvitation.updateMany({
        where: { id: req.params.id, companyId, status: "pending" },
        data: { status: "cancelled" },
      });
      if (!result.count)
        throw authError("INVITATION_NOT_FOUND", "Convite pendente nao encontrado.", 404);
      const invitation = await prisma.userInvitation.findFirstOrThrow({
        where: { id: req.params.id, companyId },
        include: { role: true },
      });
      await writeAuthAudit(
        prisma,
        companyId,
        req.access!.appUser.id,
        "user.invitation_cancelled",
        "user_invitations",
        invitation.id,
        {},
      );
      res.json({ invitation: serializeInvitation(invitation) });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/invitations/:id/reissue",
  requireAuth,
  requireCompany,
  requirePermission("users.manage"),
  requireRole("owner", "admin"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      const existing = await prisma.userInvitation.findFirst({
        where: { id: req.params.id, companyId, status: { not: "accepted" } },
        include: { role: true },
      });
      if (!existing) throw authError("INVITATION_NOT_FOUND", "Convite nao encontrado.", 404);
      if (existing.role.systemKey === "owner" && req.access!.appUser.role !== "owner") {
        throw authError(
          "OWNER_ROLE_REQUIRED",
          "Somente um owner pode reenviar convite de owner.",
          403,
        );
      }
      const token = randomBytes(32).toString("base64url");
      const invitation = await prisma.userInvitation.update({
        where: { id: existing.id },
        data: {
          tokenHash: hashOpaqueToken(token),
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
        include: { role: true },
      });
      const inviteUrl = `${env.APP_URL.replace(/\/$/, "")}/aceitar-convite?token=${encodeURIComponent(token)}`;
      const delivered = await sendAuthenticationEmail({
        to: invitation.email,
        subject: "Novo convite para o ImobiFlow",
        body: `Seu novo link de convite para o ImobiFlow: ${inviteUrl}`,
        action: "invitation",
      });
      await writeAuthAudit(
        prisma,
        companyId,
        req.access!.appUser.id,
        "user.invitation_reissued",
        "user_invitations",
        invitation.id,
        { delivered },
      );
      res.json({ invitation: serializeInvitation(invitation), invite_url: inviteUrl, delivered });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get("/invitations/validate", async (req, res, next) => {
  try {
    const token = z.string().min(40).max(256).parse(req.query.token);
    const invitation = await getPrisma().userInvitation.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      include: { company: true, role: true },
    });
    if (!invitation || invitation.status !== "pending")
      throw authError("INVITATION_NOT_FOUND", "Convite invalido ou utilizado.", 404);
    if (invitation.expiresAt.getTime() <= Date.now())
      throw authError("INVITATION_EXPIRED", "Convite expirado.", 410);
    res.json({
      invitation: {
        email: invitation.email,
        name: invitation.name,
        company_name: invitation.company.name,
        role_name: invitation.role.name,
        expires_at: invitation.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/accept-invite", async (req, res, next) => {
  try {
    const input = acceptInviteSchema.parse(req.body);
    assertPasswordPolicy(input.password);
    const passwordHash = await hashPassword(input.password);
    const prisma = getPrisma();
    const user = await prisma.$transaction(async (transaction) => {
      const invitation = await transaction.userInvitation.findUnique({
        where: { tokenHash: hashOpaqueToken(input.token) },
        include: { role: true, company: true },
      });
      if (!invitation || invitation.status !== "pending")
        throw authError("INVITATION_NOT_FOUND", "Convite invalido ou utilizado.", 404);
      if (invitation.expiresAt.getTime() <= Date.now()) {
        await transaction.userInvitation.update({
          where: { id: invitation.id },
          data: { status: "expired" },
        });
        throw authError("INVITATION_EXPIRED", "Convite expirado.", 410);
      }
      if (
        invitation.company.status !== "active" ||
        invitation.role.companyId !== invitation.companyId
      ) {
        throw authError("COMPANY_INACTIVE", "Empresa do convite indisponivel.", 403);
      }
      if (
        await transaction.appUser.findUnique({
          where: { email: invitation.email },
          select: { id: true },
        })
      ) {
        throw authError("USER_ALREADY_EXISTS", "Este e-mail ja pertence a um usuario.", 409);
      }
      const claimed = await transaction.userInvitation.updateMany({
        where: {
          id: invitation.id,
          companyId: invitation.companyId,
          status: "pending",
          acceptedAt: null,
        },
        data: { status: "accepted", acceptedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw authError("INVITATION_ALREADY_USED", "Convite ja utilizado.", 409);
      const createdUser = await transaction.appUser.create({
        data: {
          companyId: invitation.companyId,
          roleId: invitation.roleId,
          name: input.name,
          email: invitation.email,
          phone: input.phone || null,
          passwordHash,
          passwordChangedAt: new Date(),
          status: "active",
          role: invitation.role.systemKey ?? invitation.role.name,
          permissionsJson: [],
        },
      });
      await writeAuthAudit(
        transaction,
        invitation.companyId,
        createdUser.id,
        "user.invitation_accepted",
        "users",
        createdUser.id,
        {
          invitation_id: invitation.id,
        },
      );
      return createdUser;
    });
    res
      .status(201)
      .json({ message: "Convite aceito. Faca login para acessar o ImobiFlow.", user_id: user.id });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    const prisma = getPrisma();
    const user = await prisma.appUser.findUnique({
      where: { email: normalizeEmail(input.email) },
      include: { company: true },
    });
    let exposedToken: string | undefined;
    if (user?.status === "active" && user.company.status === "active") {
      const token = randomBytes(32).toString("base64url");
      await prisma.$transaction(async (transaction) => {
        await transaction.passwordResetToken.updateMany({
          where: { userId: user.id, companyId: user.companyId, usedAt: null },
          data: { usedAt: new Date() },
        });
        await transaction.passwordResetToken.create({
          data: {
            companyId: user.companyId,
            userId: user.id,
            tokenHash: hashOpaqueToken(token),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        await writeAuthAudit(
          transaction,
          user.companyId,
          user.id,
          "auth.password_reset_requested",
          "users",
          user.id,
          {},
        );
      });
      const resetUrl = `${env.APP_URL.replace(/\/$/, "")}/redefinir-senha?token=${encodeURIComponent(token)}`;
      await sendAuthenticationEmail({
        to: user.email,
        subject: "Redefinicao de senha do ImobiFlow",
        body: `Use este link para redefinir sua senha. Ele expira em 60 minutos: ${resetUrl}`,
        action: "password_reset",
      });
      if (mayExposeAuthenticationTokenForTests()) exposedToken = token;
    }
    res.json({
      message:
        "Se houver uma conta ativa para este e-mail, as instrucoes de recuperacao serao enviadas.",
      ...(exposedToken ? { test_token: exposedToken } : {}),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const input = resetPasswordSchema.parse(req.body);
    assertPasswordPolicy(input.new_password);
    const passwordHash = await hashPassword(input.new_password);
    const prisma = getPrisma();
    await prisma.$transaction(async (transaction) => {
      const reset = await transaction.passwordResetToken.findUnique({
        where: { tokenHash: hashOpaqueToken(input.token) },
        include: { user: { include: { company: true } } },
      });
      if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) {
        throw authError("RESET_TOKEN_INVALID", "Token de recuperacao invalido ou expirado.", 400);
      }
      if (reset.user.status !== "active" || reset.user.company.status !== "active") {
        throw authError("USER_INACTIVE", "Usuario ou empresa inativa.", 403);
      }
      const claimed = await transaction.passwordResetToken.updateMany({
        where: {
          id: reset.id,
          companyId: reset.companyId,
          userId: reset.userId,
          tokenHash: reset.tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw authError("RESET_TOKEN_INVALID", "Token de recuperacao invalido ou expirado.", 400);
      }
      await transaction.appUser.update({
        where: { id: reset.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await transaction.passwordResetToken.updateMany({
        where: { userId: reset.userId, companyId: reset.companyId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await revokeAllUserSessions(reset.userId, reset.companyId, transaction);
      await writeAuthAudit(
        transaction,
        reset.companyId,
        reset.userId,
        "auth.password_reset_completed",
        "users",
        reset.userId,
        {},
      );
    });
    res.json({ message: "Senha redefinida. Entre novamente em sua conta." });
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  "/change-password",
  requireAuth,
  requireCompany,
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = changePasswordSchema.parse(req.body);
      assertPasswordPolicy(input.new_password);
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      const user = await prisma.appUser.findFirst({
        where: { id: req.access!.appUser.id, companyId, status: "active" },
      });
      if (!user || !(await verifyPassword(input.current_password, user.passwordHash))) {
        throw authError("CURRENT_PASSWORD_INVALID", "Senha atual invalida.", 400);
      }
      const passwordHash = await hashPassword(input.new_password);
      await prisma.$transaction(async (transaction) => {
        await transaction.appUser.update({
          where: { id: user.id },
          data: { passwordHash, passwordChangedAt: new Date() },
        });
        await revokeAllUserSessions(user.id, companyId, transaction);
        await writeAuthAudit(
          transaction,
          companyId,
          user.id,
          "auth.password_changed",
          "users",
          user.id,
          {},
        );
      });
      res.json({ message: "Senha alterada. Entre novamente em todos os dispositivos." });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  "/sessions",
  requireAuth,
  requireCompany,
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = getAuthenticatedCompanyId(req);
      const sessions = await getPrisma().authSession.findMany({
        where: {
          companyId,
          userId: req.access!.appUser.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
        },
      });
      res.json({
        sessions: sessions.map((session) => ({
          ...session,
          current: session.id === req.authSessionId,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.delete(
  "/sessions/:id",
  requireAuth,
  requireCompany,
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = getAuthenticatedCompanyId(req);
      const prisma = getPrisma();
      const result = await prisma.authSession.updateMany({
        where: { id: req.params.id, companyId, userId: req.access!.appUser.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw authError("SESSION_NOT_FOUND", "Sessao nao encontrada.", 404);
      await writeAuthAudit(
        prisma,
        companyId,
        req.access!.appUser.id,
        "auth.session_revoked",
        "auth_sessions",
        req.params.id,
        {},
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

function loadCompanyUser(
  database: ReturnType<typeof getPrisma>,
  companyId: string,
  userId: string,
) {
  return database.appUser.findFirst({
    where: { id: userId, companyId },
    include: { roleRecord: true },
  });
}

function serializeCompany(company: {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: company.id,
    name: company.name,
    document: company.document,
    phone: company.phone,
    email: company.email,
    status: company.status,
    created_at: company.createdAt.toISOString(),
    updated_at: company.updatedAt.toISOString(),
  };
}

function serializeUser(user: Awaited<ReturnType<typeof loadCompanyUser>>) {
  if (!user) return null;
  return {
    id: user.id,
    company_id: user.companyId,
    role_id: user.roleId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
    roles: {
      id: user.roleRecord.id,
      system_key: user.roleRecord.systemKey,
      name: user.roleRecord.name,
    },
  };
}

function serializeInvitation(invitation: {
  id: string;
  companyId: string;
  roleId: string;
  invitedById: string | null;
  email: string;
  name: string | null;
  status: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  role: { id: string; systemKey: string | null; name: string };
}) {
  return {
    id: invitation.id,
    company_id: invitation.companyId,
    role_id: invitation.roleId,
    invited_by: invitation.invitedById,
    email: invitation.email,
    name: invitation.name,
    status: invitation.status,
    expires_at: invitation.expiresAt.toISOString(),
    accepted_at: invitation.acceptedAt?.toISOString() ?? null,
    created_at: invitation.createdAt.toISOString(),
    updated_at: invitation.updatedAt.toISOString(),
    roles: {
      id: invitation.role.id,
      system_key: invitation.role.systemKey,
      name: invitation.role.name,
    },
  };
}

function requestMetadata(req: {
  ip?: string;
  headers: { [key: string]: string | string[] | undefined };
}) {
  const userAgent = req.headers["user-agent"];
  return { ipAddress: req.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent };
}

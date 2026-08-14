import { Prisma, type PrismaClient } from "@prisma/client";
import { authError, revokeAllUserSessions, writeAuthAudit } from "./mysql-auth.js";

export type CompanyUserUpdate = {
  name?: string;
  phone?: string;
  roleSystemKey?: string;
  roleId?: string;
  status?: "active" | "inactive" | "blocked";
};

export async function updateCompanyUser(input: {
  prisma: PrismaClient;
  companyId: string;
  actorUserId: string;
  actorRole: string;
  targetUserId: string;
  update: CompanyUserUpdate;
}) {
  return input.prisma.$transaction(
    async (transaction) => {
      const target = await transaction.appUser.findFirst({
        where: { id: input.targetUserId, companyId: input.companyId },
        include: { roleRecord: true },
      });
      if (!target) throw authError("USER_NOT_FOUND", "Usuario nao encontrado.", 404);

      const nextRole =
        input.update.roleId || input.update.roleSystemKey
          ? await transaction.role.findFirst({
              where: {
                companyId: input.companyId,
                ...(input.update.roleId
                  ? { id: input.update.roleId }
                  : { systemKey: input.update.roleSystemKey }),
              },
            })
          : null;
      if ((input.update.roleId || input.update.roleSystemKey) && !nextRole) {
        throw authError("ROLE_NOT_FOUND", "Papel nao encontrado.", 400);
      }

      const currentRole = target.roleRecord.systemKey;
      if (
        (currentRole === "owner" || nextRole?.systemKey === "owner") &&
        input.actorRole !== "owner"
      ) {
        throw authError(
          "OWNER_ROLE_REQUIRED",
          "Somente um owner pode alterar vinculos de owner.",
          403,
        );
      }
      const removesActiveOwner =
        currentRole === "owner" &&
        target.status === "active" &&
        ((nextRole !== null && nextRole.systemKey !== "owner") ||
          (input.update.status !== undefined && input.update.status !== "active"));
      if (removesActiveOwner) {
        const activeOwners = await transaction.appUser.count({
          where: {
            companyId: input.companyId,
            status: "active",
            roleRecord: { systemKey: "owner" },
          },
        });
        if (activeOwners <= 1) {
          throw authError(
            "LAST_OWNER_PROTECTED",
            "A empresa precisa manter ao menos um owner ativo.",
            409,
          );
        }
      }

      const result = await transaction.appUser.updateMany({
        where: { id: target.id, companyId: input.companyId },
        data: {
          ...(input.update.name !== undefined ? { name: input.update.name } : {}),
          ...(input.update.phone !== undefined ? { phone: input.update.phone || null } : {}),
          ...(input.update.status !== undefined ? { status: input.update.status } : {}),
          ...(nextRole ? { roleId: nextRole.id, role: nextRole.systemKey ?? nextRole.name } : {}),
        },
      });
      if (result.count !== 1) throw authError("USER_NOT_FOUND", "Usuario nao encontrado.", 404);
      if (input.update.status && input.update.status !== "active") {
        await revokeAllUserSessions(target.id, input.companyId, transaction);
      }
      await writeAuthAudit(
        transaction,
        input.companyId,
        input.actorUserId,
        "user.updated",
        "users",
        target.id,
        {
          updated_fields: Object.keys(input.update),
        },
      );
      return transaction.appUser.findFirstOrThrow({
        where: { id: target.id, companyId: input.companyId },
        include: { roleRecord: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

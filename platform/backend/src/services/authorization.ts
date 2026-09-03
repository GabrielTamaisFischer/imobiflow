import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";
import type { AccessContext, ResourceScope } from "../types/access.js";

export const resourcePermissions = ["VIEW", "EDIT", "VISIT", "INSPECT", "NEGOTIATE"] as const;
export type ResourcePermission = (typeof resourcePermissions)[number];

const elevatedCompanyRoles = new Set(["owner", "admin", "manager"]);

export function resolveScope(access: AccessContext, permissionKey: string): ResourceScope {
  const configured = access.appUser.permissionScopes?.[permissionKey];
  if (configured === "own" || configured === "shared" || configured === "company") {
    return configured;
  }
  return elevatedCompanyRoles.has(access.appUser.role) ? "company" : "own";
}

function grantPermissions(required: ResourcePermission) {
  return required === "VIEW" ? [...resourcePermissions] : [required];
}

export function buildPropertyScopeFilter(
  access: AccessContext,
  permissionKey = "properties.view",
  required: ResourcePermission = "VIEW",
): Prisma.PropertyWhereInput {
  const companyId = access.company.id;
  const scope = resolveScope(access, permissionKey);
  if (scope === "company") return { companyId };
  const owned: Prisma.PropertyWhereInput = { responsibleUserId: access.appUser.id };
  if (scope === "own") return { companyId, ...owned };
  return {
    companyId,
    OR: [
      owned,
      {
        accessGrants: {
          some: {
            companyId,
            userId: access.appUser.id,
            permission: { in: grantPermissions(required) },
          },
        },
      },
    ],
  };
}

export function buildLeadScopeFilter(
  access: AccessContext,
  permissionKey = "crm.view",
  required: ResourcePermission = "VIEW",
): Prisma.LeadWhereInput {
  const companyId = access.company.id;
  const scope = resolveScope(access, permissionKey);
  if (scope === "company") return { companyId };
  const owned: Prisma.LeadWhereInput = { assignedTo: access.appUser.id };
  if (scope === "own") return { companyId, ...owned };
  return {
    companyId,
    OR: [
      owned,
      {
        accessGrants: {
          some: {
            companyId,
            userId: access.appUser.id,
            permission: { in: grantPermissions(required) },
          },
        },
      },
    ],
  };
}

type AuthorizationDatabase = Pick<PrismaClient, "property" | "lead">;

export async function canAccessProperty(
  access: AccessContext,
  propertyId: string,
  permissionKey = "properties.view",
  required: ResourcePermission = "VIEW",
  database: AuthorizationDatabase = getPrisma(),
) {
  return Boolean(
    await database.property.findFirst({
      where: { id: propertyId, AND: [buildPropertyScopeFilter(access, permissionKey, required)] },
      select: { id: true },
    }),
  );
}

export async function canAccessLead(
  access: AccessContext,
  leadId: string,
  permissionKey = "crm.view",
  required: ResourcePermission = "VIEW",
  database: AuthorizationDatabase = getPrisma(),
) {
  return Boolean(
    await database.lead.findFirst({
      where: { id: leadId, AND: [buildLeadScopeFilter(access, permissionKey, required)] },
      select: { id: true },
    }),
  );
}

export async function assertPropertyAccess(
  access: AccessContext,
  propertyId: string,
  permissionKey = "properties.view",
  required: ResourcePermission = "VIEW",
  database: AuthorizationDatabase = getPrisma(),
) {
  if (!(await canAccessProperty(access, propertyId, permissionKey, required, database))) {
    throw resourceNotFound("PROPERTY_NOT_FOUND", "Imóvel não encontrado.");
  }
}

export async function assertLeadAccess(
  access: AccessContext,
  leadId: string,
  permissionKey = "crm.view",
  required: ResourcePermission = "VIEW",
  database: AuthorizationDatabase = getPrisma(),
) {
  if (!(await canAccessLead(access, leadId, permissionKey, required, database))) {
    throw resourceNotFound("LEAD_NOT_FOUND", "Lead não encontrado.");
  }
}

export function canManagePropertySharing(
  access: AccessContext,
  property?: { responsibleUserId: string | null } | null,
) {
  if (!access.appUser.permissions.includes("properties.manage")) return false;
  if (resolveScope(access, "properties.manage") === "company") return true;
  return Boolean(property && property.responsibleUserId === access.appUser.id);
}

// Fase 2.2C — mesma decisão C1 da Fase 2.2B (canManagePropertySharing),
// adaptada para Lead: Owner/Admin/Manager em company scope OU o Broker que
// seja o responsável ATUAL do Lead (assignedTo === appUser.id) podem
// gerenciar o compartilhamento. Um Broker que só recebeu o Lead por
// compartilhamento (mesmo com EDIT/NEGOTIATE) nunca passa aqui — C3 é
// aplicado pela ausência de "responsabilidade" (assignedTo), não por uma
// permissão especial "pode re-compartilhar". `lead` é opcional e
// retrocompatível: chamadas antigas sem o parâmetro continuam avaliando
// apenas o company scope, como antes desta fase.
export function canManageLeadSharing(
  access: AccessContext,
  lead?: { assignedTo: string | null } | null,
) {
  if (!access.appUser.permissions.includes("crm.manage")) return false;
  if (resolveScope(access, "crm.manage") === "company") return true;
  return Boolean(lead && lead.assignedTo === access.appUser.id);
}

function resourceNotFound(code: string, message: string) {
  return Object.assign(new Error(message), { statusCode: 404, code });
}

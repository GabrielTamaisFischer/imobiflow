import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { getWebsiteBuilderPrisma } from "../lib/website-builder-prisma.js";
import { resolveOrCreateBuyerIdentity } from "../services/buyer-registration.js";
import { resolveOrCreateTenantIdentity } from "../services/tenant-registration.js";
import { resolveOrCreateBrokerIdentity } from "../services/broker-registration.js";
import {
  isValidBrazilianDocument,
  normalizeBrazilianDocument,
} from "../services/brazilian-document.js";
import type { RequestWithAccess } from "../types/access.js";

export const registrationsRouter = Router();

registrationsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const baseSchema = z.object({
  name: z.string().trim().min(2).max(180),
  party_type: z.enum(["individual", "company"]).default("individual"),
  document: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().max(180).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});

const buyerSchema = baseSchema.extend({
  interest_json: z.record(z.unknown()).optional(),
  financial_json: z.record(z.unknown()).optional(),
});

const tenantSchema = baseSchema.extend({
  rental_json: z.record(z.unknown()).optional(),
  guarantor_json: z.record(z.unknown()).optional(),
});

const brokerSchema = baseSchema.extend({
  creci_number: z.string().trim().max(40).optional().or(z.literal("")),
  bio_text: z.string().trim().max(4000).optional().or(z.literal("")),
});

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function validateDocument(document: string | undefined, partyType: "individual" | "company") {
  const value = clean(document);
  if (!value) return;
  if (!isValidBrazilianDocument(value, partyType)) {
    throw Object.assign(new Error("CPF/CNPJ inválido."), {
      statusCode: 422,
      code: "INVALID_REGISTRATION_DOCUMENT",
    });
  }
}

function serializeParty(party: any) {
  return {
    id: party.id,
    company_id: party.companyId,
    party_type: party.partyType,
    name: party.name,
    document: party.taxId,
    document_normalized: party.taxIdNormalized,
    email: party.email,
    phone: party.phone,
    whatsapp: party.whatsapp,
    notes: party.notes,
    status: party.status,
    created_at: party.createdAt.toISOString(),
    updated_at: party.updatedAt.toISOString(),
  };
}

function serializeRegistration(row: any) {
  const profile = row.buyerProfile ?? row.tenantProfile ?? row.brokerProfile ?? null;
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    party: serializeParty(row.party),
    profile: profile
      ? {
          id: profile.id,
          ...(row.role === "buyer"
            ? {
                interest_json: profile.interestJson ?? {},
                financial_json: profile.financialJson ?? {},
              }
            : row.role === "tenant"
              ? {
                  rental_json: profile.rentalJson ?? {},
                  guarantor_json: profile.guarantorJson ?? {},
                }
              : {
                  creci_number: profile.creciNumber ?? null,
                  bio_text: profile.bioText ?? null,
                }),
          created_at: profile.createdAt.toISOString(),
          updated_at: profile.updatedAt.toISOString(),
        }
      : null,
    linked_users: (row.party.appUsers ?? []).map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      role: user.role,
    })),
  };
}

async function listRole(companyId: string, role: "buyer" | "tenant" | "broker") {
  const prisma = getWebsiteBuilderPrisma();
  return prisma.partyRole.findMany({
    where: { companyId, role, status: "active", party: { status: "active" } },
    orderBy: [{ party: { name: "asc" } }, { createdAt: "asc" }],
    include: {
      party: {
        include: {
          appUsers: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              status: true,
              role: true,
            },
          },
        },
      },
      buyerProfile: true,
      tenantProfile: true,
      brokerProfile: true,
    },
  });
}

registrationsRouter.get(
  "/buyers",
  requirePermission("crm.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const rows = await listRole(req.access!.company.id, "buyer");
      res.json({ registrations: rows.map(serializeRegistration) });
    } catch (error) {
      next(error);
    }
  },
);

registrationsRouter.post(
  "/buyers",
  requirePermission("crm.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = buyerSchema.parse(req.body);
      validateDocument(input.document, input.party_type);
      const result = await resolveOrCreateBuyerIdentity(
        req.access!.company.id,
        req.access!.appUser.id,
        {
          name: input.name,
          document: clean(input.document),
          partyType: input.party_type,
          email: clean(input.email),
          phone: clean(input.phone),
          whatsapp: clean(input.whatsapp),
          notes: clean(input.notes),
          interestJson: input.interest_json,
          financialJson: input.financial_json,
        },
      );
      const [row] = await listRole(req.access!.company.id, "buyer");
      const exact = await getWebsiteBuilderPrisma().partyRole.findFirst({
        where: { id: result.partyRole.id, companyId: req.access!.company.id },
        include: {
          party: {
            include: {
              appUsers: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  status: true,
                  role: true,
                },
              },
            },
          },
          buyerProfile: true,
          tenantProfile: true,
          brokerProfile: true,
        },
      });
      res.status(result.created.partyRole || result.created.buyerProfile ? 201 : 200).json({
        registration: serializeRegistration(exact ?? row),
      });
    } catch (error) {
      next(error);
    }
  },
);

registrationsRouter.get(
  "/tenants",
  requirePermission("contracts.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const rows = await listRole(req.access!.company.id, "tenant");
      res.json({ registrations: rows.map(serializeRegistration) });
    } catch (error) {
      next(error);
    }
  },
);

registrationsRouter.post(
  "/tenants",
  requirePermission("contracts.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = tenantSchema.parse(req.body);
      validateDocument(input.document, input.party_type);
      const result = await resolveOrCreateTenantIdentity(
        req.access!.company.id,
        req.access!.appUser.id,
        {
          name: input.name,
          document: clean(input.document),
          partyType: input.party_type,
          email: clean(input.email),
          phone: clean(input.phone),
          whatsapp: clean(input.whatsapp),
          notes: clean(input.notes),
          rentalJson: input.rental_json,
          guarantorJson: input.guarantor_json,
        },
      );
      const exact = await getWebsiteBuilderPrisma().partyRole.findFirst({
        where: { id: result.partyRole.id, companyId: req.access!.company.id },
        include: {
          party: {
            include: {
              appUsers: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  status: true,
                  role: true,
                },
              },
            },
          },
          buyerProfile: true,
          tenantProfile: true,
          brokerProfile: true,
        },
      });
      res.status(result.created.partyRole || result.created.tenantProfile ? 201 : 200).json({
        registration: serializeRegistration(exact),
      });
    } catch (error) {
      next(error);
    }
  },
);

registrationsRouter.get(
  "/brokers",
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const rows = await listRole(req.access!.company.id, "broker");
      res.json({ registrations: rows.map(serializeRegistration) });
    } catch (error) {
      next(error);
    }
  },
);

registrationsRouter.post(
  "/brokers",
  requirePermission("users.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = brokerSchema.parse(req.body);
      const result = await resolveOrCreateBrokerIdentity(
        req.access!.company.id,
        req.access!.appUser.id,
        {
          name: input.name,
          document: clean(input.document),
          partyType: input.party_type,
          email: clean(input.email),
          phone: clean(input.phone),
          whatsapp: clean(input.whatsapp),
          notes: clean(input.notes),
          creciNumber: clean(input.creci_number),
          bioText: clean(input.bio_text),
        },
      );
      const exact = await getWebsiteBuilderPrisma().partyRole.findFirst({
        where: { id: result.partyRole.id, companyId: req.access!.company.id },
        include: {
          party: {
            include: {
              appUsers: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  status: true,
                  role: true,
                },
              },
            },
          },
          buyerProfile: true,
          tenantProfile: true,
          brokerProfile: true,
        },
      });
      res.status(result.created.partyRole || result.created.brokerProfile ? 201 : 200).json({
        registration: serializeRegistration(exact),
      });
    } catch (error) {
      next(error);
    }
  },
);

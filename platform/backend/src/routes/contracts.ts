import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { RequestWithAccess } from "../types/access.js";

export const contractsRouter = Router();

contractsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const contractSelect =
  "id, company_id, property_id, lead_id, template_id, contract_number, title, contract_type, status, starts_at, ends_at, total_amount_cents, monthly_amount_cents, deposit_cents, notes, metadata, created_at, updated_at, properties(id, code, title, neighborhood, city, state), contract_parties(id, party_type, name, email, phone, portal_token, portal_enabled)";

const partySelect =
  "id, company_id, contract_id, party_type, name, document, email, phone, signature_required, signature_status, signed_at, portal_token, portal_enabled, portal_last_access_at, created_at, updated_at";

const partySchema = z.object({
  party_type: z
    .enum(["owner", "tenant", "buyer", "seller", "broker", "witness", "company", "other"])
    .default("tenant"),
  name: z.string().min(2).max(180),
  document: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  signature_required: z.boolean().default(true),
});

const contractSchema = z.object({
  property_id: z.string().uuid().optional().or(z.literal("")),
  lead_id: z.string().uuid().optional().or(z.literal("")),
  template_id: z.string().uuid().optional().or(z.literal("")),
  contract_number: z.string().max(80).optional().or(z.literal("")),
  title: z.string().min(2).max(240),
  contract_type: z.enum(["rental", "sale", "management", "service", "other"]).default("rental"),
  status: z
    .enum([
      "draft",
      "generated",
      "sent",
      "waiting_signature",
      "signed",
      "active",
      "cancelled",
      "expired",
      "archived",
    ])
    .default("draft"),
  starts_at: z.string().date().optional().or(z.literal("")),
  ends_at: z.string().date().optional().or(z.literal("")),
  total_amount_cents: z.number().int().nonnegative().optional(),
  monthly_amount_cents: z.number().int().nonnegative().optional(),
  deposit_cents: z.number().int().nonnegative().optional(),
  notes: z.string().max(4000).optional().or(z.literal("")),
  metadata: z.record(z.unknown()).optional(),
  parties: z.array(partySchema).max(12).optional(),
});

const updateContractSchema = contractSchema.omit({ parties: true }).partial();

function cleanEmpty<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? null : value]),
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function ensurePropertyBelongsToCompany(propertyId: string | null, companyId: string) {
  if (!propertyId) return null;

  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Imóvel inválido para esta empresa."), {
      statusCode: 422,
      code: "INVALID_PROPERTY",
    });
  }

  return data.id;
}

async function ensureLeadBelongsToCompany(leadId: string | null, companyId: string) {
  if (!leadId) return null;

  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Lead inválido para esta empresa."), {
      statusCode: 422,
      code: "INVALID_LEAD",
    });
  }

  return data.id;
}

async function ensureTemplateBelongsToCompany(templateId: string | null, companyId: string) {
  if (!templateId) return null;

  const { data, error } = await supabaseAdmin
    .from("contract_templates")
    .select("id")
    .eq("id", templateId)
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Modelo de contrato inválido para esta empresa."), {
      statusCode: 422,
      code: "INVALID_CONTRACT_TEMPLATE",
    });
  }

  return data.id;
}

async function ensureContractBelongsToCompany(contractId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("contracts")
    .select("id")
    .eq("id", contractId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Contrato não encontrado para esta empresa."), {
      statusCode: 404,
      code: "CONTRACT_NOT_FOUND",
    });
  }

  return data.id;
}

contractsRouter.get(
  "/",
  requirePermission("contracts.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;

      let query = supabaseAdmin
        .from("contracts")
        .select(contractSelect)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) throw error;

      res.json({ contracts: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

contractsRouter.post(
  "/",
  requirePermission("contracts.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = contractSchema.parse(req.body);
      const propertyId = await ensurePropertyBelongsToCompany(input.property_id || null, companyId);
      const leadId = await ensureLeadBelongsToCompany(input.lead_id || null, companyId);
      const templateId = await ensureTemplateBelongsToCompany(input.template_id || null, companyId);
      const { parties = [], ...contractInput } = input;

      const { data: contract, error } = await supabaseAdmin
        .from("contracts")
        .insert({
          ...cleanEmpty(contractInput),
          property_id: propertyId,
          lead_id: leadId,
          template_id: templateId,
          company_id: companyId,
          created_by: userId,
        })
        .select(contractSelect)
        .single();

      if (error) throw error;

      if (parties.length > 0) {
        const { error: partiesError } = await supabaseAdmin.from("contract_parties").insert(
          parties.map((party) => ({
            ...cleanEmpty(party),
            company_id: companyId,
            contract_id: contract.id,
            signature_status: party.signature_required === false ? "not_required" : "pending",
          })),
        );

        if (partiesError) throw partiesError;
      }

      const { data: contractParties, error: partiesFetchError } = await supabaseAdmin
        .from("contract_parties")
        .select(partySelect)
        .eq("company_id", companyId)
        .eq("contract_id", contract.id)
        .order("created_at", { ascending: true });

      if (partiesFetchError) throw partiesFetchError;

      res.status(201).json({ contract, parties: contractParties ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

contractsRouter.get(
  "/:id",
  requirePermission("contracts.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const contractId = readParam(req.params.id);

      if (!contractId) {
        return res.status(404).json({
          error: "CONTRACT_NOT_FOUND",
          message: "Contrato não encontrado.",
        });
      }

      const { data: contract, error } = await supabaseAdmin
        .from("contracts")
        .select(contractSelect)
        .eq("id", contractId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (error) throw error;
      if (!contract) {
        return res.status(404).json({
          error: "CONTRACT_NOT_FOUND",
          message: "Contrato não encontrado.",
        });
      }

      const { data: parties, error: partiesError } = await supabaseAdmin
        .from("contract_parties")
        .select(partySelect)
        .eq("contract_id", contractId)
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });

      if (partiesError) throw partiesError;

      res.json({ contract, parties: parties ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

contractsRouter.patch(
  "/:id",
  requirePermission("contracts.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const contractId = readParam(req.params.id);
      const input = updateContractSchema.parse(req.body);
      const propertyId = await ensurePropertyBelongsToCompany(input.property_id || null, companyId);
      const leadId = await ensureLeadBelongsToCompany(input.lead_id || null, companyId);
      const templateId = await ensureTemplateBelongsToCompany(input.template_id || null, companyId);

      if (!contractId) {
        return res.status(404).json({
          error: "CONTRACT_NOT_FOUND",
          message: "Contrato não encontrado.",
        });
      }

      const { data: contract, error } = await supabaseAdmin
        .from("contracts")
        .update({
          ...cleanEmpty(input),
          ...(input.property_id !== undefined ? { property_id: propertyId } : {}),
          ...(input.lead_id !== undefined ? { lead_id: leadId } : {}),
          ...(input.template_id !== undefined ? { template_id: templateId } : {}),
        })
        .eq("id", contractId)
        .eq("company_id", companyId)
        .select(contractSelect)
        .single();

      if (error) throw error;

      res.json({ contract });
    } catch (error) {
      next(error);
    }
  },
);

contractsRouter.post(
  "/:id/parties",
  requirePermission("contracts.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const contractId = readParam(req.params.id);
      const input = partySchema.parse(req.body);

      if (!contractId) {
        return res.status(404).json({
          error: "CONTRACT_NOT_FOUND",
          message: "Contrato não encontrado.",
        });
      }

      await ensureContractBelongsToCompany(contractId, companyId);

      const { data: party, error } = await supabaseAdmin
        .from("contract_parties")
        .insert({
          ...cleanEmpty(input),
          company_id: companyId,
          contract_id: contractId,
          signature_status: input.signature_required === false ? "not_required" : "pending",
        })
        .select(partySelect)
        .single();

      if (error) throw error;

      res.status(201).json({ party });
    } catch (error) {
      next(error);
    }
  },
);

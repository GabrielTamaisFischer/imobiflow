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

export const rentalsRouter = Router();

rentalsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const rentalSelect =
  "id, company_id, contract_id, property_id, owner_id, tenant_party_id, lead_id, status, starts_at, ends_at, monthly_amount_cents, condominium_fee_cents, iptu_cents, insurance_cents, due_day, adjustment_index, guarantee_type, commission_type, commission_rate, commission_fixed_cents, operational_fee_cents, operational_fee_payer, preferred_payment_method, last_charge_due_date, next_charge_due_date, notes, metadata, created_at, updated_at, properties(id, title, code, status), property_owners(id, name, email, phone, whatsapp), contract_parties(id, name, document, email, phone), contracts(id, title, contract_number, status)";

const rentalSchema = z.object({
  property_id: z.string().uuid(),
  owner_id: z.string().uuid().optional().nullable().or(z.literal("")),
  lead_id: z.string().uuid().optional().nullable().or(z.literal("")),
  tenant_name: z.string().trim().min(2).max(180),
  tenant_document: z.string().trim().max(40).optional().or(z.literal("")),
  tenant_email: z.string().trim().email().optional().or(z.literal("")),
  tenant_phone: z.string().trim().max(40).optional().or(z.literal("")),
  starts_at: z.string().date(),
  ends_at: z.string().date().optional().nullable().or(z.literal("")),
  monthly_amount_cents: z.coerce.number().int().min(0),
  condominium_fee_cents: z.coerce.number().int().min(0).default(0),
  iptu_cents: z.coerce.number().int().min(0).default(0),
  insurance_cents: z.coerce.number().int().min(0).default(0),
  due_day: z.coerce.number().int().min(1).max(31),
  adjustment_index: z.string().trim().max(40).default("ipca"),
  guarantee_type: z.string().trim().max(80).optional().or(z.literal("")),
  commission_type: z.enum(["percentage", "fixed"]).default("percentage"),
  commission_rate: z.coerce.number().min(0).max(100).default(10),
  commission_fixed_cents: z.coerce.number().int().min(0).default(0),
  operational_fee_cents: z.coerce.number().int().min(0).default(0),
  operational_fee_payer: z.enum(["company", "tenant", "owner"]).default("company"),
  preferred_payment_method: z.enum(["pix", "boleto", "hybrid", "manual"]).default("pix"),
  generate_first_charge: z.boolean().default(true),
  first_due_date: z.string().date().optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(1200).optional().or(z.literal("")),
});

const rentalChargeSchema = z.object({
  due_date: z.string().date().optional().or(z.literal("")),
  notes: z.string().trim().max(1200).optional().or(z.literal("")),
});

const dueChargeBatchSchema = z.object({
  until_date: z.string().date().optional().or(z.literal("")),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type RentalForCharge = {
  id: string;
  company_id: string;
  contract_id: string;
  property_id: string;
  owner_id: string | null;
  tenant_party_id: string | null;
  status: string;
  starts_at: string;
  ends_at: string | null;
  monthly_amount_cents: number;
  condominium_fee_cents: number;
  iptu_cents: number;
  insurance_cents: number;
  due_day: number;
  commission_type: "percentage" | "fixed";
  commission_rate: number;
  commission_fixed_cents: number;
  operational_fee_cents: number;
  operational_fee_payer: "company" | "tenant" | "owner";
  preferred_payment_method: "pix" | "boleto" | "hybrid" | "manual";
  next_charge_due_date: string | null;
};

rentalsRouter.get(
  "/",
  requirePermission("rentals.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const status = readQuery(req.query.status);

      let query = supabaseAdmin
        .from("rental_agreements")
        .select(rentalSelect)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);

      const { data, error } = await query.limit(300);
      if (error) throw error;

      res.json({ rentals: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

rentalsRouter.post(
  "/",
  requirePermission("rentals.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = rentalSchema.parse(req.body);
      const property = await ensureProperty(input.property_id, companyId);
      const ownerId = nullable(input.owner_id) ?? property.owner_id;

      if (ownerId) await ensureOwner(ownerId, companyId);
      const leadId = await ensureLinkedRecord("leads", nullable(input.lead_id), companyId);

      const { data: contract, error: contractError } = await supabaseAdmin
        .from("contracts")
        .insert({
          company_id: companyId,
          property_id: property.id,
          lead_id: leadId,
          created_by: userId,
          title: `Locacao - ${property.title}`,
          contract_type: "rental",
          status: "active",
          starts_at: input.starts_at,
          ends_at: nullable(input.ends_at),
          monthly_amount_cents: input.monthly_amount_cents,
          total_amount_cents: input.monthly_amount_cents,
          commission_type: input.commission_type,
          commission_rate: input.commission_rate,
          commission_fixed_cents: input.commission_fixed_cents,
          operational_fee_cents: input.operational_fee_cents,
          operational_fee_payer: input.operational_fee_payer === "owner" ? "company" : input.operational_fee_payer,
          billing_day: input.due_day,
          preferred_payment_method: input.preferred_payment_method,
          auto_generate_charges: true,
          notes: input.notes || null,
          metadata: {
            source: "rental_agreement",
            tenant_name: input.tenant_name,
            adjustment_index: input.adjustment_index,
            guarantee_type: input.guarantee_type || null,
            operational_fee_payer_requested: input.operational_fee_payer,
          },
        })
        .select("id, title, status")
        .single<{ id: string; title: string; status: string }>();

      if (contractError) throw contractError;

      if (ownerId) {
        await createOwnerContractParty({
          companyId,
          contractId: contract.id,
          ownerId,
        });
      }

      const tenantParty = await createTenantContractParty({
        companyId,
        contractId: contract.id,
        input,
      });

      const firstDueDate = nullable(input.first_due_date) ?? buildDueDate(input.starts_at, input.due_day);
      const { data: rental, error: rentalError } = await supabaseAdmin
        .from("rental_agreements")
        .insert({
          company_id: companyId,
          contract_id: contract.id,
          property_id: property.id,
          owner_id: ownerId,
          tenant_party_id: tenantParty.id,
          lead_id: leadId,
          created_by: userId,
          status: "active",
          starts_at: input.starts_at,
          ends_at: nullable(input.ends_at),
          monthly_amount_cents: input.monthly_amount_cents,
          condominium_fee_cents: input.condominium_fee_cents,
          iptu_cents: input.iptu_cents,
          insurance_cents: input.insurance_cents,
          due_day: input.due_day,
          adjustment_index: input.adjustment_index,
          guarantee_type: input.guarantee_type || null,
          commission_type: input.commission_type,
          commission_rate: input.commission_rate,
          commission_fixed_cents: input.commission_fixed_cents,
          operational_fee_cents: input.operational_fee_cents,
          operational_fee_payer: input.operational_fee_payer,
          preferred_payment_method: input.preferred_payment_method,
          next_charge_due_date: firstDueDate,
          notes: input.notes || null,
          metadata: { first_due_date: firstDueDate },
        })
        .select(rentalSelect)
        .single();

      if (rentalError) throw rentalError;

      await supabaseAdmin
        .from("properties")
        .update({ status: "rented" })
        .eq("id", property.id)
        .eq("company_id", companyId);

      await createRentalEvent({
        companyId,
        rentalId: rental.id,
        userId,
        eventType: "rental.created",
        payload: {
          contract_id: contract.id,
          property_id: property.id,
          tenant_party_id: tenantParty.id,
          first_due_date: firstDueDate,
        },
      });

      let charge: unknown = null;
      if (input.generate_first_charge) {
        charge = await createRentalCharge({
          companyId,
          userId,
          rentalId: rental.id,
          contractId: contract.id,
          propertyId: property.id,
          ownerId,
          tenantPartyId: tenantParty.id,
          dueDate: firstDueDate,
          rentAmountCents: input.monthly_amount_cents,
          additionalAmountCents:
            input.condominium_fee_cents + input.iptu_cents + input.insurance_cents,
          paymentMethod: input.preferred_payment_method,
          feeAmountCents: input.operational_fee_cents,
          feePayer: input.operational_fee_payer,
          commissionType: input.commission_type,
          commissionRate: input.commission_rate,
          commissionFixedCents: input.commission_fixed_cents,
          notes: input.notes || null,
        });

        const nextDueDate = addMonthsToDueDate(firstDueDate, input.due_day, 1);
        await supabaseAdmin
          .from("rental_agreements")
          .update({
            last_charge_due_date: firstDueDate,
            next_charge_due_date: nextDueDate,
          })
          .eq("id", rental.id)
          .eq("company_id", companyId);
      }

      res.status(201).json({ rental, contract, charge });
    } catch (error) {
      next(error);
    }
  },
);

rentalsRouter.post(
  "/generate-due-charges",
  requirePermission("rentals.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = dueChargeBatchSchema.parse(req.body ?? {});
      const untilDate = input.until_date || new Date().toISOString().slice(0, 10);

      const { data: rentals, error } = await supabaseAdmin
        .from("rental_agreements")
        .select(
          "id, company_id, contract_id, property_id, owner_id, tenant_party_id, status, starts_at, ends_at, monthly_amount_cents, condominium_fee_cents, iptu_cents, insurance_cents, due_day, commission_type, commission_rate, commission_fixed_cents, operational_fee_cents, operational_fee_payer, preferred_payment_method, next_charge_due_date",
        )
        .eq("company_id", companyId)
        .eq("status", "active")
        .not("next_charge_due_date", "is", null)
        .lte("next_charge_due_date", untilDate)
        .order("next_charge_due_date", { ascending: true })
        .limit(input.limit)
        .returns<RentalForCharge[]>();

      if (error) throw error;

      const generated: unknown[] = [];
      const skipped: Array<{ rental_id: string; reason: string }> = [];

      for (const rental of rentals ?? []) {
        const dueDate = rental.next_charge_due_date;
        if (!dueDate) {
          skipped.push({ rental_id: rental.id, reason: "Sem proximo vencimento." });
          continue;
        }

        const result = await generateChargeForRental({ rental, companyId, userId, dueDate });
        if (result.skipped) {
          skipped.push({ rental_id: rental.id, reason: result.reason });
        } else {
          generated.push(result.charge);
        }
      }

      res.json({ generated, skipped, until_date: untilDate });
    } catch (error) {
      next(error);
    }
  },
);

rentalsRouter.post(
  "/:id/generate-charge",
  requirePermission("rentals.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const rentalId = readParam(req.params.id);
      const input = rentalChargeSchema.parse(req.body ?? {});
      const rental = await ensureRentalForCharge(rentalId, companyId);
      const dueDate = input.due_date || rental.next_charge_due_date || buildDueDate(new Date().toISOString().slice(0, 10), rental.due_day);
      const result = await generateChargeForRental({
        rental,
        companyId,
        userId,
        dueDate,
        notes: input.notes || null,
      });

      if (result.skipped) {
        return res.status(409).json({
          error: "RENTAL_CHARGE_ALREADY_EXISTS",
          message: result.reason,
        });
      }

      res.status(201).json({ charge: result.charge, rental: result.rental });
    } catch (error) {
      next(error);
    }
  },
);

async function ensureProperty(propertyId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("id, company_id, owner_id, title, status, rent_price_cents")
    .eq("id", propertyId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string;
      owner_id: string | null;
      title: string;
      status: string;
      rent_price_cents: number | null;
    }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Imovel nao encontrado para esta empresa."), {
      statusCode: 404,
      code: "PROPERTY_NOT_FOUND",
    });
  }

  if (data.status === "rented") {
    throw Object.assign(new Error("Este imovel ja esta marcado como alugado."), {
      statusCode: 409,
      code: "PROPERTY_ALREADY_RENTED",
    });
  }

  return data;
}

async function ensureOwner(ownerId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("property_owners")
    .select("id")
    .eq("id", ownerId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Proprietario nao encontrado para esta empresa."), {
      statusCode: 422,
      code: "OWNER_NOT_FOUND",
    });
  }

  return data.id;
}

async function createOwnerContractParty(input: {
  companyId: string;
  contractId: string;
  ownerId: string;
}) {
  const { data: owner, error: ownerError } = await supabaseAdmin
    .from("property_owners")
    .select("name, document, email, phone")
    .eq("id", input.ownerId)
    .eq("company_id", input.companyId)
    .single<{ name: string; document: string | null; email: string | null; phone: string | null }>();

  if (ownerError) throw ownerError;

  const { error } = await supabaseAdmin.from("contract_parties").insert({
    company_id: input.companyId,
    contract_id: input.contractId,
    party_type: "owner",
    name: owner.name,
    document: owner.document,
    email: owner.email,
    phone: owner.phone,
    signature_required: true,
  });

  if (error) throw error;
}

async function createTenantContractParty(input: {
  companyId: string;
  contractId: string;
  input: z.infer<typeof rentalSchema>;
}) {
  const { data, error } = await supabaseAdmin
    .from("contract_parties")
    .insert({
      company_id: input.companyId,
      contract_id: input.contractId,
      party_type: "tenant",
      name: input.input.tenant_name,
      document: input.input.tenant_document || null,
      email: input.input.tenant_email || null,
      phone: input.input.tenant_phone || null,
      signature_required: true,
    })
    .select("id, name")
    .single<{ id: string; name: string }>();

  if (error) throw error;
  return data;
}

async function ensureRentalForCharge(rentalId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("rental_agreements")
    .select(
      "id, company_id, contract_id, property_id, owner_id, tenant_party_id, status, starts_at, ends_at, monthly_amount_cents, condominium_fee_cents, iptu_cents, insurance_cents, due_day, commission_type, commission_rate, commission_fixed_cents, operational_fee_cents, operational_fee_payer, preferred_payment_method, next_charge_due_date",
    )
    .eq("id", rentalId)
    .eq("company_id", companyId)
    .maybeSingle<RentalForCharge>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Locacao nao encontrada para esta empresa."), {
      statusCode: 404,
      code: "RENTAL_NOT_FOUND",
    });
  }

  if (!["active", "pending_signature"].includes(data.status)) {
    throw Object.assign(new Error("A locacao precisa estar ativa para gerar cobranca."), {
      statusCode: 422,
      code: "RENTAL_NOT_ACTIVE",
    });
  }

  return data;
}

async function generateChargeForRental(input: {
  rental: RentalForCharge;
  companyId: string;
  userId: string;
  dueDate: string;
  notes?: string | null;
}) {
  const duplicate = await findExistingRentalCharge({
    companyId: input.companyId,
    rentalId: input.rental.id,
    dueDate: input.dueDate,
  });

  if (duplicate) {
    return {
      skipped: true as const,
      reason: `Ja existe cobranca ativa para o vencimento ${input.dueDate}.`,
    };
  }

  const charge = await createRentalCharge({
    companyId: input.companyId,
    userId: input.userId,
    rentalId: input.rental.id,
    contractId: input.rental.contract_id,
    propertyId: input.rental.property_id,
    ownerId: input.rental.owner_id,
    tenantPartyId: input.rental.tenant_party_id,
    dueDate: input.dueDate,
    rentAmountCents: input.rental.monthly_amount_cents,
    additionalAmountCents:
      input.rental.condominium_fee_cents +
      input.rental.iptu_cents +
      input.rental.insurance_cents,
    paymentMethod: input.rental.preferred_payment_method,
    feeAmountCents: input.rental.operational_fee_cents,
    feePayer: input.rental.operational_fee_payer,
    commissionType: input.rental.commission_type,
    commissionRate: input.rental.commission_rate,
    commissionFixedCents: input.rental.commission_fixed_cents,
    notes: input.notes ?? null,
  });

  const nextDueDate = addMonthsToDueDate(input.dueDate, input.rental.due_day, 1);
  const { data: rental, error } = await supabaseAdmin
    .from("rental_agreements")
    .update({
      last_charge_due_date: input.dueDate,
      next_charge_due_date: nextDueDate,
    })
    .eq("id", input.rental.id)
    .eq("company_id", input.companyId)
    .select(rentalSelect)
    .single();

  if (error) throw error;

  await createRentalEvent({
    companyId: input.companyId,
    rentalId: input.rental.id,
    userId: input.userId,
    eventType: "rental.charge_generated",
    payload: {
      charge_id: "id" in charge ? charge.id : null,
      due_date: input.dueDate,
      next_due_date: nextDueDate,
    },
  });

  return { skipped: false as const, charge, rental };
}

async function findExistingRentalCharge(input: {
  companyId: string;
  rentalId: string;
  dueDate: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("financial_charges")
    .select("id, status")
    .eq("company_id", input.companyId)
    .eq("rental_id", input.rentalId)
    .eq("due_date", input.dueDate)
    .not("status", "in", "(cancelled,refunded)")
    .maybeSingle<{ id: string; status: string }>();

  if (error) throw error;
  return data ?? null;
}

async function createRentalCharge(input: {
  companyId: string;
  userId: string;
  rentalId: string;
  contractId: string;
  propertyId: string;
  ownerId: string | null;
  tenantPartyId: string | null;
  dueDate: string;
  rentAmountCents: number;
  additionalAmountCents: number;
  paymentMethod: "pix" | "boleto" | "hybrid" | "manual";
  feeAmountCents: number;
  feePayer: "company" | "tenant" | "owner";
  commissionType: "percentage" | "fixed";
  commissionRate: number;
  commissionFixedCents: number;
  notes: string | null;
}) {
  const commissionAmount = calculateCommission(
    input.rentAmountCents,
    input.commissionType,
    input.commissionRate,
    input.commissionFixedCents,
  );
  const baseAmount = input.rentAmountCents + input.additionalAmountCents;
  const grossAmount =
    baseAmount + (input.feePayer === "tenant" ? input.feeAmountCents : 0);
  const netOwnerAmount = Math.max(
    0,
    baseAmount -
      commissionAmount -
      (input.feePayer === "owner" || input.feePayer === "company" ? input.feeAmountCents : 0),
  );

  const { data: entry, error: entryError } = await supabaseAdmin
    .from("financial_entries")
    .insert({
      company_id: input.companyId,
      rental_id: input.rentalId,
      contract_id: input.contractId,
      property_id: input.propertyId,
      owner_id: input.ownerId,
      created_by: input.userId,
      title: `Aluguel ${formatDueMonth(input.dueDate)}`,
      description: input.notes,
      entry_type: "income",
      category: "rent",
      status: "open",
      amount_cents: grossAmount,
      due_date: input.dueDate,
      competence_date: input.dueDate,
      payment_method: input.paymentMethod,
      metadata: {
        source: "rental_agreement",
        rental_id: input.rentalId,
        rent_amount_cents: input.rentAmountCents,
        additional_amount_cents: input.additionalAmountCents,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (entryError) throw entryError;

  const { data: charge, error: chargeError } = await supabaseAdmin
    .from("financial_charges")
    .insert({
      company_id: input.companyId,
      rental_id: input.rentalId,
      contract_id: input.contractId,
      property_id: input.propertyId,
      owner_id: input.ownerId,
      tenant_party_id: input.tenantPartyId,
      entry_id: entry.id,
      payment_method: input.paymentMethod,
      gross_amount_cents: grossAmount,
      base_rent_amount_cents: input.rentAmountCents,
      fee_amount_cents: input.feeAmountCents,
      fee_payer: input.feePayer === "owner" ? "company" : input.feePayer,
      commission_amount_cents: commissionAmount,
      net_owner_amount_cents: netOwnerAmount,
      due_date: input.dueDate,
      status: input.paymentMethod === "manual" ? "pending" : "waiting_payment",
      created_by: input.userId,
      metadata: {
        source: "rental_agreement",
        rental_id: input.rentalId,
        additional_amount_cents: input.additionalAmountCents,
        fee_payer_requested: input.feePayer,
        provider_status: "not_sent_to_gateway",
      },
    })
    .select("id, status, gross_amount_cents, due_date")
    .single();

  if (chargeError) throw chargeError;
  return charge;
}

async function createRentalEvent(input: {
  companyId: string;
  rentalId: string;
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("rental_events").insert({
    company_id: input.companyId,
    rental_id: input.rentalId,
    user_id: input.userId,
    event_type: input.eventType,
    payload: input.payload,
  });

  if (error) throw error;
}

async function ensureLinkedRecord(
  table: "leads",
  id: string | null,
  companyId: string,
) {
  if (!id) return null;

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Registro vinculado invalido para esta empresa."), {
      statusCode: 422,
      code: "LINKED_RECORD_NOT_FOUND",
    });
  }

  return data.id;
}

function nullable(value: string | null | undefined) {
  return value && value.length > 0 ? value : null;
}

function readQuery(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readParam(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    throw Object.assign(new Error("Parametro de rota invalido."), { statusCode: 400 });
  }

  return value;
}

function buildDueDate(startDate: string, dueDay: number) {
  const [year, month, day] = startDate.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, Math.min(dueDay, 28)));
  if (day > dueDay) base.setUTCMonth(base.getUTCMonth() + 1);
  return base.toISOString().slice(0, 10);
}

function addMonthsToDueDate(dueDate: string, dueDay: number, months: number) {
  const [year, month] = dueDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, Math.min(dueDay, 28)));
  return date.toISOString().slice(0, 10);
}

function formatDueMonth(dueDate: string) {
  const [year, month] = dueDate.split("-");
  return `${month}/${year}`;
}

function calculateCommission(
  baseAmountCents: number,
  type: "percentage" | "fixed",
  rate: number,
  fixedCents: number,
) {
  if (type === "fixed") return Math.max(0, fixedCents);
  return Math.round(baseAmountCents * (rate / 100));
}

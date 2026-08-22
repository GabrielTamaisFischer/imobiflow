import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { env } from "../config/env.js";
import {
  issueGatewayCharge,
  syncGatewayCustomer,
  type GatewayAccountForIssue,
  type GatewayCustomerParty,
} from "../services/payment-gateways.js";
import { recordUsageEvent } from "../services/usage-costs.js";
import { dispatchEventSelect } from "../services/notification-dispatcher.js";
import type { RequestWithAccess } from "../types/access.js";

export const financeRouter = Router();

financeRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const entrySelect =
  "id, company_id, contract_id, property_id, owner_id, lead_id, title, description, entry_type, category, status, amount_cents, due_date, paid_at, competence_date, payment_method, notes, metadata, created_at, updated_at, contracts(id, title, contract_number), properties(id, code, title)";

const paymentSelect =
  "id, company_id, entry_id, account_id, amount_cents, payment_method, paid_at, notes, created_at";

const chargeSelect =
  "id, company_id, contract_id, property_id, owner_id, tenant_party_id, entry_id, gateway_account_id, gateway_charge_id, payment_method, gross_amount_cents, base_rent_amount_cents, fee_amount_cents, fee_payer, fee_acceptance_required, fee_acceptance_confirmed, fee_acceptance_json, commission_amount_cents, net_owner_amount_cents, due_date, paid_at, status, pix_qr_code, pix_copy_paste, boleto_barcode, boleto_digitable_line, payment_url, boleto_pdf_url, metadata, created_at, updated_at, contracts(id, title, contract_number), properties(id, code, title)";

const gatewayAccountSelect =
  "id, company_id, provider, name, status, credentials_ref, webhook_secret_ref, settings, created_at, updated_at";

const ownerTransferSelect =
  "id, company_id, charge_id, contract_id, owner_id, property_id, gross_amount_cents, deductions_cents, net_amount_cents, status, due_date, paid_at, payment_method, receipt_url, receipt_reference, gateway_transfer_id, notes, metadata, created_at, updated_at, contracts(id, title, contract_number), properties(id, code, title), property_owners(id, name)";

const financialWebhookSelect =
  "id, company_id, charge_id, provider, event_type, gateway_event_id, gateway_charge_id, status_before, status_after, gross_amount_cents, net_amount_cents, payment_method, paid_at, raw_payload, processed_at, error_message, metadata, created_at";

const financialAuditSelect =
  "id, company_id, charge_id, entry_id, contract_id, owner_id, user_id, event_type, gateway_event_id, gateway_charge_id, gross_amount_cents, net_amount_cents, commission_amount_cents, fee_amount_cents, status_before, status_after, metadata, created_at";

const financialOperationActionSelect =
  "id, company_id, charge_id, webhook_event_id, owner_transfer_id, action_type, title, description, status, due_at, resolved_at, resolved_by, created_by, metadata, created_at, updated_at";

const entrySchema = z.object({
  contract_id: z.string().uuid().optional().or(z.literal("")),
  property_id: z.string().uuid().optional().or(z.literal("")),
  owner_id: z.string().uuid().optional().or(z.literal("")),
  lead_id: z.string().uuid().optional().or(z.literal("")),
  title: z.string().min(2).max(240),
  description: z.string().max(4000).optional().or(z.literal("")),
  entry_type: z.enum(["income", "expense"]).default("income"),
  category: z.string().max(120).optional().or(z.literal("")),
  status: z.enum(["draft", "open", "paid", "overdue", "cancelled", "archived"]).default("open"),
  amount_cents: z.number().int().nonnegative(),
  due_date: z.string().date().optional().or(z.literal("")),
  competence_date: z.string().date().optional().or(z.literal("")),
  payment_method: z.string().max(80).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
  metadata: z.record(z.unknown()).optional(),
});

const paymentSchema = z.object({
  account_id: z.string().uuid().optional().or(z.literal("")),
  amount_cents: z.number().int().positive().optional(),
  payment_method: z.string().max(80).optional().or(z.literal("")),
  paid_at: z.string().datetime().optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
});

const chargeFromContractSchema = z.object({
  contract_id: z.string().uuid(),
  due_date: z.string().date(),
  payment_method: z.enum(["pix", "boleto", "hybrid", "manual"]).default("pix"),
  base_amount_cents: z.number().int().positive().optional(),
  fee_amount_cents: z.number().int().nonnegative().optional(),
  fee_payer: z.enum(["company", "tenant", "owner"]).optional(),
  fee_acceptance_confirmed: z.boolean().optional(),
  fee_acceptance_reference: z.string().max(240).optional().or(z.literal("")),
  commission_type: z.enum(["percentage", "fixed"]).optional(),
  commission_rate: z.number().nonnegative().max(100).optional(),
  commission_fixed_cents: z.number().int().nonnegative().optional(),
  notes: z.string().max(4000).optional().or(z.literal("")),
});

const chargePaymentSchema = z.object({
  paid_at: z.string().datetime().optional().or(z.literal("")),
  payment_method: z.string().max(80).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
});

const chargeNotificationSchema = z.object({
  notification_type: z
    .enum(["charge_created", "charge_due_reminder", "charge_overdue_notice", "charge_payment_confirmed"])
    .default("charge_due_reminder"),
  channel: z.enum(["email", "whatsapp"]).default("whatsapp"),
});

const ownerTransferPaymentSchema = z.object({
  paid_at: z.string().datetime().optional().or(z.literal("")),
  payment_method: z.string().max(80).optional().or(z.literal("")),
  receipt_url: z.string().url().optional().or(z.literal("")),
  receipt_reference: z.string().max(240).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
});

const ownerTransferNotificationSchema = z.object({
  notification_type: z
    .enum(["owner_transfer_calculated", "owner_transfer_pending", "owner_transfer_paid"])
    .default("owner_transfer_pending"),
  channel: z.enum(["email", "whatsapp"]).default("whatsapp"),
});

const financialOperationActionSchema = z.object({
  reason: z.string().max(700).optional().or(z.literal("")),
  due_at: z.string().datetime().optional().or(z.literal("")),
});

const financialOperationActionUpdateSchema = z.object({
  reason: z.string().max(700).optional().or(z.literal("")),
});

const gatewayAccountSchema = z.object({
  provider: z
    .enum(["pjbank", "asaas", "iugu", "mercado_pago", "stripe", "manual", "other"])
    .default("asaas"),
  name: z.string().min(2).max(160),
  status: z.enum(["active", "inactive", "testing", "blocked", "archived"]).default("testing"),
  credentials_ref: z.string().max(240).optional().or(z.literal("")),
  webhook_secret_ref: z.string().max(240).optional().or(z.literal("")),
  settings: z
    .object({
      environment: z.enum(["sandbox", "production"]).default("sandbox"),
      default_payment_method: z.enum(["pix", "boleto", "hybrid"]).default("pix"),
      enable_real_api: z.boolean().optional().default(false),
      default_customer_id: z.string().max(120).optional().or(z.literal("")),
      webhook_url: z.string().url().optional().or(z.literal("")),
      notes: z.string().max(1000).optional().or(z.literal("")),
    })
    .default({
      environment: "sandbox",
      default_payment_method: "pix",
    }),
});

type ChargeContract = {
  id: string;
  company_id: string;
  property_id: string | null;
  title: string;
  contract_number: string | null;
  contract_type: string;
  status: string;
  monthly_amount_cents: number | null;
  total_amount_cents: number | null;
  commission_type?: "percentage" | "fixed";
  commission_rate?: number | null;
  commission_fixed_cents?: number | null;
  operational_fee_cents?: number | null;
  operational_fee_payer?: "company" | "tenant" | "owner" | null;
  operational_fee_requires_acceptance?: boolean | null;
  operational_fee_acceptance_json?: Record<string, unknown> | null;
  transfer_day_offset?: number | null;
  preferred_payment_method?: "pix" | "boleto" | "hybrid" | "manual" | null;
  properties?:
    | { id: string; owner_id: string | null; title: string }
    | Array<{ id: string; owner_id: string | null; title: string }>
    | null;
};

type FinancialChargeStatus =
  | "pending"
  | "waiting_payment"
  | "processing"
  | "waiting_compensation"
  | "paid"
  | "overdue"
  | "cancelled"
  | "refunded"
  | "failed"
  | "disputed"
  | "transfer_pending"
  | "transferred";

function cleanEmpty<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? null : value]),
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function calculateCommission(
  baseAmountCents: number,
  type: "percentage" | "fixed",
  rate?: number | null,
  fixedCents?: number | null,
) {
  if (type === "fixed") return Math.max(0, fixedCents ?? 0);
  return Math.round(baseAmountCents * ((rate ?? 0) / 100));
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function chargeInitialStatus(paymentMethod: string) {
  return paymentMethod === "manual" ? "pending" : "waiting_payment";
}

function buildChargeMetadata(input: {
  tenant?: {
    id: string;
    name: string;
    document: string | null;
    email: string | null;
    gateway_provider?: string | null;
    gateway_customer_id?: string | null;
    gateway_customer_status?: string | null;
  } | null;
  notes?: string | null;
}) {
  return {
    tenant: input.tenant
      ? {
          id: input.tenant.id,
          name: input.tenant.name,
          document: input.tenant.document,
          email: input.tenant.email,
          gateway_provider: input.tenant.gateway_provider ?? null,
          gateway_customer_id: input.tenant.gateway_customer_id ?? null,
          gateway_customer_status: input.tenant.gateway_customer_status ?? null,
        }
      : null,
    notes: input.notes || null,
    provider_status: "not_sent_to_gateway",
  };
}

function sumCents<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce((sum, row) => {
    const value = row[key];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

function hasGatewayIssue(charge: {
  status: string;
  payment_method: string;
  gateway_charge_id: string | null;
  metadata: Record<string, unknown>;
}) {
  const gatewayIssueReview =
    charge.metadata &&
    typeof charge.metadata.gateway_issue_review === "object" &&
    charge.metadata.gateway_issue_review !== null
      ? (charge.metadata.gateway_issue_review as { status?: unknown })
      : null;

  if (gatewayIssueReview?.status === "resolved") return false;

  if (["failed", "disputed"].includes(charge.status)) return true;
  if (
    charge.payment_method !== "manual" &&
    !charge.gateway_charge_id &&
    ["pending", "waiting_payment", "processing"].includes(charge.status)
  ) {
    return true;
  }

  const gatewayIssue =
    charge.metadata && typeof charge.metadata.gateway_issue === "object" && charge.metadata.gateway_issue !== null
      ? (charge.metadata.gateway_issue as { status?: unknown; provider_error?: unknown })
      : null;
  const gatewayCustomerSync =
    charge.metadata &&
    typeof charge.metadata.gateway_customer_sync === "object" &&
    charge.metadata.gateway_customer_sync !== null
      ? (charge.metadata.gateway_customer_sync as { status?: unknown; provider_error?: unknown })
      : null;

  return [gatewayIssue?.status, gatewayCustomerSync?.status].some((status) =>
    ["blocked", "failed"].includes(typeof status === "string" ? status : ""),
  );
}

function isMissingFinancialActionsTable(error: unknown) {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = typeof value?.code === "string" ? value.code : "";
  const message = typeof value?.message === "string" ? value.message : "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("financial_operation_actions") ||
    message.includes("Could not find the table")
  );
}

function normalizeReprocessedFinancialStatus(rawStatus: string | null): FinancialChargeStatus {
  const value = `${rawStatus ?? ""}`.toLowerCase();

  if (value.includes("paid") || value.includes("received")) return "paid";
  if (value.includes("transfer_pending")) return "transfer_pending";
  if (value.includes("waiting_compensation") || value.includes("compensation")) {
    return "waiting_compensation";
  }
  if (value.includes("overdue")) return "overdue";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("refund")) return "refunded";
  if (value.includes("fail")) return "failed";
  if (value.includes("dispute")) return "disputed";
  if (value.includes("waiting_payment")) return "waiting_payment";
  if (value.includes("pending")) return "pending";
  return "processing";
}

function shouldApplyReprocessedFinancialStatus(
  current: FinancialChargeStatus,
  next: FinancialChargeStatus,
) {
  if (current === next) return true;
  if (current === "transferred") return false;
  if (current === "transfer_pending" && next === "paid") return false;
  if (
    ["paid", "transfer_pending"].includes(current) &&
    ["waiting_payment", "processing", "waiting_compensation", "overdue"].includes(next)
  ) {
    return false;
  }
  if (current === "refunded" || current === "cancelled") return false;
  return true;
}

async function ensureLinkedRecord(
  table: "contracts" | "properties" | "property_owners" | "leads" | "financial_accounts",
  id: string | null,
  companyId: string,
  code: string,
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
    throw Object.assign(new Error("Registro vinculado inválido para esta empresa."), {
      statusCode: 422,
      code,
    });
  }

  return data.id;
}

async function ensureContractForCharge(contractId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("contracts")
    .select(
      "id, company_id, property_id, title, contract_number, contract_type, status, monthly_amount_cents, total_amount_cents, commission_type, commission_rate, commission_fixed_cents, operational_fee_cents, operational_fee_payer, operational_fee_requires_acceptance, operational_fee_acceptance_json, transfer_day_offset, preferred_payment_method, properties(id, owner_id, title)",
    )
    .eq("id", contractId)
    .eq("company_id", companyId)
    .maybeSingle<ChargeContract>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Contrato não encontrado para esta empresa."), {
      statusCode: 404,
      code: "CONTRACT_NOT_FOUND",
    });
  }

  if (data.contract_type !== "rental") {
    throw Object.assign(new Error("Cobranças automáticas estão liberadas apenas para contratos de locação."), {
      statusCode: 422,
      code: "CONTRACT_NOT_RENTAL",
    });
  }

  if (!["active", "signed", "generated"].includes(data.status)) {
    throw Object.assign(new Error("O contrato precisa estar assinado, gerado ou ativo para gerar cobrança."), {
      statusCode: 422,
      code: "CONTRACT_NOT_READY",
    });
  }

  return data;
}

function clientIp(req: RequestWithAccess) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return req.socket.remoteAddress ?? null;
}

async function findContractTenant(contractId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("contract_parties")
    .select("id, name, document, email, phone, portal_token, gateway_provider, gateway_customer_id, gateway_customer_status, gateway_metadata")
    .eq("contract_id", contractId)
    .eq("company_id", companyId)
    .eq("party_type", "tenant")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{
      id: string;
      name: string;
      document: string | null;
      email: string | null;
      phone: string | null;
      portal_token: string | null;
      gateway_provider: string | null;
      gateway_customer_id: string | null;
      gateway_customer_status: string | null;
      gateway_metadata: Record<string, unknown>;
    }>();

  if (error) throw error;
  return data ?? null;
}

async function findTenantForCharge(input: {
  companyId: string;
  contractId: string;
  tenantPartyId?: string | null;
}) {
  let query = supabaseAdmin
    .from("contract_parties")
    .select("id, name, document, email, phone, portal_token")
    .eq("company_id", input.companyId)
    .eq("party_type", "tenant");

  if (input.tenantPartyId) {
    query = query.eq("id", input.tenantPartyId);
  } else {
    query = query.eq("contract_id", input.contractId).order("created_at", { ascending: true }).limit(1);
  }

  const { data, error } = await query.maybeSingle<{
    id: string;
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    portal_token: string | null;
  }>();

  if (error) throw error;
  return data ?? null;
}

async function findActiveGatewayAccount(companyId: string, paymentMethod: string) {
  if (paymentMethod === "manual") return null;

  const { data, error } = await supabaseAdmin
    .from("payment_gateway_accounts")
    .select("id, provider, name, status, credentials_ref, webhook_secret_ref, settings")
    .eq("company_id", companyId)
    .in("status", ["active", "testing"])
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      provider: string;
      name: string;
      status: string;
      credentials_ref: string | null;
      webhook_secret_ref: string | null;
      settings: Record<string, unknown>;
    }>();

  if (error) throw error;
  return data ?? null;
}

async function ensureEntryBelongsToCompany(entryId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("financial_entries")
    .select("id, amount_cents, status")
    .eq("id", entryId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; amount_cents: number; status: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Lançamento financeiro não encontrado."), {
      statusCode: 404,
      code: "FINANCIAL_ENTRY_NOT_FOUND",
    });
  }

  return data;
}

async function ensureChargeBelongsToCompany(chargeId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("financial_charges")
    .select("id, company_id, contract_id, property_id, owner_id, entry_id, status, gross_amount_cents, commission_amount_cents, fee_amount_cents, net_owner_amount_cents")
    .eq("id", chargeId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string;
      contract_id: string;
      property_id: string | null;
      owner_id: string | null;
      entry_id: string | null;
      status: string;
      gross_amount_cents: number;
      commission_amount_cents: number;
      fee_amount_cents: number;
      net_owner_amount_cents: number;
    }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Cobrança não encontrada."), {
      statusCode: 404,
      code: "FINANCIAL_CHARGE_NOT_FOUND",
    });
  }

  return data;
}

async function ensureOwnerTransferBelongsToCompany(transferId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("owner_transfers")
    .select(
      "id, company_id, charge_id, contract_id, owner_id, property_id, gross_amount_cents, deductions_cents, net_amount_cents, status",
    )
    .eq("id", transferId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string;
      charge_id: string | null;
      contract_id: string | null;
      owner_id: string | null;
      property_id: string | null;
      gross_amount_cents: number;
      deductions_cents: number;
      net_amount_cents: number;
      status: string;
    }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Repasse nÃ£o encontrado."), {
      statusCode: 404,
      code: "OWNER_TRANSFER_NOT_FOUND",
    });
  }

  return data;
}

async function loadChargeForNotification(chargeId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("financial_charges")
    .select(
      "id, company_id, contract_id, property_id, owner_id, tenant_party_id, status, gross_amount_cents, due_date, payment_url, boleto_pdf_url, paid_at, contracts(id, title, contract_number)",
    )
    .eq("id", chargeId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string;
      contract_id: string;
      property_id: string | null;
      owner_id: string | null;
      tenant_party_id: string | null;
      status: string;
      gross_amount_cents: number;
      due_date: string;
      payment_url: string | null;
      boleto_pdf_url: string | null;
      paid_at: string | null;
      contracts: { id: string; title: string; contract_number: string | null } | null;
    }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Cobrança não encontrada."), {
      statusCode: 404,
      code: "FINANCIAL_CHARGE_NOT_FOUND",
    });
  }

  return data;
}

async function loadOwnerTransferForNotification(transferId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("owner_transfers")
    .select(
      "id, company_id, charge_id, contract_id, owner_id, property_id, gross_amount_cents, deductions_cents, net_amount_cents, status, due_date, paid_at, receipt_url, receipt_reference, property_owners(id, name, email, phone, whatsapp, portal_token), properties(id, title, code), contracts(id, title, contract_number)",
    )
    .eq("id", transferId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string;
      charge_id: string | null;
      contract_id: string | null;
      owner_id: string | null;
      property_id: string | null;
      gross_amount_cents: number;
      deductions_cents: number;
      net_amount_cents: number;
      status: string;
      due_date: string | null;
      paid_at: string | null;
      receipt_url: string | null;
      receipt_reference: string | null;
      property_owners:
        | {
            id: string;
            name: string;
            email: string | null;
            phone: string | null;
            whatsapp: string | null;
            portal_token: string | null;
          }
        | Array<{
            id: string;
            name: string;
            email: string | null;
            phone: string | null;
            whatsapp: string | null;
            portal_token: string | null;
          }>
        | null;
      properties:
        | { id: string; title: string; code: string | null }
        | Array<{ id: string; title: string; code: string | null }>
        | null;
      contracts:
        | { id: string; title: string; contract_number: string | null }
        | Array<{ id: string; title: string; contract_number: string | null }>
        | null;
    }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Repasse nÃ£o encontrado."), {
      statusCode: 404,
      code: "OWNER_TRANSFER_NOT_FOUND",
    });
  }

  return data;
}

async function loadChargeForGatewayIssue(chargeId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("financial_charges")
    .select(
      "id, company_id, contract_id, property_id, owner_id, tenant_party_id, entry_id, gateway_account_id, payment_method, status, gross_amount_cents, due_date, metadata",
    )
    .eq("id", chargeId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string;
      contract_id: string;
      property_id: string | null;
      owner_id: string | null;
      tenant_party_id: string | null;
      entry_id: string | null;
      gateway_account_id: string | null;
      payment_method: "pix" | "boleto" | "hybrid" | "credit_card" | "bank_transfer" | "manual";
      status: string;
      gross_amount_cents: number;
      due_date: string;
      metadata: Record<string, unknown>;
    }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Cobrança não encontrada."), {
      statusCode: 404,
      code: "FINANCIAL_CHARGE_NOT_FOUND",
    });
  }

  return data;
}

async function loadGatewayAccountForIssue(input: {
  companyId: string;
  gatewayAccountId?: string | null;
  paymentMethod: string;
}) {
  if (input.gatewayAccountId) {
    const { data, error } = await supabaseAdmin
      .from("payment_gateway_accounts")
      .select("id, provider, name, status, credentials_ref, webhook_secret_ref, settings")
      .eq("id", input.gatewayAccountId)
      .eq("company_id", input.companyId)
      .maybeSingle<{
        id: string;
        provider: string;
        name: string;
        status: string;
        credentials_ref: string | null;
        webhook_secret_ref: string | null;
        settings: Record<string, unknown>;
      }>();

    if (error) throw error;
    if (data && ["active", "testing"].includes(data.status)) return data;
  }

  return findActiveGatewayAccount(input.companyId, input.paymentMethod);
}

async function loadTenantPartyForGatewaySync(input: {
  companyId: string;
  tenantPartyId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("contract_parties")
    .select(
      "id, company_id, contract_id, party_type, name, document, email, phone, gateway_provider, gateway_customer_id, gateway_customer_status, gateway_metadata",
    )
    .eq("id", input.tenantPartyId)
    .eq("company_id", input.companyId)
    .eq("party_type", "tenant")
    .maybeSingle<GatewayCustomerParty>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Inquilino da cobrança não encontrado."), {
      statusCode: 404,
      code: "TENANT_PARTY_NOT_FOUND",
    });
  }

  return data;
}

function mergeTenantGatewayMetadata(
  metadata: Record<string, unknown>,
  tenant: GatewayCustomerParty,
  customerId?: string | null,
) {
  const currentTenant =
    metadata.tenant && typeof metadata.tenant === "object"
      ? (metadata.tenant as Record<string, unknown>)
      : {};

  return {
    ...metadata,
    tenant: {
      ...currentTenant,
      id: tenant.id,
      name: tenant.name,
      document: tenant.document,
      email: tenant.email,
      gateway_provider: tenant.gateway_provider ?? "asaas",
      gateway_customer_id: customerId ?? tenant.gateway_customer_id ?? null,
      gateway_customer_status: customerId ? "synced" : tenant.gateway_customer_status,
    },
  };
}

async function findNotificationTemplate(input: {
  templateKey: string;
  channel: "email" | "whatsapp";
  companyId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .select("id, subject, body")
    .eq("template_key", input.templateKey)
    .eq("channel", input.channel)
    .or(`company_id.eq.${input.companyId},company_id.is.null`)
    .order("company_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ id: string; subject: string | null; body: string }>();

  if (error) throw error;
  return data;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce(
    (content, [key, value]) => content.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function buildFallbackChargeMessage(input: {
  notificationType: string;
  recipientName: string;
  amount: string;
  dueDate: string;
  paymentLink: string;
}) {
  if (input.notificationType === "charge_created") {
    return `Olá, ${input.recipientName}. Sua cobrança de ${input.amount} foi gerada com vencimento em ${input.dueDate}. Acesse: ${input.paymentLink}`;
  }

  if (input.notificationType === "charge_overdue_notice") {
    return `Olá, ${input.recipientName}. Identificamos uma cobrança vencida de ${input.amount}, com vencimento em ${input.dueDate}. Regularize pelo link: ${input.paymentLink}`;
  }

  if (input.notificationType === "charge_payment_confirmed") {
    return `Olá, ${input.recipientName}. Recebemos o pagamento de ${input.amount}. Obrigado. Seu histórico fica disponível em: ${input.paymentLink}`;
  }

  return `Olá, ${input.recipientName}. Lembrete: sua cobrança de ${input.amount} vence em ${input.dueDate}. Acesse: ${input.paymentLink}`;
}

function buildFallbackOwnerTransferMessage(input: {
  notificationType: string;
  recipientName: string;
  amount: string;
  propertyTitle: string;
  dueDate: string;
  paidAt: string;
  receiptLink: string;
  portalLink: string;
}) {
  if (input.notificationType === "owner_transfer_paid") {
    return `Ola, ${input.recipientName}. O repasse de ${input.amount} referente a ${input.propertyTitle} foi realizado em ${input.paidAt}. Comprovante: ${input.receiptLink}. Portal: ${input.portalLink}`;
  }

  if (input.notificationType === "owner_transfer_calculated") {
    return `Ola, ${input.recipientName}. O repasse de ${input.amount} referente a ${input.propertyTitle} foi calculado com previsao para ${input.dueDate}. Acompanhe pelo portal: ${input.portalLink}`;
  }

  return `Ola, ${input.recipientName}. Seu repasse de ${input.amount} referente a ${input.propertyTitle} esta pendente e previsto para ${input.dueDate}. Portal: ${input.portalLink}`;
}

async function writeAuditLog(input: {
  company_id: string;
  charge_id?: string | null;
  entry_id?: string | null;
  contract_id?: string | null;
  owner_id?: string | null;
  user_id?: string | null;
  event_type: string;
  gateway_event_id?: string | null;
  gateway_charge_id?: string | null;
  gross_amount_cents?: number | null;
  net_amount_cents?: number | null;
  commission_amount_cents?: number | null;
  fee_amount_cents?: number | null;
  status_before?: string | null;
  status_after?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("financial_audit_logs").insert(input);
  if (error) throw error;
}

async function writeFinancialOperationAction(input: {
  company_id: string;
  charge_id?: string | null;
  webhook_event_id?: string | null;
  owner_transfer_id?: string | null;
  action_type:
    | "gateway_issue_review"
    | "webhook_review"
    | "webhook_reprocess_requested"
    | "missing_transfer_created"
    | "collection_task";
  title: string;
  description?: string | null;
  status?: "open" | "done" | "cancelled";
  due_at?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_by: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin
    .from("financial_operation_actions")
    .insert({
      ...input,
      description: input.description || null,
      due_at: input.due_at || null,
      resolved_at: input.resolved_at || null,
      resolved_by: input.resolved_by || null,
      status: input.status ?? "open",
      metadata: input.metadata ?? {},
    })
    .select(financialOperationActionSelect)
    .single();

  if (error) throw error;
  return data;
}

async function loadFinancialOperationAction(actionId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("financial_operation_actions")
    .select(financialOperationActionSelect)
    .eq("id", actionId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string;
      charge_id: string | null;
      webhook_event_id: string | null;
      owner_transfer_id: string | null;
      action_type: string;
      title: string;
      description: string | null;
      status: string;
      due_at: string | null;
      resolved_at: string | null;
      resolved_by: string | null;
      created_by: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("AÃ§Ã£o financeira operacional nÃ£o encontrada."), {
      statusCode: 404,
      code: "FINANCIAL_OPERATION_ACTION_NOT_FOUND",
    });
  }

  return data;
}

async function loadFinancialWebhookEvent(webhookId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("financial_webhook_events")
    .select(financialWebhookSelect)
    .eq("id", webhookId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string | null;
      charge_id: string | null;
      provider: string;
      event_type: string;
      gateway_event_id: string | null;
      gateway_charge_id: string | null;
      status_before: string | null;
      status_after: string | null;
      gross_amount_cents: number | null;
      net_amount_cents: number | null;
      payment_method: string | null;
      paid_at: string | null;
      raw_payload: Record<string, unknown>;
      processed_at: string | null;
      error_message: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
    }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Webhook financeiro nÃ£o encontrado."), {
      statusCode: 404,
      code: "FINANCIAL_WEBHOOK_NOT_FOUND",
    });
  }

  return data;
}

async function loadChargeForWebhookReprocess(input: {
  companyId: string;
  chargeId?: string | null;
  gatewayChargeId?: string | null;
}) {
  let query = supabaseAdmin
    .from("financial_charges")
    .select(
      "id, company_id, contract_id, property_id, owner_id, entry_id, status, gross_amount_cents, commission_amount_cents, fee_amount_cents, net_owner_amount_cents",
    )
    .eq("company_id", input.companyId)
    .limit(1);

  if (input.chargeId) query = query.eq("id", input.chargeId);
  else if (input.gatewayChargeId) query = query.eq("gateway_charge_id", input.gatewayChargeId);
  else {
    throw Object.assign(new Error("Webhook sem cobrança vinculada para reprocessar."), {
      statusCode: 422,
      code: "WEBHOOK_CHARGE_NOT_IDENTIFIED",
    });
  }

  const { data, error } = await query;
  if (error) throw error;
  const charge = data?.[0] as
    | {
        id: string;
        company_id: string;
        contract_id: string | null;
        property_id: string | null;
        owner_id: string | null;
        entry_id: string | null;
        status: FinancialChargeStatus;
        gross_amount_cents: number;
        commission_amount_cents: number;
        fee_amount_cents: number;
        net_owner_amount_cents: number;
      }
    | undefined;

  if (!charge) {
    throw Object.assign(new Error("CobranÃ§a vinculada ao webhook nÃ£o encontrada."), {
      statusCode: 404,
      code: "FINANCIAL_CHARGE_NOT_FOUND",
    });
  }

  return charge;
}

async function markLinkedRecordsForWebhookReprocess(input: {
  companyId: string;
  chargeId: string;
  statusAfter: FinancialChargeStatus;
}) {
  if (!["paid", "transfer_pending"].includes(input.statusAfter)) return;

  const [commissionUpdate, transferUpdate] = await Promise.all([
    supabaseAdmin
      .from("commissions")
      .update({ status: "approved" })
      .eq("company_id", input.companyId)
      .eq("charge_id", input.chargeId)
      .eq("status", "pending"),
    supabaseAdmin
      .from("owner_transfers")
      .update({ status: "approved" })
      .eq("company_id", input.companyId)
      .eq("charge_id", input.chargeId)
      .eq("status", "pending"),
  ]);

  if (commissionUpdate.error) throw commissionUpdate.error;
  if (transferUpdate.error) throw transferUpdate.error;
}

async function closeWebhookReprocessActions(input: {
  companyId: string;
  webhookEventId: string;
  userId: string;
  now: string;
}) {
  const { error } = await supabaseAdmin
    .from("financial_operation_actions")
    .update({
      status: "done",
      resolved_at: input.now,
      resolved_by: input.userId,
      metadata: {
        resolution: {
          status: "done",
          source: "webhook_reprocess_execution",
          resolved_at: input.now,
          resolved_by: input.userId,
        },
      },
    })
    .eq("company_id", input.companyId)
    .eq("webhook_event_id", input.webhookEventId)
    .eq("action_type", "webhook_reprocess_requested")
    .eq("status", "open");

  if (error && !isMissingFinancialActionsTable(error)) throw error;
}

async function executeFinancialWebhookReprocess(input: {
  webhookId: string;
  companyId: string;
  userId: string;
  reason?: string | null;
}) {
  const webhook = await loadFinancialWebhookEvent(input.webhookId, input.companyId);
  const now = new Date().toISOString();
  const charge = await loadChargeForWebhookReprocess({
    companyId: input.companyId,
    chargeId: webhook.charge_id,
    gatewayChargeId: webhook.gateway_charge_id,
  });
  const normalizedStatus = normalizeReprocessedFinancialStatus(webhook.status_after);
  const statusAfter: FinancialChargeStatus =
    normalizedStatus === "paid" && charge.owner_id ? "transfer_pending" : normalizedStatus;
  const shouldUpdateCharge = shouldApplyReprocessedFinancialStatus(charge.status, statusAfter);
  const effectiveStatus = shouldUpdateCharge ? statusAfter : charge.status;
  const paidAt = webhook.paid_at || now;
  const paymentMethod = webhook.payment_method || "gateway";

  if (shouldUpdateCharge) {
    const chargeUpdate: Record<string, unknown> = { status: effectiveStatus };
    if (["paid", "transfer_pending"].includes(effectiveStatus)) chargeUpdate.paid_at = paidAt;

    const { error: chargeError } = await supabaseAdmin
      .from("financial_charges")
      .update(chargeUpdate)
      .eq("id", charge.id)
      .eq("company_id", input.companyId);

    if (chargeError) throw chargeError;
  }

  if (["paid", "transfer_pending"].includes(effectiveStatus) && charge.entry_id) {
    const payment = await supabaseAdmin.from("financial_payments").insert({
      company_id: input.companyId,
      entry_id: charge.entry_id,
      amount_cents: webhook.gross_amount_cents ?? charge.gross_amount_cents,
      payment_method: paymentMethod,
      paid_at: paidAt,
      source: `webhook_reprocess:${webhook.provider}`,
      gateway_event_id: webhook.gateway_event_id,
      gateway_charge_id: webhook.gateway_charge_id,
      notes: `Pagamento conciliado por reprocessamento do webhook ${webhook.provider}.`,
      metadata: {
        event_type: webhook.event_type,
        normalized_status: normalizedStatus,
        financial_webhook_event_id: webhook.id,
      },
    });

    if (payment.error?.code !== "23505" && payment.error) throw payment.error;

    const { error: entryError } = await supabaseAdmin
      .from("financial_entries")
      .update({
        status: "paid",
        paid_at: paidAt,
        payment_method: paymentMethod,
      })
      .eq("id", charge.entry_id)
      .eq("company_id", input.companyId);

    if (entryError) throw entryError;

    await markLinkedRecordsForWebhookReprocess({
      companyId: input.companyId,
      chargeId: charge.id,
      statusAfter: effectiveStatus,
    });
  }

  const metadata = webhook.metadata && typeof webhook.metadata === "object" ? webhook.metadata : {};
  const { data: updatedWebhook, error: webhookError } = await supabaseAdmin
    .from("financial_webhook_events")
    .update({
      charge_id: charge.id,
      processed_at: now,
      error_message: null,
      metadata: {
        ...metadata,
        reprocess_execution: {
          status: "processed",
          processed_at: now,
          processed_by: input.userId,
          reason: input.reason || null,
          previous_charge_status: charge.status,
          effective_charge_status: effectiveStatus,
          charge_updated: shouldUpdateCharge,
        },
      },
    })
    .eq("id", webhook.id)
    .eq("company_id", input.companyId)
    .select(financialWebhookSelect)
    .single();

  if (webhookError) throw webhookError;

  await closeWebhookReprocessActions({
    companyId: input.companyId,
    webhookEventId: webhook.id,
    userId: input.userId,
    now,
  });

  await writeAuditLog({
    company_id: input.companyId,
    charge_id: charge.id,
    entry_id: charge.entry_id,
    contract_id: charge.contract_id,
    owner_id: charge.owner_id,
    user_id: input.userId,
    event_type: "financial_webhook.reprocessed",
    gateway_event_id: webhook.gateway_event_id,
    gateway_charge_id: webhook.gateway_charge_id,
    gross_amount_cents: webhook.gross_amount_cents ?? charge.gross_amount_cents,
    net_amount_cents: webhook.net_amount_cents ?? charge.net_owner_amount_cents,
    commission_amount_cents: charge.commission_amount_cents,
    fee_amount_cents: charge.fee_amount_cents,
    status_before: charge.status,
    status_after: effectiveStatus,
    metadata: {
      financial_webhook_event_id: webhook.id,
      event_type: webhook.event_type,
      normalized_status: normalizedStatus,
      charge_updated: shouldUpdateCharge,
      reason: input.reason || null,
    },
  });

  return {
    webhook: updatedWebhook,
    result: {
      processed: true,
      charge_id: charge.id,
      previous_status: charge.status,
      status: effectiveStatus,
      gateway_status: normalizedStatus,
      charge_updated: shouldUpdateCharge,
    },
  };
}

financeRouter.get(
  "/summary",
  requirePermission("finance.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const { data, error } = await supabaseAdmin
        .from("financial_entries")
        .select("entry_type, status, amount_cents, due_date")
        .eq("company_id", companyId)
        .neq("status", "archived");

      if (error) throw error;

      const today = new Date().toISOString().slice(0, 10);
      const summary = (data ?? []).reduce(
        (acc, entry) => {
          if (entry.status === "paid") {
            if (entry.entry_type === "income") acc.received_cents += entry.amount_cents;
            if (entry.entry_type === "expense") acc.paid_expenses_cents += entry.amount_cents;
          } else if (entry.status !== "cancelled") {
            if (entry.entry_type === "income") acc.open_receivables_cents += entry.amount_cents;
            if (entry.entry_type === "expense") acc.open_payables_cents += entry.amount_cents;
          }

          if (entry.status !== "paid" && entry.status !== "cancelled" && entry.due_date && entry.due_date < today) {
            acc.overdue_cents += entry.amount_cents;
          }

          return acc;
        },
        {
          received_cents: 0,
          paid_expenses_cents: 0,
          open_receivables_cents: 0,
          open_payables_cents: 0,
          overdue_cents: 0,
        },
      );

      res.json({ summary });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.get(
  "/operations-summary",
  requirePermission("finance.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const today = new Date().toISOString().slice(0, 10);

      const [chargesResponse, transfersResponse, webhooksResponse, auditResponse, actionsResponse] = await Promise.all([
        supabaseAdmin
          .from("financial_charges")
          .select(chargeSelect)
          .eq("company_id", companyId)
          .order("due_date", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(300),
        supabaseAdmin
          .from("owner_transfers")
          .select(ownerTransferSelect)
          .eq("company_id", companyId)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin
          .from("financial_webhook_events")
          .select(financialWebhookSelect)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("financial_audit_logs")
          .select(financialAuditSelect)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("financial_operation_actions")
          .select(financialOperationActionSelect)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(80),
      ]);

      if (chargesResponse.error) throw chargesResponse.error;
      if (transfersResponse.error) throw transfersResponse.error;
      if (webhooksResponse.error) throw webhooksResponse.error;
      if (auditResponse.error) throw auditResponse.error;
      if (actionsResponse.error && !isMissingFinancialActionsTable(actionsResponse.error)) {
        throw actionsResponse.error;
      }

      const charges = chargesResponse.data ?? [];
      const transfers = transfersResponse.data ?? [];
      const webhooks = webhooksResponse.data ?? [];
      const actions = actionsResponse.error ? [] : actionsResponse.data ?? [];
      const openChargeStatuses = ["pending", "waiting_payment", "processing", "waiting_compensation", "overdue", "failed", "disputed"];
      const overdueCharges = charges.filter(
        (charge) =>
          openChargeStatuses.includes(charge.status) &&
          charge.due_date < today &&
          !["paid", "cancelled", "refunded", "transferred"].includes(charge.status),
      );
      const waitingCompensationCharges = charges.filter((charge) =>
        ["processing", "waiting_compensation"].includes(charge.status),
      );
      const gatewayIssueCharges = charges.filter((charge) => hasGatewayIssue(charge));
      const pendingTransfers = transfers.filter((transfer) =>
        ["pending", "approved"].includes(transfer.status),
      );
      const failedWebhooks = webhooks.filter((event) => {
        const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata : {};
        const review =
          typeof metadata.operational_review === "object" && metadata.operational_review !== null
            ? (metadata.operational_review as { status?: unknown })
            : null;

        return (
          review?.status !== "resolved" &&
          (event.error_message || !event.processed_at || event.status_after === "failed")
        );
      });
      const paidChargesWithoutTransfer = charges.filter(
        (charge) =>
          charge.owner_id &&
          ["paid", "transfer_pending"].includes(charge.status) &&
          !transfers.some((transfer) => transfer.charge_id === charge.id),
      );

      res.json({
        summary: {
          overdue_charges_count: overdueCharges.length,
          overdue_charges_cents: sumCents(overdueCharges, "gross_amount_cents"),
          waiting_compensation_count: waitingCompensationCharges.length,
          waiting_compensation_cents: sumCents(waitingCompensationCharges, "gross_amount_cents"),
          gateway_issues_count: gatewayIssueCharges.length,
          gateway_issues_cents: sumCents(gatewayIssueCharges, "gross_amount_cents"),
          pending_transfers_count: pendingTransfers.length,
          pending_transfers_cents: sumCents(pendingTransfers, "net_amount_cents"),
          failed_webhooks_count: failedWebhooks.length,
          paid_without_transfer_count: paidChargesWithoutTransfer.length,
          open_operation_actions_count: actions.filter((action) => action.status === "open").length,
        },
        overdue_charges: overdueCharges.slice(0, 20),
        waiting_compensation_charges: waitingCompensationCharges.slice(0, 20),
        gateway_issues: gatewayIssueCharges.slice(0, 20),
        pending_transfers: pendingTransfers.slice(0, 20),
        paid_without_transfer: paidChargesWithoutTransfer.slice(0, 20),
        recent_webhooks: webhooks,
        recent_audit_logs: auditResponse.data ?? [],
        operation_actions: actions,
      });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/charges/:id/review-gateway-issue",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const chargeId = readParam(req.params.id);
      const input = financialOperationActionSchema.parse(req.body ?? {});

      if (!chargeId) {
        return res.status(404).json({
          error: "FINANCIAL_CHARGE_NOT_FOUND",
          message: "CobranÃ§a nÃ£o encontrada.",
        });
      }

      const charge = await loadChargeForGatewayIssue(chargeId, companyId);
      const now = new Date().toISOString();
      const metadata = charge.metadata && typeof charge.metadata === "object" ? charge.metadata : {};

      const { data: updatedCharge, error } = await supabaseAdmin
        .from("financial_charges")
        .update({
          metadata: {
            ...metadata,
            gateway_issue_review: {
              status: "resolved",
              resolved_at: now,
              resolved_by: userId,
              reason: input.reason || "InconsistÃªncia revisada pelo financeiro.",
            },
          },
        })
        .eq("id", charge.id)
        .eq("company_id", companyId)
        .select(chargeSelect)
        .single();

      if (error) throw error;

      const action = await writeFinancialOperationAction({
        company_id: companyId,
        charge_id: charge.id,
        action_type: "gateway_issue_review",
        title: "InconsistÃªncia de gateway revisada",
        description: input.reason || "InconsistÃªncia revisada pelo financeiro.",
        status: "done",
        resolved_at: now,
        resolved_by: userId,
        created_by: userId,
        metadata: {
          previous_status: charge.status,
          payment_method: charge.payment_method,
        },
      });

      await writeAuditLog({
        company_id: companyId,
        charge_id: charge.id,
        entry_id: charge.entry_id,
        contract_id: charge.contract_id,
        owner_id: charge.owner_id,
        user_id: userId,
        event_type: "charge.gateway_issue_reviewed",
        gross_amount_cents: charge.gross_amount_cents,
        status_before: charge.status,
        status_after: charge.status,
        metadata: {
          reason: input.reason || null,
          financial_operation_action_id: action.id,
        },
      });

      res.json({ charge: updatedCharge, action });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/charges/:id/create-owner-transfer",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const chargeId = readParam(req.params.id);
      const input = financialOperationActionSchema.parse(req.body ?? {});

      if (!chargeId) {
        return res.status(404).json({
          error: "FINANCIAL_CHARGE_NOT_FOUND",
          message: "CobranÃ§a nÃ£o encontrada.",
        });
      }

      const charge = await ensureChargeBelongsToCompany(chargeId, companyId);

      if (!charge.owner_id) {
        return res.status(422).json({
          error: "OWNER_REQUIRED_FOR_TRANSFER",
          message: "A cobranÃ§a nÃ£o possui proprietÃ¡rio vinculado para gerar repasse.",
        });
      }

      const { data: existingTransfer, error: existingError } = await supabaseAdmin
        .from("owner_transfers")
        .select("id")
        .eq("company_id", companyId)
        .eq("charge_id", charge.id)
        .maybeSingle<{ id: string }>();

      if (existingError) throw existingError;
      if (existingTransfer) {
        return res.status(409).json({
          error: "OWNER_TRANSFER_ALREADY_EXISTS",
          message: "JÃ¡ existe repasse vinculado a esta cobranÃ§a.",
        });
      }

      const now = new Date().toISOString();
      const { data: transfer, error: transferError } = await supabaseAdmin
        .from("owner_transfers")
        .insert({
          company_id: companyId,
          charge_id: charge.id,
          contract_id: charge.contract_id,
          owner_id: charge.owner_id,
          property_id: charge.property_id,
          gross_amount_cents: charge.gross_amount_cents,
          deductions_cents: charge.commission_amount_cents + charge.fee_amount_cents,
          net_amount_cents: charge.net_owner_amount_cents,
          status: charge.status === "paid" || charge.status === "transfer_pending" ? "approved" : "pending",
          due_date: input.due_at ? input.due_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          notes: input.reason || `Repasse operacional gerado a partir da cobranÃ§a ${charge.id}`,
          metadata: {
            source: "financial_operations_panel",
            created_by_action: true,
          },
        })
        .select(ownerTransferSelect)
        .single();

      if (transferError) throw transferError;

      const { data: updatedCharge, error: chargeError } = await supabaseAdmin
        .from("financial_charges")
        .update({
          status: charge.status === "paid" ? "transfer_pending" : charge.status,
        })
        .eq("id", charge.id)
        .eq("company_id", companyId)
        .select(chargeSelect)
        .single();

      if (chargeError) throw chargeError;

      const action = await writeFinancialOperationAction({
        company_id: companyId,
        charge_id: charge.id,
        owner_transfer_id: transfer.id,
        action_type: "missing_transfer_created",
        title: "Repasse ausente gerado",
        description: input.reason || "Repasse criado pela central financeira operacional.",
        status: "done",
        resolved_at: now,
        resolved_by: userId,
        created_by: userId,
        metadata: {
          previous_charge_status: charge.status,
          new_charge_status: updatedCharge.status,
        },
      });

      await writeAuditLog({
        company_id: companyId,
        charge_id: charge.id,
        entry_id: charge.entry_id,
        contract_id: charge.contract_id,
        owner_id: charge.owner_id,
        user_id: userId,
        event_type: "owner_transfer.created_from_financial_operation",
        gross_amount_cents: charge.gross_amount_cents,
        net_amount_cents: charge.net_owner_amount_cents,
        commission_amount_cents: charge.commission_amount_cents,
        fee_amount_cents: charge.fee_amount_cents,
        status_before: charge.status,
        status_after: updatedCharge.status,
        metadata: {
          owner_transfer_id: transfer.id,
          financial_operation_action_id: action.id,
          reason: input.reason || null,
        },
      });

      res.status(201).json({ charge: updatedCharge, transfer, action });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/charges/:id/create-collection-task",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const chargeId = readParam(req.params.id);
      const input = financialOperationActionSchema.parse(req.body ?? {});

      if (!chargeId) {
        return res.status(404).json({
          error: "FINANCIAL_CHARGE_NOT_FOUND",
          message: "CobranÃ§a nÃ£o encontrada.",
        });
      }

      const charge = await ensureChargeBelongsToCompany(chargeId, companyId);
      const dueAt = input.due_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const action = await writeFinancialOperationAction({
        company_id: companyId,
        charge_id: charge.id,
        action_type: "collection_task",
        title: "Tarefa de cobranÃ§a",
        description:
          input.reason ||
          "Entrar em contato com o inquilino, registrar retorno e orientar regularizaÃ§Ã£o.",
        status: "open",
        due_at: dueAt,
        created_by: userId,
        metadata: {
          charge_status: charge.status,
          gross_amount_cents: charge.gross_amount_cents,
        },
      });

      await writeAuditLog({
        company_id: companyId,
        charge_id: charge.id,
        entry_id: charge.entry_id,
        contract_id: charge.contract_id,
        owner_id: charge.owner_id,
        user_id: userId,
        event_type: "charge.collection_task_created",
        gross_amount_cents: charge.gross_amount_cents,
        status_before: charge.status,
        status_after: charge.status,
        metadata: {
          financial_operation_action_id: action.id,
          due_at: dueAt,
          reason: input.reason || null,
        },
      });

      res.status(201).json({ action });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/webhooks/:id/resolve",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const webhookId = readParam(req.params.id);
      const input = financialOperationActionSchema.parse(req.body ?? {});

      if (!webhookId) {
        return res.status(404).json({
          error: "FINANCIAL_WEBHOOK_NOT_FOUND",
          message: "Webhook financeiro nÃ£o encontrado.",
        });
      }

      const webhook = await loadFinancialWebhookEvent(webhookId, companyId);
      const now = new Date().toISOString();
      const metadata = webhook.metadata && typeof webhook.metadata === "object" ? webhook.metadata : {};

      const { data: updatedWebhook, error } = await supabaseAdmin
        .from("financial_webhook_events")
        .update({
          metadata: {
            ...metadata,
            operational_review: {
              status: "resolved",
              resolved_at: now,
              resolved_by: userId,
              reason: input.reason || "Webhook financeiro revisado pelo operacional.",
            },
          },
        })
        .eq("id", webhook.id)
        .eq("company_id", companyId)
        .select(financialWebhookSelect)
        .single();

      if (error) throw error;

      const action = await writeFinancialOperationAction({
        company_id: companyId,
        charge_id: webhook.charge_id,
        webhook_event_id: webhook.id,
        action_type: "webhook_review",
        title: "Webhook financeiro revisado",
        description: input.reason || "Webhook financeiro revisado pelo operacional.",
        status: "done",
        resolved_at: now,
        resolved_by: userId,
        created_by: userId,
        metadata: {
          provider: webhook.provider,
          event_type: webhook.event_type,
          error_message: webhook.error_message,
        },
      });

      await writeAuditLog({
        company_id: companyId,
        charge_id: webhook.charge_id,
        user_id: userId,
        event_type: "financial_webhook.reviewed",
        gateway_event_id: webhook.gateway_event_id,
        gateway_charge_id: webhook.gateway_charge_id,
        gross_amount_cents: webhook.gross_amount_cents,
        net_amount_cents: webhook.net_amount_cents,
        status_before: webhook.status_before,
        status_after: webhook.status_after,
        metadata: {
          financial_webhook_event_id: webhook.id,
          financial_operation_action_id: action.id,
          reason: input.reason || null,
        },
      });

      res.json({ webhook: updatedWebhook, action });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/webhooks/:id/request-reprocess",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const webhookId = readParam(req.params.id);
      const input = financialOperationActionSchema.parse(req.body ?? {});

      if (!webhookId) {
        return res.status(404).json({
          error: "FINANCIAL_WEBHOOK_NOT_FOUND",
          message: "Webhook financeiro nÃ£o encontrado.",
        });
      }

      const webhook = await loadFinancialWebhookEvent(webhookId, companyId);
      const now = new Date().toISOString();
      const metadata = webhook.metadata && typeof webhook.metadata === "object" ? webhook.metadata : {};

      const { data: updatedWebhook, error } = await supabaseAdmin
        .from("financial_webhook_events")
        .update({
          metadata: {
            ...metadata,
            reprocess_request: {
              status: "requested",
              requested_at: now,
              requested_by: userId,
              reason: input.reason || "Reprocessamento solicitado pelo operacional.",
            },
          },
        })
        .eq("id", webhook.id)
        .eq("company_id", companyId)
        .select(financialWebhookSelect)
        .single();

      if (error) throw error;

      const action = await writeFinancialOperationAction({
        company_id: companyId,
        charge_id: webhook.charge_id,
        webhook_event_id: webhook.id,
        action_type: "webhook_reprocess_requested",
        title: "Reprocessamento de webhook solicitado",
        description: input.reason || "Reprocessamento solicitado pelo operacional.",
        status: "open",
        due_at: input.due_at || null,
        created_by: userId,
        metadata: {
          provider: webhook.provider,
          event_type: webhook.event_type,
          gateway_event_id: webhook.gateway_event_id,
        },
      });

      await writeAuditLog({
        company_id: companyId,
        charge_id: webhook.charge_id,
        user_id: userId,
        event_type: "financial_webhook.reprocess_requested",
        gateway_event_id: webhook.gateway_event_id,
        gateway_charge_id: webhook.gateway_charge_id,
        gross_amount_cents: webhook.gross_amount_cents,
        net_amount_cents: webhook.net_amount_cents,
        status_before: webhook.status_before,
        status_after: webhook.status_after,
        metadata: {
          financial_webhook_event_id: webhook.id,
          financial_operation_action_id: action.id,
          reason: input.reason || null,
        },
      });

      res.status(201).json({ webhook: updatedWebhook, action });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/webhooks/:id/reprocess",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const webhookId = readParam(req.params.id);
      const input = financialOperationActionUpdateSchema.parse(req.body ?? {});

      if (!webhookId) {
        return res.status(404).json({
          error: "FINANCIAL_WEBHOOK_NOT_FOUND",
          message: "Webhook financeiro nÃ£o encontrado.",
        });
      }

      const result = await executeFinancialWebhookReprocess({
        webhookId,
        companyId,
        userId,
        reason: input.reason || null,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/operation-actions/:id/resolve",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const actionId = readParam(req.params.id);
      const input = financialOperationActionUpdateSchema.parse(req.body ?? {});

      if (!actionId) {
        return res.status(404).json({
          error: "FINANCIAL_OPERATION_ACTION_NOT_FOUND",
          message: "AÃ§Ã£o financeira operacional nÃ£o encontrada.",
        });
      }

      const before = await loadFinancialOperationAction(actionId, companyId);
      if (before.status !== "open") {
        return res.status(409).json({
          error: "FINANCIAL_OPERATION_ACTION_ALREADY_CLOSED",
          message: "Somente aÃ§Ãµes abertas podem ser concluÃ­das.",
        });
      }

      const now = new Date().toISOString();
      const metadata = before.metadata && typeof before.metadata === "object" ? before.metadata : {};
      const { data: action, error } = await supabaseAdmin
        .from("financial_operation_actions")
        .update({
          status: "done",
          resolved_at: now,
          resolved_by: userId,
          description: input.reason || before.description,
          metadata: {
            ...metadata,
            resolution: {
              status: "done",
              resolved_at: now,
              resolved_by: userId,
              reason: input.reason || null,
            },
          },
        })
        .eq("id", before.id)
        .eq("company_id", companyId)
        .select(financialOperationActionSelect)
        .single();

      if (error) throw error;

      await writeAuditLog({
        company_id: companyId,
        charge_id: before.charge_id,
        user_id: userId,
        event_type: "financial_operation_action.resolved",
        status_before: before.status,
        status_after: "done",
        metadata: {
          financial_operation_action_id: before.id,
          action_type: before.action_type,
          webhook_event_id: before.webhook_event_id,
          owner_transfer_id: before.owner_transfer_id,
          reason: input.reason || null,
        },
      });

      res.json({ action });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/operation-actions/:id/cancel",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const actionId = readParam(req.params.id);
      const input = financialOperationActionUpdateSchema.parse(req.body ?? {});

      if (!actionId) {
        return res.status(404).json({
          error: "FINANCIAL_OPERATION_ACTION_NOT_FOUND",
          message: "AÃ§Ã£o financeira operacional nÃ£o encontrada.",
        });
      }

      const before = await loadFinancialOperationAction(actionId, companyId);
      if (before.status !== "open") {
        return res.status(409).json({
          error: "FINANCIAL_OPERATION_ACTION_ALREADY_CLOSED",
          message: "Somente aÃ§Ãµes abertas podem ser canceladas.",
        });
      }

      const now = new Date().toISOString();
      const metadata = before.metadata && typeof before.metadata === "object" ? before.metadata : {};
      const { data: action, error } = await supabaseAdmin
        .from("financial_operation_actions")
        .update({
          status: "cancelled",
          resolved_at: now,
          resolved_by: userId,
          description: input.reason || before.description,
          metadata: {
            ...metadata,
            resolution: {
              status: "cancelled",
              resolved_at: now,
              resolved_by: userId,
              reason: input.reason || null,
            },
          },
        })
        .eq("id", before.id)
        .eq("company_id", companyId)
        .select(financialOperationActionSelect)
        .single();

      if (error) throw error;

      await writeAuditLog({
        company_id: companyId,
        charge_id: before.charge_id,
        user_id: userId,
        event_type: "financial_operation_action.cancelled",
        status_before: before.status,
        status_after: "cancelled",
        metadata: {
          financial_operation_action_id: before.id,
          action_type: before.action_type,
          webhook_event_id: before.webhook_event_id,
          owner_transfer_id: before.owner_transfer_id,
          reason: input.reason || null,
        },
      });

      res.json({ action });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.get(
  "/gateway-accounts",
  requirePermission("finance.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const { data, error } = await supabaseAdmin
        .from("payment_gateway_accounts")
        .select(gatewayAccountSelect)
        .eq("company_id", companyId)
        .neq("status", "archived")
        .order("created_at", { ascending: false });

      if (error) throw error;

      res.json({ gateway_accounts: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/gateway-accounts",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = gatewayAccountSchema.parse(req.body);

      const { data: account, error } = await supabaseAdmin
        .from("payment_gateway_accounts")
        .insert({
          company_id: companyId,
          provider: input.provider,
          name: input.name,
          status: input.status,
          credentials_ref: input.credentials_ref || null,
          webhook_secret_ref: input.webhook_secret_ref || null,
          settings: {
            ...input.settings,
            credentials_storage: "reference_only",
            secret_values_must_not_be_stored_in_frontend: true,
          },
          created_by: userId,
        })
        .select(gatewayAccountSelect)
        .single();

      if (error) throw error;

      res.status(201).json({ gateway_account: account });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.get(
  "/charges",
  requirePermission("finance.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;

      let query = supabaseAdmin
        .from("financial_charges")
        .select(chargeSelect)
        .eq("company_id", companyId)
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw error;

      res.json({ charges: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.get(
  "/owner-transfers",
  requirePermission("finance.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;

      let query = supabaseAdmin
        .from("owner_transfers")
        .select(ownerTransferSelect)
        .eq("company_id", companyId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw error;

      res.json({ transfers: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/owner-transfers/:id/confirm-payment",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const transferId = readParam(req.params.id);
      const input = ownerTransferPaymentSchema.parse(req.body);

      if (!transferId) {
        return res.status(404).json({
          error: "OWNER_TRANSFER_NOT_FOUND",
          message: "Repasse nÃ£o encontrado.",
        });
      }

      const transfer = await ensureOwnerTransferBelongsToCompany(transferId, companyId);

      if (["paid", "cancelled"].includes(transfer.status)) {
        throw Object.assign(new Error("Este repasse nÃ£o pode ser confirmado novamente."), {
          statusCode: 409,
          code: "OWNER_TRANSFER_ALREADY_CLOSED",
        });
      }

      const paidAt = input.paid_at || new Date().toISOString();
      const paymentMethod = input.payment_method || "manual_transfer";

      const { data: updatedTransfer, error: transferError } = await supabaseAdmin
        .from("owner_transfers")
        .update({
          status: "paid",
          paid_at: paidAt,
          payment_method: paymentMethod,
          receipt_url: input.receipt_url || null,
          receipt_reference: input.receipt_reference || null,
          notes: input.notes || null,
          metadata: {
            confirmed_by: userId,
            confirmed_at: paidAt,
            manual_exception: true,
            receipt_reference: input.receipt_reference || null,
          },
        })
        .eq("id", transfer.id)
        .eq("company_id", companyId)
        .select(ownerTransferSelect)
        .single();

      if (transferError) throw transferError;

      if (transfer.charge_id) {
        const { error: chargeError } = await supabaseAdmin
          .from("financial_charges")
          .update({ status: "transferred" })
          .eq("id", transfer.charge_id)
          .eq("company_id", companyId)
          .in("status", ["paid", "transfer_pending"]);

        if (chargeError) throw chargeError;
      }

      await writeAuditLog({
        company_id: companyId,
        charge_id: transfer.charge_id,
        contract_id: transfer.contract_id,
        owner_id: transfer.owner_id,
        user_id: userId,
        event_type: "owner_transfer.payment_confirmed",
        gross_amount_cents: transfer.gross_amount_cents,
        net_amount_cents: transfer.net_amount_cents,
        status_before: transfer.status,
        status_after: "paid",
        metadata: {
          payment_method: paymentMethod,
          receipt_url: input.receipt_url || null,
          receipt_reference: input.receipt_reference || null,
          manual_exception: true,
        },
      });

      res.json({ transfer: updatedTransfer });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/owner-transfers/:id/prepare-notification",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const transferId = readParam(req.params.id);
      const input = ownerTransferNotificationSchema.parse(req.body);

      if (!transferId) {
        return res.status(404).json({
          error: "OWNER_TRANSFER_NOT_FOUND",
          message: "Repasse nÃ£o encontrado.",
        });
      }

      const transfer = await loadOwnerTransferForNotification(transferId, companyId);
      const owner = firstRelation(transfer.property_owners);

      if (!owner) {
        throw Object.assign(new Error("ProprietÃ¡rio do repasse nÃ£o encontrado."), {
          statusCode: 422,
          code: "OWNER_TRANSFER_OWNER_NOT_FOUND",
        });
      }

      const recipientContact =
        input.channel === "email" ? owner.email : owner.whatsapp || owner.phone;

      if (!recipientContact) {
        throw Object.assign(
          new Error("ProprietÃ¡rio sem contato cadastrado para este canal."),
          {
            statusCode: 422,
            code: "OWNER_CONTACT_NOT_FOUND",
          },
        );
      }

      const property = firstRelation(transfer.properties);
      const contract = firstRelation(transfer.contracts);
      const portalLink = owner.portal_token
        ? `${env.APP_URL.replace(/\/$/, "")}/portal/proprietario/${owner.portal_token}`
        : `${env.APP_URL.replace(/\/$/, "")}/portal/proprietario`;
      const receiptLink = transfer.receipt_url || transfer.receipt_reference || "Nao informado";
      const variables = {
        recipient_name: owner.name,
        amount: formatMoney(transfer.net_amount_cents),
        property_title: property?.title ?? contract?.title ?? "imovel vinculado",
        due_date: transfer.due_date ? formatDate(transfer.due_date) : "data nao informada",
        paid_at: transfer.paid_at ? formatDate(transfer.paid_at) : "data nao informada",
        receipt_link: receiptLink,
        portal_link: portalLink,
      };
      const template = await findNotificationTemplate({
        templateKey: input.notification_type,
        channel: input.channel,
        companyId,
      });
      const body = template
        ? renderTemplate(template.body, variables)
        : buildFallbackOwnerTransferMessage({
            notificationType: input.notification_type,
            recipientName: variables.recipient_name,
            amount: variables.amount,
            propertyTitle: variables.property_title,
            dueDate: variables.due_date,
            paidAt: variables.paid_at,
            receiptLink,
            portalLink,
          });

      const { data: event, error } = await supabaseAdmin
        .from("notification_events")
        .insert({
          company_id: companyId,
          template_id: template?.id ?? null,
          channel: input.channel,
          recipient_type: "owner",
          recipient_id: owner.id,
          recipient_name: owner.name,
          recipient_contact: recipientContact,
          subject:
            input.channel === "email"
              ? template?.subject ?? "Repasse ImobiFlow"
              : null,
          body,
          provider: "manual",
          status: "prepared",
          related_entity_type: "owner_transfer",
          related_entity_id: transfer.id,
          metadata: {
            notification_type: input.notification_type,
            transfer_status: transfer.status,
            charge_id: transfer.charge_id,
            contract_id: transfer.contract_id,
            owner_id: owner.id,
            property_id: transfer.property_id,
            portal_link: portalLink,
            receipt_link: receiptLink,
          },
          created_by: userId,
        })
        .select(dispatchEventSelect)
        .single();

      if (error) throw error;

      await writeAuditLog({
        company_id: companyId,
        charge_id: transfer.charge_id,
        contract_id: transfer.contract_id,
        owner_id: owner.id,
        user_id: userId,
        event_type: `owner_transfer.notification_prepared.${input.notification_type}`,
        gross_amount_cents: transfer.gross_amount_cents,
        net_amount_cents: transfer.net_amount_cents,
        status_before: transfer.status,
        status_after: transfer.status,
        metadata: {
          channel: input.channel,
          notification_event_id: event.id,
          related_entity_type: "owner_transfer",
        },
      });

      if (input.channel === "whatsapp") {
        await recordUsageEvent({
          companyId,
          userId,
          metricKey: "whatsapp_message",
          source: "owner_transfer_notification_prepared",
          relatedEntityType: "notification_event",
          relatedEntityId: event.id,
          metadata: {
            transfer_id: transfer.id,
            owner_id: owner.id,
            notification_type: input.notification_type,
            status: "prepared",
          },
        });
      }

      res.status(201).json({ event });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/charges/from-contract",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = chargeFromContractSchema.parse(req.body);
      const contract = await ensureContractForCharge(input.contract_id, companyId);
      const property = firstRelation(contract.properties);
      const tenant = await findContractTenant(contract.id, companyId);
      const baseRentAmountCents =
        input.base_amount_cents ?? contract.monthly_amount_cents ?? contract.total_amount_cents ?? 0;

      if (baseRentAmountCents <= 0) {
        throw Object.assign(new Error("Informe o valor do aluguel para gerar a cobrança."), {
          statusCode: 422,
          code: "INVALID_CHARGE_AMOUNT",
        });
      }

      const feeAmountCents = input.fee_amount_cents ?? contract.operational_fee_cents ?? 0;
      const feePayer = input.fee_payer ?? contract.operational_fee_payer ?? "company";
      const feeAcceptanceRequired = feeAmountCents > 0 && feePayer !== "company";
      const contractAcceptance = Boolean(
        contract.operational_fee_requires_acceptance &&
          contract.operational_fee_acceptance_json &&
          contract.operational_fee_acceptance_json["accepted"] === true,
      );
      const feeAcceptanceConfirmed =
        feePayer === "company" || !feeAcceptanceRequired || Boolean(input.fee_acceptance_confirmed || contractAcceptance);

      if (feeAcceptanceRequired && !feeAcceptanceConfirmed) {
        throw Object.assign(
          new Error("Taxa atribuída ao inquilino ou proprietário exige aceite contratual registrado."),
          {
            statusCode: 422,
            code: "FEE_ACCEPTANCE_REQUIRED",
          },
        );
      }

      const commissionType = input.commission_type ?? contract.commission_type ?? "percentage";
      const commissionAmountCents = calculateCommission(
        baseRentAmountCents,
        commissionType,
        input.commission_rate ?? contract.commission_rate,
        input.commission_fixed_cents ?? contract.commission_fixed_cents,
      );
      const grossAmountCents =
        feePayer === "tenant" ? baseRentAmountCents + feeAmountCents : baseRentAmountCents;
      const ownerFeeDeduction = feePayer === "owner" ? feeAmountCents : 0;
      const netOwnerAmountCents = Math.max(
        0,
        baseRentAmountCents - commissionAmountCents - ownerFeeDeduction,
      );
      const paymentMethod = input.payment_method ?? contract.preferred_payment_method ?? "pix";
      const chargeStatus = chargeInitialStatus(paymentMethod);
      const gatewayAccount = await findActiveGatewayAccount(companyId, paymentMethod);

      const { data: entry, error: entryError } = await supabaseAdmin
        .from("financial_entries")
        .insert({
          company_id: companyId,
          contract_id: contract.id,
          property_id: contract.property_id,
          owner_id: property?.owner_id ?? null,
          created_by: userId,
          title: `Cobrança de aluguel - ${contract.title}`,
          description: input.notes || "Cobrança gerada automaticamente a partir do contrato de locação.",
          entry_type: "income",
          category: "Aluguel",
          status: "open",
          amount_cents: grossAmountCents,
          due_date: input.due_date,
          competence_date: `${input.due_date.slice(0, 7)}-01`,
          payment_method: paymentMethod,
          metadata: {
            source: "rental_charge",
            base_rent_amount_cents: baseRentAmountCents,
            fee_amount_cents: feeAmountCents,
            fee_payer: feePayer,
            fee_acceptance_required: feeAcceptanceRequired,
            fee_acceptance_confirmed: feeAcceptanceConfirmed,
            commission_amount_cents: commissionAmountCents,
            net_owner_amount_cents: netOwnerAmountCents,
          },
        })
        .select(entrySelect)
        .single();

      if (entryError) throw entryError;

      const { data: charge, error: chargeError } = await supabaseAdmin
        .from("financial_charges")
        .insert({
          company_id: companyId,
          contract_id: contract.id,
          property_id: contract.property_id,
          owner_id: property?.owner_id ?? null,
          tenant_party_id: tenant?.id ?? null,
          entry_id: entry.id,
          gateway_account_id: gatewayAccount?.id ?? null,
          payment_method: paymentMethod,
          gross_amount_cents: grossAmountCents,
          base_rent_amount_cents: baseRentAmountCents,
          fee_amount_cents: feeAmountCents,
          fee_payer: feePayer,
          fee_acceptance_required: feeAcceptanceRequired,
          fee_acceptance_confirmed: feeAcceptanceConfirmed,
          fee_acceptance_json: {
            accepted: feeAcceptanceConfirmed,
            accepted_at: feeAcceptanceConfirmed ? new Date().toISOString() : null,
            accepted_by: feeAcceptanceConfirmed ? userId : null,
            reference_document: input.fee_acceptance_reference || null,
            source: input.fee_acceptance_confirmed ? "manual_admin" : "contract_rule",
          },
          commission_amount_cents: commissionAmountCents,
          net_owner_amount_cents: netOwnerAmountCents,
          due_date: input.due_date,
          status: chargeStatus,
          metadata: buildChargeMetadata({ tenant, notes: input.notes || null }),
          created_by: userId,
        })
        .select(chargeSelect)
        .single();

      if (chargeError) throw chargeError;

      const { error: commissionError } = await supabaseAdmin.from("commissions").insert({
        company_id: companyId,
        charge_id: charge.id,
        contract_id: contract.id,
        base_amount_cents: baseRentAmountCents,
        commission_rate:
          commissionType === "percentage" ? input.commission_rate ?? contract.commission_rate ?? 0 : null,
        amount_cents: commissionAmountCents,
        status: "pending",
        due_date: input.due_date,
        notes: `Comissão vinculada à cobrança ${charge.id}`,
      });

      if (commissionError) throw commissionError;

      const { error: transferError } = await supabaseAdmin.from("owner_transfers").insert({
        company_id: companyId,
        charge_id: charge.id,
        contract_id: contract.id,
        property_id: contract.property_id,
        owner_id: property?.owner_id ?? null,
        gross_amount_cents: baseRentAmountCents,
        deductions_cents: commissionAmountCents + ownerFeeDeduction,
        net_amount_cents: netOwnerAmountCents,
        status: "pending",
        due_date: addDays(input.due_date, contract.transfer_day_offset ?? 1),
        notes: `Repasse calculado a partir da cobrança ${charge.id}`,
      });

      if (transferError) throw transferError;

      if (feeAcceptanceRequired) {
        const { error: feeAcceptanceError } = await supabaseAdmin
          .from("operational_fee_acceptance_logs")
          .insert({
            company_id: companyId,
            contract_id: contract.id,
            charge_id: charge.id,
            fee_payer: feePayer,
            fee_amount_cents: feeAmountCents,
            accepted: feeAcceptanceConfirmed,
            acceptance_source: input.fee_acceptance_confirmed ? "manual_admin" : "contract_rule",
            reference_document: input.fee_acceptance_reference || null,
            ip_address: clientIp(req),
            user_id: userId,
            metadata: {
              payment_method: paymentMethod,
              tenant_id: tenant?.id ?? null,
              property_id: contract.property_id,
            },
          });

        if (feeAcceptanceError) throw feeAcceptanceError;
      }

      await writeAuditLog({
        company_id: companyId,
        charge_id: charge.id,
        entry_id: entry.id,
        contract_id: contract.id,
        owner_id: property?.owner_id ?? null,
        user_id: userId,
        event_type: "charge.created_from_contract",
        gross_amount_cents: grossAmountCents,
        net_amount_cents: netOwnerAmountCents,
        commission_amount_cents: commissionAmountCents,
        fee_amount_cents: feeAmountCents,
        status_after: chargeStatus,
        metadata: {
          payment_method: paymentMethod,
          gateway_account_id: gatewayAccount?.id ?? null,
          gateway_provider: gatewayAccount?.provider ?? null,
          gateway_environment:
            typeof gatewayAccount?.settings?.environment === "string"
              ? gatewayAccount.settings.environment
              : null,
          fee_payer: feePayer,
          fee_acceptance_required: feeAcceptanceRequired,
          fee_acceptance_confirmed: feeAcceptanceConfirmed,
          tenant_id: tenant?.id ?? null,
        },
      });

      const usageEvents = [
        recordUsageEvent({
          companyId,
          userId,
          metricKey: "charge_generated",
          source: "finance_charge_created",
          relatedEntityType: "financial_charge",
          relatedEntityId: charge.id,
          metadata: {
            contract_id: contract.id,
            property_id: contract.property_id,
            payment_method: paymentMethod,
            gross_amount_cents: grossAmountCents,
          },
        }),
      ];

      if (paymentMethod === "pix" || paymentMethod === "hybrid") {
        usageEvents.push(
          recordUsageEvent({
            companyId,
            userId,
            metricKey: "pix_generated",
            source: "finance_charge_created",
            relatedEntityType: "financial_charge",
            relatedEntityId: charge.id,
            metadata: {
              contract_id: contract.id,
              property_id: contract.property_id,
              gross_amount_cents: grossAmountCents,
            },
          }),
        );
      }

      if (paymentMethod === "boleto" || paymentMethod === "hybrid") {
        usageEvents.push(
          recordUsageEvent({
            companyId,
            userId,
            metricKey: "boleto_generated",
            source: "finance_charge_created",
            relatedEntityType: "financial_charge",
            relatedEntityId: charge.id,
            metadata: {
              contract_id: contract.id,
              property_id: contract.property_id,
              gross_amount_cents: grossAmountCents,
              operational_fee_cents: feeAmountCents,
            },
          }),
        );
      }

      await Promise.all(usageEvents);

      res.status(201).json({ charge, entry });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/charges/:id/confirm-payment",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const chargeId = readParam(req.params.id);
      const input = chargePaymentSchema.parse(req.body);

      if (!chargeId) {
        return res.status(404).json({
          error: "FINANCIAL_CHARGE_NOT_FOUND",
          message: "Cobrança não encontrada.",
        });
      }

      const charge = await ensureChargeBelongsToCompany(chargeId, companyId);
      const paidAt = input.paid_at || new Date().toISOString();

      if (charge.entry_id) {
        const { error: paymentError } = await supabaseAdmin.from("financial_payments").insert({
          company_id: companyId,
          entry_id: charge.entry_id,
          amount_cents: charge.gross_amount_cents,
          payment_method: input.payment_method || "manual_exception",
          paid_at: paidAt,
          notes: input.notes || "Confirmação manual de exceção registrada com auditoria.",
          created_by: userId,
        });

        if (paymentError) throw paymentError;

        const { error: entryError } = await supabaseAdmin
          .from("financial_entries")
          .update({
            status: "paid",
            paid_at: paidAt,
            payment_method: input.payment_method || "manual_exception",
          })
          .eq("id", charge.entry_id)
          .eq("company_id", companyId);

        if (entryError) throw entryError;
      }

      const { data: updatedCharge, error: chargeError } = await supabaseAdmin
        .from("financial_charges")
        .update({
          status: charge.owner_id ? "transfer_pending" : "paid",
          paid_at: paidAt,
        })
        .eq("id", charge.id)
        .eq("company_id", companyId)
        .select(chargeSelect)
        .single();

      if (chargeError) throw chargeError;

      await writeAuditLog({
        company_id: companyId,
        charge_id: charge.id,
        entry_id: charge.entry_id,
        contract_id: charge.contract_id,
        owner_id: charge.owner_id,
        user_id: userId,
        event_type: "charge.manual_payment_confirmed",
        gross_amount_cents: charge.gross_amount_cents,
        net_amount_cents: charge.net_owner_amount_cents,
        commission_amount_cents: charge.commission_amount_cents,
        fee_amount_cents: charge.fee_amount_cents,
        status_before: charge.status,
        status_after: charge.owner_id ? "transfer_pending" : "paid",
        metadata: {
          note: input.notes || null,
          manual_exception: true,
        },
      });

      const [commissionStatusUpdate, transferStatusUpdate] = await Promise.all([
        supabaseAdmin
          .from("commissions")
          .update({ status: "approved" })
          .eq("company_id", companyId)
          .eq("charge_id", charge.id)
          .eq("status", "pending"),
        supabaseAdmin
          .from("owner_transfers")
          .update({ status: "approved" })
          .eq("company_id", companyId)
          .eq("charge_id", charge.id)
          .eq("status", "pending"),
      ]);

      if (commissionStatusUpdate.error) throw commissionStatusUpdate.error;
      if (transferStatusUpdate.error) throw transferStatusUpdate.error;

      res.json({ charge: updatedCharge });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/charges/:id/sync-gateway-customer",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const chargeId = readParam(req.params.id);

      if (!chargeId) {
        return res.status(404).json({
          error: "FINANCIAL_CHARGE_NOT_FOUND",
          message: "Cobrança não encontrada.",
        });
      }

      const charge = await loadChargeForGatewayIssue(chargeId, companyId);
      if (charge.payment_method === "manual") {
        return res.status(422).json({
          error: "MANUAL_CHARGE_CANNOT_SYNC_CUSTOMER",
          message: "Cobrança manual não precisa sincronizar cliente no gateway.",
        });
      }

      if (!charge.tenant_party_id) {
        return res.status(422).json({
          error: "TENANT_REQUIRED_FOR_GATEWAY_CUSTOMER",
          message: "Vincule um inquilino ao contrato antes de sincronizar cliente no gateway.",
        });
      }

      const gatewayAccount = await loadGatewayAccountForIssue({
        companyId,
        gatewayAccountId: charge.gateway_account_id,
        paymentMethod: charge.payment_method,
      });

      if (!gatewayAccount) {
        return res.status(422).json({
          error: "PAYMENT_GATEWAY_NOT_CONFIGURED",
          message: "Configure um gateway financeiro ativo ou em teste antes de sincronizar o cliente.",
        });
      }

      const tenant = await loadTenantPartyForGatewaySync({
        companyId,
        tenantPartyId: charge.tenant_party_id,
      });
      const syncResult = await syncGatewayCustomer({
        party: tenant,
        gatewayAccount: gatewayAccount as GatewayAccountForIssue,
      });
      const customerId = syncResult.customer_update?.gateway_customer_id ?? null;

      if (syncResult.customer_update) {
        const { error: tenantUpdateError } = await supabaseAdmin
          .from("contract_parties")
          .update(syncResult.customer_update)
          .eq("id", tenant.id)
          .eq("company_id", companyId);

        if (tenantUpdateError) throw tenantUpdateError;
      } else {
        const { error: tenantStatusError } = await supabaseAdmin
          .from("contract_parties")
          .update({
            gateway_provider: gatewayAccount.provider,
            gateway_customer_status: syncResult.status === "prepared" ? "prepared" : syncResult.status,
            gateway_metadata: {
              ...tenant.gateway_metadata,
              last_sync_result: syncResult,
            },
          })
          .eq("id", tenant.id)
          .eq("company_id", companyId);

        if (tenantStatusError) throw tenantStatusError;
      }

      const chargeMetadata =
        charge.metadata && typeof charge.metadata === "object" ? charge.metadata : {};
      const { data: updatedCharge, error: chargeUpdateError } = await supabaseAdmin
        .from("financial_charges")
        .update({
          gateway_account_id: gatewayAccount.id,
          metadata: {
            ...mergeTenantGatewayMetadata(chargeMetadata, tenant, customerId),
            gateway_customer_sync: syncResult,
          },
        })
        .eq("id", charge.id)
        .eq("company_id", companyId)
        .select(chargeSelect)
        .single();

      if (chargeUpdateError) throw chargeUpdateError;

      await writeAuditLog({
        company_id: companyId,
        charge_id: charge.id,
        entry_id: charge.entry_id,
        contract_id: charge.contract_id,
        owner_id: charge.owner_id,
        user_id: userId,
        event_type: `gateway_customer.${syncResult.status}`,
        gross_amount_cents: charge.gross_amount_cents,
        status_before: charge.status,
        status_after: charge.status,
        metadata: {
          provider: gatewayAccount.provider,
          gateway_account_id: gatewayAccount.id,
          tenant_party_id: tenant.id,
          gateway_customer_id: customerId,
          connector_status: syncResult.connector_status,
          real_api_call: syncResult.real_api_call,
          provider_http_status: syncResult.provider_http_status ?? null,
          provider_error: syncResult.provider_error ?? null,
        },
      });

      res.json({
        charge: updatedCharge,
        gateway_customer: {
          provider: gatewayAccount.provider,
          status: syncResult.status,
          connector_status: syncResult.connector_status,
          real_api_call: syncResult.real_api_call,
          gateway_customer_id: customerId,
          next_step: syncResult.next_step,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/charges/:id/issue-payment",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const chargeId = readParam(req.params.id);

      if (!chargeId) {
        return res.status(404).json({
          error: "FINANCIAL_CHARGE_NOT_FOUND",
          message: "Cobrança não encontrada.",
        });
      }

      const charge = await loadChargeForGatewayIssue(chargeId, companyId);
      if (charge.payment_method === "manual") {
        return res.status(422).json({
          error: "MANUAL_CHARGE_CANNOT_BE_ISSUED",
          message: "Cobrança manual não deve ser enviada para gateway financeiro.",
        });
      }

      if (["paid", "cancelled", "refunded", "transferred"].includes(charge.status)) {
        return res.status(422).json({
          error: "CHARGE_STATUS_NOT_ISSUABLE",
          message: "Esta cobrança não pode ser preparada para emissão no status atual.",
        });
      }

      const gatewayAccount = await loadGatewayAccountForIssue({
        companyId,
        gatewayAccountId: charge.gateway_account_id,
        paymentMethod: charge.payment_method,
      });

      if (!gatewayAccount) {
        return res.status(422).json({
          error: "PAYMENT_GATEWAY_NOT_CONFIGURED",
          message: "Configure um gateway financeiro ativo ou em teste antes de emitir PIX ou boleto.",
        });
      }

      const gatewayIssue = await issueGatewayCharge({
        charge,
        gatewayAccount: gatewayAccount as GatewayAccountForIssue,
      });
      const metadata = charge.metadata && typeof charge.metadata === "object" ? charge.metadata : {};
      const chargeUpdate = gatewayIssue.charge_update ?? {};
      const nextChargeStatus = gatewayIssue.status === "issued" ? "waiting_payment" : charge.status;
      const chargeUpdatePayload: Record<string, unknown> = {
        gateway_account_id: gatewayAccount.id,
        status: nextChargeStatus,
        metadata: {
          ...metadata,
          gateway_issue: gatewayIssue,
        },
      };

      for (const [key, value] of Object.entries(chargeUpdate)) {
        if (value) chargeUpdatePayload[key] = value;
      }

      const { data: updatedCharge, error: updateError } = await supabaseAdmin
        .from("financial_charges")
        .update(chargeUpdatePayload)
        .eq("id", charge.id)
        .eq("company_id", companyId)
        .select(chargeSelect)
        .single();

      if (updateError) throw updateError;

      await writeAuditLog({
        company_id: companyId,
        charge_id: charge.id,
        entry_id: charge.entry_id,
        contract_id: charge.contract_id,
        owner_id: charge.owner_id,
        user_id: userId,
        event_type: `charge.gateway_issue_${gatewayIssue.status}`,
        gross_amount_cents: charge.gross_amount_cents,
        status_before: charge.status,
        status_after: nextChargeStatus,
        metadata: {
          provider: gatewayAccount.provider,
          gateway_account_id: gatewayAccount.id,
          gateway_charge_id: chargeUpdate.gateway_charge_id ?? null,
          payment_methods: gatewayIssue.request_payload.payment_methods,
          connector_status: gatewayIssue.connector_status,
          real_api_call: gatewayIssue.real_api_call,
          provider_http_status: gatewayIssue.provider_http_status ?? null,
          provider_error: gatewayIssue.provider_error ?? null,
        },
      });

      res.json({
        charge: updatedCharge,
        gateway_issue: {
          provider: gatewayAccount.provider,
          status: gatewayIssue.status,
          connector_status: gatewayIssue.connector_status,
          real_api_call: gatewayIssue.real_api_call,
          next_step: gatewayIssue.next_step,
          payment_url: chargeUpdate.payment_url ?? null,
          boleto_pdf_url: chargeUpdate.boleto_pdf_url ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/charges/:id/prepare-notification",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const chargeId = readParam(req.params.id);
      const input = chargeNotificationSchema.parse(req.body);

      if (!chargeId) {
        return res.status(404).json({
          error: "FINANCIAL_CHARGE_NOT_FOUND",
          message: "Cobrança não encontrada.",
        });
      }

      const charge = await loadChargeForNotification(chargeId, companyId);
      const tenant = await findTenantForCharge({
        companyId,
        contractId: charge.contract_id,
        tenantPartyId: charge.tenant_party_id,
      });

      if (!tenant) {
        return res.status(422).json({
          error: "TENANT_CONTACT_REQUIRED",
          message: "Cadastre um inquilino no contrato para preparar a notificação.",
        });
      }

      const recipientContact = input.channel === "whatsapp" ? tenant.phone : tenant.email;

      if (!recipientContact) {
        return res.status(422).json({
          error: "RECIPIENT_CONTACT_REQUIRED",
          message:
            input.channel === "whatsapp"
              ? "Cadastre um telefone do inquilino para preparar WhatsApp."
              : "Cadastre um e-mail do inquilino para preparar e-mail.",
        });
      }

      const paymentLink =
        charge.payment_url ||
        charge.boleto_pdf_url ||
        (tenant.portal_token ? `${env.APP_URL}/portal/inquilino/${tenant.portal_token}` : env.APP_URL);
      const variables = {
        recipient_name: tenant.name,
        amount: formatMoney(charge.gross_amount_cents),
        due_date: formatDate(charge.due_date),
        payment_link: paymentLink,
        contract_title: charge.contracts?.title ?? "contrato de locação",
      };
      const template = await findNotificationTemplate({
        templateKey: input.notification_type,
        channel: input.channel,
        companyId,
      });
      const body = template?.body
        ? renderTemplate(template.body, variables)
        : buildFallbackChargeMessage({
            notificationType: input.notification_type,
            recipientName: variables.recipient_name,
            amount: variables.amount,
            dueDate: variables.due_date,
            paymentLink,
          });
      const subject = template?.subject ? renderTemplate(template.subject, variables) : null;

      const { data: event, error } = await supabaseAdmin
        .from("notification_events")
        .insert({
          company_id: companyId,
          template_id: template?.id ?? null,
          channel: input.channel,
          direction: "outbound",
          recipient_type: "tenant",
          recipient_id: tenant.id,
          recipient_name: tenant.name,
          recipient_contact: recipientContact,
          subject,
          body,
          status: "prepared",
          provider: "manual",
          related_entity_type: "financial_charge",
          related_entity_id: charge.id,
          metadata: {
            notification_type: input.notification_type,
            payment_link: paymentLink,
            charge_status: charge.status,
            due_date: charge.due_date,
          },
          created_by: userId,
        })
        .select(dispatchEventSelect)
        .single();

      if (error) throw error;

      await writeAuditLog({
        company_id: companyId,
        charge_id: charge.id,
        contract_id: charge.contract_id,
        owner_id: charge.owner_id,
        user_id: userId,
        event_type: `charge.notification_prepared.${input.notification_type}`,
        gross_amount_cents: charge.gross_amount_cents,
        status_before: charge.status,
        status_after: charge.status,
        metadata: {
          channel: input.channel,
          recipient_type: "tenant",
          recipient_id: tenant.id,
          notification_event_id: event.id,
        },
      });

      if (input.channel === "whatsapp") {
        await recordUsageEvent({
          companyId,
          userId,
          metricKey: "whatsapp_message",
          source: "finance_notification_prepared",
          relatedEntityType: "notification_event",
          relatedEntityId: event.id,
          metadata: {
            charge_id: charge.id,
            contract_id: charge.contract_id,
            notification_type: input.notification_type,
            status: "prepared",
          },
        });
      }

      res.status(201).json({ event });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.get(
  "/entries",
  requirePermission("finance.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;

      let query = supabaseAdmin
        .from("financial_entries")
        .select(entrySelect)
        .eq("company_id", companyId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) throw error;

      res.json({ entries: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/entries",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = entrySchema.parse(req.body);
      const contractId = await ensureLinkedRecord(
        "contracts",
        input.contract_id || null,
        companyId,
        "INVALID_CONTRACT",
      );
      const propertyId = await ensureLinkedRecord(
        "properties",
        input.property_id || null,
        companyId,
        "INVALID_PROPERTY",
      );
      const ownerId = await ensureLinkedRecord(
        "property_owners",
        input.owner_id || null,
        companyId,
        "INVALID_OWNER",
      );
      const leadId = await ensureLinkedRecord("leads", input.lead_id || null, companyId, "INVALID_LEAD");

      const { data: entry, error } = await supabaseAdmin
        .from("financial_entries")
        .insert({
          ...cleanEmpty(input),
          contract_id: contractId,
          property_id: propertyId,
          owner_id: ownerId,
          lead_id: leadId,
          company_id: companyId,
          created_by: userId,
        })
        .select(entrySelect)
        .single();

      if (error) throw error;

      res.status(201).json({ entry });
    } catch (error) {
      next(error);
    }
  },
);

financeRouter.post(
  "/entries/:id/payments",
  requirePermission("finance.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const entryId = readParam(req.params.id);
      const input = paymentSchema.parse(req.body);

      if (!entryId) {
        return res.status(404).json({
          error: "FINANCIAL_ENTRY_NOT_FOUND",
          message: "Lançamento financeiro não encontrado.",
        });
      }

      const entry = await ensureEntryBelongsToCompany(entryId, companyId);
      const accountId = await ensureLinkedRecord(
        "financial_accounts",
        input.account_id || null,
        companyId,
        "INVALID_FINANCIAL_ACCOUNT",
      );
      const amountCents = input.amount_cents ?? entry.amount_cents;
      const paidAt = input.paid_at || new Date().toISOString();

      const { data: payment, error: paymentError } = await supabaseAdmin
        .from("financial_payments")
        .insert({
          ...cleanEmpty(input),
          entry_id: entryId,
          account_id: accountId,
          company_id: companyId,
          amount_cents: amountCents,
          paid_at: paidAt,
          created_by: userId,
        })
        .select(paymentSelect)
        .single();

      if (paymentError) throw paymentError;

      const { data: updatedEntry, error: entryError } = await supabaseAdmin
        .from("financial_entries")
        .update({
          status: "paid",
          paid_at: paidAt,
          payment_method: input.payment_method || null,
        })
        .eq("id", entryId)
        .eq("company_id", companyId)
        .select(entrySelect)
        .single();

      if (entryError) throw entryError;

      res.status(201).json({ payment, entry: updatedEntry });
    } catch (error) {
      next(error);
    }
  },
);

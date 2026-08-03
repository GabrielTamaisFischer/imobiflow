import { Router } from "express";
import type { Request } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export const publicPortalsRouter = Router();

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function notFound(message: string) {
  return Object.assign(new Error(message), {
    statusCode: 404,
    code: "PORTAL_NOT_FOUND",
  });
}

function clientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return req.socket.remoteAddress ?? null;
}

async function getCompany(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, name, status")
    .eq("id", companyId)
    .maybeSingle<{ id: string; name: string; status: string }>();

  if (error) throw error;
  return data;
}

async function logPortalAccess(input: {
  company_id: string;
  portal_type: "owner" | "tenant";
  owner_id?: string | null;
  contract_party_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}) {
  const { error } = await supabaseAdmin.from("portal_access_logs").insert({
    ...input,
    event_type: "view",
  });

  if (error) throw error;
}

publicPortalsRouter.get("/owners/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    if (!isUuid(token)) throw notFound("Portal do proprietário não encontrado.");

    const { data: owner, error: ownerError } = await supabaseAdmin
      .from("property_owners")
      .select("id, company_id, owner_type, name, document, email, phone, whatsapp, status, portal_enabled")
      .eq("portal_token", token)
      .eq("portal_enabled", true)
      .maybeSingle<{
        id: string;
        company_id: string;
        owner_type: string;
        name: string;
        document: string | null;
        email: string | null;
        phone: string | null;
        whatsapp: string | null;
        status: string;
        portal_enabled: boolean;
      }>();

    if (ownerError) throw ownerError;
    if (!owner || owner.status !== "active") throw notFound("Portal do proprietário não encontrado.");

    const [company, propertiesResponse, transfersResponse, chargesResponse] = await Promise.all([
      getCompany(owner.company_id),
      supabaseAdmin
        .from("properties")
        .select("id, code, title, operation, status, neighborhood, city, state, rent_price_cents, sale_price_cents")
        .eq("company_id", owner.company_id)
        .eq("owner_id", owner.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("owner_transfers")
        .select("id, charge_id, contract_id, property_id, gross_amount_cents, deductions_cents, net_amount_cents, status, due_date, paid_at, payment_method, receipt_url, receipt_reference, notes, created_at, contracts(id, title, contract_number), properties(id, code, title)")
        .eq("company_id", owner.company_id)
        .eq("owner_id", owner.id)
        .order("due_date", { ascending: false, nullsFirst: false })
        .limit(24),
      supabaseAdmin
        .from("financial_charges")
        .select("id, contract_id, property_id, payment_method, gross_amount_cents, commission_amount_cents, fee_amount_cents, net_owner_amount_cents, due_date, paid_at, status, contracts(id, title, contract_number), properties(id, code, title)")
        .eq("company_id", owner.company_id)
        .eq("owner_id", owner.id)
        .order("due_date", { ascending: false })
        .limit(24),
    ]);

    if (propertiesResponse.error) throw propertiesResponse.error;
    if (transfersResponse.error) throw transfersResponse.error;
    if (chargesResponse.error) throw chargesResponse.error;

    await Promise.all([
      supabaseAdmin
        .from("property_owners")
        .update({ portal_last_access_at: new Date().toISOString() })
        .eq("id", owner.id),
      logPortalAccess({
        company_id: owner.company_id,
        portal_type: "owner",
        owner_id: owner.id,
        ip_address: clientIp(req),
        user_agent: req.headers["user-agent"] ?? null,
      }),
    ]);

    res.json({
      owner,
      company,
      properties: propertiesResponse.data ?? [],
      transfers: transfersResponse.data ?? [],
      charges: chargesResponse.data ?? [],
    });
  } catch (error) {
    next(error);
  }
});

publicPortalsRouter.get("/tenants/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    if (!isUuid(token)) throw notFound("Portal do inquilino não encontrado.");

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("contract_parties")
      .select("id, company_id, contract_id, party_type, name, document, email, phone, portal_enabled")
      .eq("portal_token", token)
      .eq("portal_enabled", true)
      .eq("party_type", "tenant")
      .maybeSingle<{
        id: string;
        company_id: string;
        contract_id: string;
        party_type: string;
        name: string;
        document: string | null;
        email: string | null;
        phone: string | null;
        portal_enabled: boolean;
      }>();

    if (tenantError) throw tenantError;
    if (!tenant) throw notFound("Portal do inquilino não encontrado.");

    const [company, contractResponse, chargesResponse] = await Promise.all([
      getCompany(tenant.company_id),
      supabaseAdmin
        .from("contracts")
        .select("id, property_id, contract_number, title, contract_type, status, starts_at, ends_at, monthly_amount_cents, deposit_cents, properties(id, code, title, neighborhood, city, state)")
        .eq("company_id", tenant.company_id)
        .eq("id", tenant.contract_id)
        .maybeSingle(),
      supabaseAdmin
        .from("financial_charges")
        .select("id, contract_id, property_id, payment_method, gross_amount_cents, due_date, paid_at, status, pix_qr_code, pix_copy_paste, boleto_barcode, boleto_digitable_line, payment_url, boleto_pdf_url, contracts(id, title, contract_number), properties(id, code, title)")
        .eq("company_id", tenant.company_id)
        .eq("tenant_party_id", tenant.id)
        .order("due_date", { ascending: false }),
    ]);

    if (contractResponse.error) throw contractResponse.error;
    if (chargesResponse.error) throw chargesResponse.error;
    if (!contractResponse.data) throw notFound("Contrato do portal não encontrado.");

    await Promise.all([
      supabaseAdmin
        .from("contract_parties")
        .update({ portal_last_access_at: new Date().toISOString() })
        .eq("id", tenant.id),
      logPortalAccess({
        company_id: tenant.company_id,
        portal_type: "tenant",
        contract_party_id: tenant.id,
        ip_address: clientIp(req),
        user_agent: req.headers["user-agent"] ?? null,
      }),
    ]);

    res.json({
      tenant,
      company,
      contract: contractResponse.data,
      charges: chargesResponse.data ?? [],
    });
  } catch (error) {
    next(error);
  }
});

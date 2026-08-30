import { Router } from "express";
import type { Request } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { prisma } from "../services/mysql-real-estate.js";

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
  // Legado (Supabase): tabela portal_access_logs não tem equivalente em
  // Prisma/MySQL ainda. É apenas um log de auditoria complementar — o
  // acesso "de verdade" já fica registrado em PropertyOwner.portalLastAccessAt
  // (Prisma/MySQL). Por isso aqui é best-effort: nunca deve derrubar o portal
  // quando o Supabase legado não está configurado (ambiente local R$0).
  try {
    const { error } = await supabaseAdmin.from("portal_access_logs").insert({
      ...input,
      event_type: "view",
    });
    if (error) throw error;
  } catch {
    // intencional: log de auditoria complementar, não é crítico para o portal.
  }
}

/**
 * Dados financeiros (repasses/cobranças) do proprietário ainda vivem no
 * Supabase legado nesta fase (Financeiro não foi migrado na Fase A). Em vez
 * de derrubar o portal inteiro quando o Supabase não está configurado
 * (ambiente local R$0, sem projeto Supabase), essas seções degradam para
 * lista vazia — o núcleo do portal (dados do proprietário + imóveis, que já
 * são Prisma/MySQL) continua funcional e correto.
 */
async function loadOwnerFinancials(companyId: string, ownerId: string) {
  try {
    const [transfersResponse, chargesResponse] = await Promise.all([
      supabaseAdmin
        .from("owner_transfers")
        .select("id, charge_id, contract_id, property_id, gross_amount_cents, deductions_cents, net_amount_cents, status, due_date, paid_at, payment_method, receipt_url, receipt_reference, notes, created_at, contracts(id, title, contract_number), properties(id, code, title)")
        .eq("company_id", companyId)
        .eq("owner_id", ownerId)
        .order("due_date", { ascending: false, nullsFirst: false })
        .limit(24),
      supabaseAdmin
        .from("financial_charges")
        .select("id, contract_id, property_id, payment_method, gross_amount_cents, commission_amount_cents, fee_amount_cents, net_owner_amount_cents, due_date, paid_at, status, contracts(id, title, contract_number), properties(id, code, title)")
        .eq("company_id", companyId)
        .eq("owner_id", ownerId)
        .order("due_date", { ascending: false })
        .limit(24),
    ]);

    if (transfersResponse.error) throw transfersResponse.error;
    if (chargesResponse.error) throw chargesResponse.error;

    return { transfers: transfersResponse.data ?? [], charges: chargesResponse.data ?? [] };
  } catch {
    return { transfers: [], charges: [] };
  }
}

// A2 (corrigido): a Área do Proprietário lia de Supabase `property_owners`,
// uma tabela que nunca recebe as escritas do cadastro atual de proprietário
// (que grava em Prisma/MySQL via createMysqlOwner/updateMysqlOwner). Isso
// fazia todo proprietário cadastrado hoje receber 404 ao acessar seu portal.
// Corrigido para ler da mesma fonte que já é escrita: Prisma/MySQL.
publicPortalsRouter.get("/owners/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    if (!isUuid(token)) throw notFound("Portal do proprietário não encontrado.");

    const owner = await prisma().propertyOwner.findFirst({
      where: { portalToken: token, portalEnabled: true },
      select: {
        id: true,
        companyId: true,
        ownerType: true,
        name: true,
        document: true,
        email: true,
        phone: true,
        whatsapp: true,
        status: true,
      },
    });

    if (!owner || owner.status !== "active") throw notFound("Portal do proprietário não encontrado.");

    const [company, properties, financials] = await Promise.all([
      prisma().company.findFirst({ where: { id: owner.companyId }, select: { id: true, name: true, status: true } }),
      prisma().property.findMany({
        where: { companyId: owner.companyId, ownerId: owner.id, status: { not: "archived" } },
        select: {
          id: true,
          code: true,
          title: true,
          operation: true,
          status: true,
          neighborhood: true,
          city: true,
          state: true,
          rentPriceCents: true,
          salePriceCents: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      loadOwnerFinancials(owner.companyId, owner.id),
    ]);

    if (!company) throw notFound("Portal do proprietário não encontrado.");

    await Promise.all([
      prisma().propertyOwner.update({
        where: { id: owner.id },
        data: { portalLastAccessAt: new Date() },
      }),
      logPortalAccess({
        company_id: owner.companyId,
        portal_type: "owner",
        owner_id: owner.id,
        ip_address: clientIp(req),
        user_agent: req.headers["user-agent"] ?? null,
      }),
    ]);

    res.json({
      owner: {
        id: owner.id,
        company_id: owner.companyId,
        owner_type: owner.ownerType,
        name: owner.name,
        document: owner.document,
        email: owner.email,
        phone: owner.phone,
        whatsapp: owner.whatsapp,
        status: owner.status,
      },
      company,
      properties: properties.map((property) => ({
        id: property.id,
        code: property.code,
        title: property.title,
        operation: property.operation,
        status: property.status,
        neighborhood: property.neighborhood,
        city: property.city,
        state: property.state,
        rent_price_cents: property.rentPriceCents,
        sale_price_cents: property.salePriceCents,
      })),
      transfers: financials.transfers,
      charges: financials.charges,
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

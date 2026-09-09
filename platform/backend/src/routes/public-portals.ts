import { Router } from "express";
import type { Request } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  loadMysqlOwnerPortalCore,
  loadMysqlOwnerPortalDocumentFile,
  loadMysqlOwnerPortalDocuments,
  loadMysqlOwnerPortalLeadsSummary,
  touchMysqlOwnerPortalAccess,
} from "../services/mysql-real-estate.js";
import { getStorageProviderForName } from "../services/storage/index.js";
import { deliveryAccessForPurpose } from "../services/storage/purposes.js";
import { listFinancialEntriesForPortal } from "../services/mysql-finance.js";
import type { StorageProviderName, StorageResourceType } from "../services/storage/types.js";

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

async function loadOwnerFinancials(companyId: string, ownerId: string) {
  try {
    const entries = await listFinancialEntriesForPortal({ companyId, ownerId });
    const toCents = (amount: string) => Math.round(Number(amount) * 100);
    const status = (value: string) => value === "paid" ? "paid" : value === "cancelled" ? "cancelled" : "pending";
    const base = (entry: (typeof entries)[number]) => ({
      id: entry.id,
      contract_id: entry.contract_id ?? "",
      property_id: entry.property_id,
      due_date: entry.due_date ?? "",
      paid_at: entry.paid_at,
      status: status(entry.status),
      payment_method: entry.payment?.payment_method ?? "manual",
      notes: entry.payment?.notes ?? entry.description,
      created_at: entry.created_at,
      contracts: entry.contract ? { id: entry.contract.id, title: entry.contract.title, contract_number: null } : null,
      properties: entry.property ? { id: entry.property.id, code: entry.property.code, title: entry.property.title } : null,
    });
    return {
      transfers: entries.filter((entry) => entry.type === "payable" && entry.category === "owner_payout").map((entry) => ({
        ...base(entry),
        charge_id: null,
        gross_amount_cents: toCents(entry.amount),
        deductions_cents: 0,
        net_amount_cents: toCents(entry.amount),
        receipt_url: null,
        receipt_reference: null,
      })),
      charges: entries.filter((entry) => entry.type === "receivable" && entry.category === "rent").map((entry) => ({
        ...base(entry),
        gross_amount_cents: toCents(entry.amount),
        commission_amount_cents: 0,
        fee_amount_cents: 0,
        net_owner_amount_cents: toCents(entry.amount),
      })),
    };
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
    // loadMysqlOwnerPortalCore lança PORTAL_NOT_FOUND (404 tenant-safe) para
    // token ausente/mal formado, inexistente, portalEnabled=false ou
    // proprietário não ativo — nunca revela qual dessas condições ocorreu.
    const { owner, company, properties } = await loadMysqlOwnerPortalCore(token);
    const propertyIds = properties.map((property) => property.id);
    const [financials, leadsSummaryByProperty, documents] = await Promise.all([
      loadOwnerFinancials(owner.companyId, owner.id),
      // Fase 4C: nunca aceita property_id do cliente — sempre derivado da
      // lista de imóveis já resolvida tenant-safe acima.
      loadMysqlOwnerPortalLeadsSummary(owner.companyId, propertyIds),
      // Fase 4D: idem — ownerId/propertyIds sempre derivados do token já
      // resolvido, nunca do cliente.
      loadMysqlOwnerPortalDocuments(owner.companyId, owner.id, propertyIds),
    ]);

    await Promise.all([
      touchMysqlOwnerPortalAccess(owner.id),
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
        // Fase 4C: resumo de leads/negociações, sempre presente (nunca
        // undefined) para manter o payload determinístico mesmo sem
        // nenhum interesse registrado ainda.
        leads_summary: leadsSummaryByProperty.get(property.id) ?? {
          total_interessados: 0,
          visitas_agendadas: 0,
          ultimo_interesse_em: null,
          origem: null,
          estagio: null,
          status: "sem_interesse" as const,
          corretor_responsavel: null,
        },
      })),
      transfers: financials.transfers,
      charges: financials.charges,
      // Fase 4D: evolução aditiva — sempre presente (nunca undefined) para
      // manter o payload determinístico, mas 100% opcional para qualquer
      // consumidor antigo que ignore campos desconhecidos (compatibilidade
      // com o payload da F4B/F4C).
      documents,
    });
  } catch (error) {
    next(error);
  }
});

// Fase 4D — download/visualização de um documento do proprietário. Só
// existe porque o requisito de segurança de arquivo (nenhum arquivo privado
// pode virar público só para facilitar o portal) exige nunca expor a
// secureUrl bruta do provider de storage ao cliente: o token nunca é
// suficiente para "adivinhar" um link de arquivo, e um id de documento
// sozinho nunca é suficiente sem o token — ambos são validados juntos
// contra o mesmo proprietário/empresa já resolvidos, com purpose travado em
// owner_document. Cross-owner, cross-company, purpose errado ou id
// inexistente/arbitrário caem todos no mesmo 404 tenant-safe.
publicPortalsRouter.get("/owners/:token/documents/:documentId", async (req, res, next) => {
  try {
    const token = String(req.params.token ?? "");
    const documentId = String(req.params.documentId ?? "");
    const { owner } = await loadMysqlOwnerPortalCore(token);

    const file = await loadMysqlOwnerPortalDocumentFile(owner.companyId, owner.id, documentId);
    if (!file) throw notFound("Documento não encontrado.");

    // Nunca confiamos na secureUrl do cliente — ela nunca sai do backend:
    // buscamos o conteúdo aqui e servimos com nossos próprios headers
    // (Content-Type/Content-Disposition sanitizados), em vez de redirecionar
    // para a URL do provider (o que vazaria o domínio/host real do storage
    // e devolveria os headers do provider, fora do nosso controle).
    //
    // Fast-follow de privacidade (F4E, 2026-09-05): documento do
    // proprietário (`purpose: "owner_document"`) agora é armazenado no
    // Cloudinary como `type: "authenticated"` — a `secureUrl` persistida
    // NÃO abre mais o arquivo sozinha (Cloudinary recusa acesso não
    // assinado a um asset authenticated). Por isso, para este purpose,
    // NUNCA usamos `file.secureUrl` (que também poderia ser de um asset
    // legado, gravado antes desta correção — ver nota de compatibilidade
    // abaixo): sempre reconstruímos a URL de download a partir de dados
    // estruturados e confiáveis (publicId/resourceType/format resolvidos no
    // backend a partir do StoredFile, nunca do cliente) via
    // `provider.getAuthenticatedDownloadUrl`, curta (60s) e gerada só no
    // momento desta requisição — nunca persistida, nunca logada, nunca
    // enviada ao frontend.
    const deliveryAccess = deliveryAccessForPurpose(file.purpose);
    let fileUrl: string;
    if (deliveryAccess === "authenticated") {
      if (file.provider !== "cloudinary") {
        // Nenhum outro provider suporta authenticated hoje — configuração
        // inesperada, não um caso de uso real; falha sanitizada, sem
        // detalhe do provider ao cliente.
        throw Object.assign(new Error("Não foi possível carregar o documento no momento."), {
          statusCode: 502,
          code: "OWNER_DOCUMENT_FETCH_FAILED",
        });
      }
      const provider = getStorageProviderForName(file.provider as StorageProviderName);
      if (!provider.getAuthenticatedDownloadUrl) {
        throw Object.assign(new Error("Não foi possível carregar o documento no momento."), {
          statusCode: 502,
          code: "OWNER_DOCUMENT_FETCH_FAILED",
        });
      }
      fileUrl = provider.getAuthenticatedDownloadUrl({
        publicId: file.publicId,
        resourceType: file.resourceType as StorageResourceType,
        format: file.format,
      });
    } else {
      fileUrl = file.secureUrl;
    }

    let upstream: Response;
    try {
      upstream = await fetch(fileUrl);
    } catch {
      throw Object.assign(new Error("Não foi possível carregar o documento no momento."), {
        statusCode: 502,
        code: "OWNER_DOCUMENT_FETCH_FAILED",
      });
    }
    if (!upstream.ok) {
      // Cobre também o caso de um documento LEGADO: um StoredFile antigo com
      // purpose=owner_document mas gravado no Cloudinary como "upload"
      // (público) antes desta correção. A URL "authenticated" gerada acima
      // não vai encontrar esse asset (foi salvo com outro `type`), e o
      // Cloudinary responde com erro de autenticação/"not found" — cai
      // aqui, sanitizado, em vez de vazar detalhe do provider. Estratégia
      // de compatibilidade adotada: bloquear o download do documento legado
      // (nunca servir um arquivo sensível por engano) e exigir reupload —
      // não há rotina de migração automática de assets existentes nesta
      // correção (ver log da F4E/fast-follow no Obsidian).
      throw Object.assign(new Error("Não foi possível carregar o documento no momento."), {
        statusCode: 502,
        code: "OWNER_DOCUMENT_FETCH_FAILED",
      });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const disposition =
      file.mimeType === "application/pdf" || file.mimeType.startsWith("image/")
        ? "inline"
        : "attachment";
    const safeFilename = sanitizeDownloadFilename(file.originalFilename);

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", String(buffer.byteLength));
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
    );
    // Nunca deixar o navegador tentar "adivinhar"/executar o conteúdo como
    // outra coisa (ex.: um PDF malformado sendo tratado como HTML).
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
});

function sanitizeDownloadFilename(rawName: string) {
  // Remove separadores de path, caracteres de controle e aspas — nunca
  // confia no nome de arquivo original (veio de um upload) para compor um
  // header HTTP diretamente.
  const cleaned = rawName
    .replace(/[/\\]/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/["\x00-\x1f]/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 150) : "documento";
}

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

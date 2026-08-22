import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { isSubscriptionAllowed } from "../services/access-context.js";
import type { SubscriptionStatus } from "../types/access.js";

export const publicInspectionsRouter = Router();

const publicSignatureSelect =
  "id, company_id, inspection_id, signer_name, signer_document, signer_email, signer_phone, signer_role, status, signature_token, signature_url, signature_text, signed_at, ip_address, signed_user_agent, signed_payload, expires_at, created_at, updated_at";

const publicInspectionSelect =
  "id, company_id, property_id, inspection_type, status, scheduled_at, completed_at, title, summary, tenant_name, tenant_document, owner_name, pdf_url, metadata, created_at, updated_at, properties(id, code, title, neighborhood, city, state)";

const signPublicSignatureSchema = z.object({
  signature_text: z.string().min(2).max(180),
  accepted_terms: z.literal(true),
});

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function publicSignatureView<T extends Record<string, unknown>>(signature: T) {
  const { signature_token: _signatureToken, ...view } = signature;
  return view;
}

function publicContextView(context: {
  signature: Record<string, unknown>;
  inspection: Record<string, unknown>;
  company: Record<string, unknown>;
}) {
  return { ...context, signature: publicSignatureView(context.signature) };
}

async function loadPublicSignatureContext(token: string) {
  const { data: signature, error: signatureError } = await supabaseAdmin
    .from("inspection_signatures")
    .select(publicSignatureSelect)
    .eq("signature_token", token)
    .maybeSingle();

  if (signatureError) throw signatureError;
  if (!signature) {
    throw Object.assign(new Error("Link de assinatura inválido."), {
      statusCode: 404,
      code: "PUBLIC_SIGNATURE_NOT_FOUND",
    });
  }

  const [{ data: inspection, error: inspectionError }, { data: company, error: companyError }, { data: subscription, error: subscriptionError }] =
    await Promise.all([
      supabaseAdmin
        .from("inspections")
        .select(publicInspectionSelect)
        .eq("id", signature.inspection_id)
        .eq("company_id", signature.company_id)
        .maybeSingle(),
      supabaseAdmin
        .from("companies")
        .select("id, name, status")
        .eq("id", signature.company_id)
        .maybeSingle<{ id: string; name: string; status: string }>(),
      supabaseAdmin
        .from("subscriptions")
        .select("id, status, plan_id, expires_at")
        .eq("company_id", signature.company_id)
        .maybeSingle<{ id: string; status: SubscriptionStatus; plan_id: string | null; expires_at: string | null }>(),
    ]);

  if (inspectionError) throw inspectionError;
  if (companyError) throw companyError;
  if (subscriptionError) throw subscriptionError;
  if (!inspection || !company) {
    throw Object.assign(new Error("Vistoria não encontrada."), {
      statusCode: 404,
      code: "PUBLIC_INSPECTION_NOT_FOUND",
    });
  }

  if (company.status !== "active") {
    throw Object.assign(new Error("Empresa temporariamente indisponível para assinatura."), {
      statusCode: 403,
      code: "COMPANY_INACTIVE",
    });
  }

  if (!isSubscriptionAllowed(subscription?.status, subscription?.expires_at)) {
    throw Object.assign(new Error("Assinatura da imobiliária inativa. Solicite regularização do plano."), {
      statusCode: 402,
      code: "SUBSCRIPTION_INACTIVE",
    });
  }

  if (["cancelled", "expired", "signed"].includes(signature.status)) {
    throw Object.assign(new Error("Link de assinatura não está mais ativo."), {
      statusCode: 410,
      code: "PUBLIC_SIGNATURE_INACTIVE",
    });
  }

  if (["completed", "cancelled", "archived"].includes(inspection.status)) {
    throw Object.assign(new Error("Vistoria não está mais disponível para assinatura."), {
      statusCode: 410,
      code: "PUBLIC_INSPECTION_NOT_SIGNABLE",
    });
  }

  if (signature.expires_at && new Date(signature.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin
      .from("inspection_signatures")
      .update({ status: "expired" })
      .eq("id", signature.id)
      .eq("status", "pending");

    throw Object.assign(new Error("Link de assinatura expirado."), {
      statusCode: 410,
      code: "PUBLIC_SIGNATURE_EXPIRED",
    });
  }

  return { signature, inspection, company };
}

async function refreshInspectionSignatureStatus(companyId: string, inspectionId: string) {
  const { count, error } = await supabaseAdmin
    .from("inspection_signatures")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("inspection_id", inspectionId)
    .eq("status", "pending");

  if (error) throw error;

  const nextStatus = count === 0 ? "completed" : "waiting_signature";
  const payload =
    nextStatus === "completed"
      ? { status: nextStatus, completed_at: new Date().toISOString() }
      : { status: nextStatus };

  const { data, error: updateError } = await supabaseAdmin
    .from("inspections")
    .update(payload)
    .eq("company_id", companyId)
    .eq("id", inspectionId)
    .select(publicInspectionSelect)
    .single();

  if (updateError) throw updateError;
  return data;
}

publicInspectionsRouter.get("/signatures/:token", async (req, res, next) => {
  try {
    const token = readParam(req.params.token);
    if (!token) throw Object.assign(new Error("Token de assinatura não informado."), { statusCode: 400 });

    const context = await loadPublicSignatureContext(token);
    res.json(publicContextView(context));
  } catch (error) {
    next(error);
  }
});

publicInspectionsRouter.post("/signatures/:token/sign", async (req, res, next) => {
  try {
    const token = readParam(req.params.token);
    if (!token) throw Object.assign(new Error("Token de assinatura não informado."), { statusCode: 400 });

    const { signature: currentSignature, inspection, company } = await loadPublicSignatureContext(token);
    const input = signPublicSignatureSchema.parse(req.body);
    const signedAt = new Date().toISOString();
    const { data: signature, error } = await supabaseAdmin
      .from("inspection_signatures")
      .update({
        status: "signed",
        signature_text: input.signature_text,
        signed_at: signedAt,
        ip_address: req.ip,
        signed_user_agent: req.headers["user-agent"] ?? null,
        signed_payload: {
          accepted_terms: input.accepted_terms,
          signed_publicly: true,
          signed_at: signedAt,
        },
      })
      .eq("id", currentSignature.id)
      .eq("signature_token", token)
      .eq("status", "pending")
      .select(publicSignatureSelect)
      .single();

    if (error) throw error;

    const updatedInspection = await refreshInspectionSignatureStatus(signature.company_id, signature.inspection_id);

    res.json(publicContextView({ signature, inspection: updatedInspection, company }));
  } catch (error) {
    next(error);
  }
});

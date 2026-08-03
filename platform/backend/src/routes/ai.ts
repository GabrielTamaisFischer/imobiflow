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

export const aiRouter = Router();

aiRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const aiFeatureSchema = z.enum([
  "property_description",
  "whatsapp_message",
  "inspection_summary",
  "lead_analysis",
  "contract_summary",
  "other",
]);

const aiRequestSchema = z.object({
  feature: aiFeatureSchema,
  entity_type: z
    .enum(["property", "lead", "inspection", "contract", "rental", "manual", "other"])
    .default("manual"),
  entity_id: z.string().uuid().optional().or(z.literal("")),
  input_text: z.string().max(8000).optional().or(z.literal("")),
  instructions: z.string().max(3000).optional().or(z.literal("")),
  template_key: z.string().max(120).optional().or(z.literal("")),
});

const requestSelect =
  "id, company_id, user_id, template_id, feature, status, entity_type, entity_id, input_text, instructions, source_context, result_text, provider, model, credits_estimated, credits_charged, error_message, metadata, created_at, updated_at, completed_at";

const templateSelect =
  "id, company_id, template_key, feature, name, description, system_prompt, required_context, status, created_at, updated_at";

type AiRequestRow = {
  id: string;
  company_id: string;
  user_id: string | null;
  feature: string;
  status: string;
  entity_type: string | null;
  entity_id: string | null;
  credits_estimated: number;
  credits_charged: number;
  created_at: string;
};

const planCreditLimits: Record<string, number> = {
  start: 50,
  pro: 250,
  enterprise: 1000,
  "enterprise-ai": 1500,
};

aiRouter.get(
  "/overview",
  requirePermission("ai.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const period = currentMonthPeriod();
      const balance = await ensureCurrentCreditBalance(
        companyId,
        req.access!.subscription?.plan_slug,
        period,
      );

      const [requestsResponse, usageResponse, templatesResponse] = await Promise.all([
        supabaseAdmin
          .from("ai_generation_requests")
          .select(requestSelect)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabaseAdmin
          .from("ai_usage_events")
          .select("feature, total_tokens, estimated_cost_cents, status, created_at")
          .eq("company_id", companyId)
          .gte("created_at", `${period.periodStart}T00:00:00.000Z`)
          .lte("created_at", `${period.periodEnd}T23:59:59.999Z`),
        supabaseAdmin
          .from("ai_prompt_templates")
          .select(templateSelect)
          .or(`company_id.is.null,company_id.eq.${companyId}`)
          .eq("status", "active")
          .order("feature", { ascending: true })
          .order("company_id", { ascending: true, nullsFirst: true }),
      ]);

      if (requestsResponse.error) throw requestsResponse.error;
      if (usageResponse.error) throw usageResponse.error;
      if (templatesResponse.error) throw templatesResponse.error;

      const requests = (requestsResponse.data ?? []) as AiRequestRow[];
      const usage = usageResponse.data ?? [];

      res.json({
        balance,
        requests,
        templates: templatesResponse.data ?? [],
        usage_summary: {
          total_requests: requests.length,
          completed_requests: requests.filter((item) => item.status === "completed").length,
          pending_provider_requests: requests.filter((item) => item.status === "pending_provider")
            .length,
          failed_requests: requests.filter((item) => item.status === "failed").length,
          tokens_used: usage.reduce((sum, item) => sum + Number(item.total_tokens ?? 0), 0),
          estimated_cost_cents: usage.reduce(
            (sum, item) => sum + Number(item.estimated_cost_cents ?? 0),
            0,
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

aiRouter.get(
  "/requests",
  requirePermission("ai.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 100);

      const { data, error } = await supabaseAdmin
        .from("ai_generation_requests")
        .select(requestSelect)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      res.json({ requests: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

aiRouter.get(
  "/templates",
  requirePermission("ai.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;

      const { data, error } = await supabaseAdmin
        .from("ai_prompt_templates")
        .select(templateSelect)
        .or(`company_id.is.null,company_id.eq.${companyId}`)
        .neq("status", "archived")
        .order("feature", { ascending: true })
        .order("company_id", { ascending: true, nullsFirst: true });

      if (error) throw error;
      res.json({ templates: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

aiRouter.post(
  "/requests",
  requirePermission("ai.use"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = aiRequestSchema.parse(req.body);

      if (!input.input_text && !input.entity_id) {
        return res.status(422).json({
          error: "AI_CONTEXT_REQUIRED",
          message: "Informe um texto real ou vincule uma entidade real para solicitar IA.",
        });
      }

      const period = currentMonthPeriod();
      const balance = await ensureCurrentCreditBalance(
        companyId,
        req.access!.subscription?.plan_slug,
        period,
      );

      if (balance.used_credits + balance.reserved_credits + 1 > balance.monthly_limit) {
        return res.status(402).json({
          error: "AI_CREDIT_LIMIT_REACHED",
          message: "Limite mensal de IA atingido para o plano atual.",
          balance,
        });
      }

      const [template, sourceContext] = await Promise.all([
        findTemplate(companyId, input.feature, input.template_key || null),
        buildSourceContext(companyId, input.entity_type, input.entity_id || null),
      ]);

      const { data: request, error } = await supabaseAdmin
        .from("ai_generation_requests")
        .insert({
          company_id: companyId,
          user_id: userId,
          template_id: template?.id ?? null,
          feature: input.feature,
          status: "pending_provider",
          entity_type: input.entity_type,
          entity_id: input.entity_id || null,
          input_text: input.input_text || null,
          instructions: input.instructions || null,
          source_context: sourceContext,
          credits_estimated: 1,
          credits_charged: 0,
          provider: null,
          model: null,
          error_message: "AI_PROVIDER_NOT_CONFIGURED",
          metadata: {
            provider_ready: false,
            template_key: template?.template_key ?? null,
            safety_rule: "use_only_real_user_or_database_context",
          },
        })
        .select(requestSelect)
        .single();

      if (error) throw error;

      await Promise.all([
        supabaseAdmin.from("ai_usage_events").insert({
          company_id: companyId,
          user_id: userId,
          feature: normalizeUsageFeature(input.feature),
          provider: null,
          model: null,
          status: "cancelled",
          entity_type: input.entity_type,
          entity_id: input.entity_id || null,
          request_metadata: {
            request_id: request.id,
            provider_ready: false,
            template_key: template?.template_key ?? null,
          },
          response_metadata: {},
          error_message: "AI_PROVIDER_NOT_CONFIGURED",
        }),
        supabaseAdmin.from("tenant_usage_events").insert({
          company_id: companyId,
          metric_key: "ai_request",
          quantity: 1,
          unit: "request",
          unit_cost_cents: 0,
          total_cost_cents: 0,
          source: "ai",
          related_entity_type: "ai_generation_request",
          related_entity_id: request.id,
          metadata: {
            feature: input.feature,
            provider_ready: false,
          },
          created_by: userId,
        }),
      ]);

      res.status(201).json({
        request,
        balance,
        provider_ready: false,
        message:
          "Solicitação registrada. A geração real será ativada quando o provider de IA for configurado.",
      });
    } catch (error) {
      next(error);
    }
  },
);

async function findTemplate(companyId: string, feature: string, templateKey: string | null) {
  let query = supabaseAdmin
    .from("ai_prompt_templates")
    .select("id, template_key, feature")
    .or(`company_id.is.null,company_id.eq.${companyId}`)
    .eq("feature", feature)
    .eq("status", "active");

  if (templateKey) query = query.eq("template_key", templateKey);

  const { data, error } = await query
    .order("company_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ id: string; template_key: string; feature: string }>();

  if (error) throw error;
  return data;
}

async function buildSourceContext(
  companyId: string,
  entityType: string,
  entityId: string | null,
): Promise<Record<string, unknown>> {
  if (!entityId) return {};

  if (entityType === "property") {
    const { data, error } = await supabaseAdmin
      .from("properties")
      .select(
        "id, title, description, property_type, operation, status, neighborhood, city, state, bedrooms, bathrooms, suites, parking_spaces, private_area, total_area, sale_price_cents, rent_price_cents, condominium_fee_cents, iptu_cents, features_json",
      )
      .eq("company_id", companyId)
      .eq("id", entityId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error("Imóvel não encontrado para esta empresa."), { statusCode: 404 });
    return { property: data };
  }

  if (entityType === "lead") {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(
        "id, name, email, phone, source, interest_type, status, budget_cents, property_reference, notes, last_contact_at, next_follow_up_at",
      )
      .eq("company_id", companyId)
      .eq("id", entityId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw Object.assign(new Error("Lead não encontrado para esta empresa."), { statusCode: 404 });
    return { lead: data };
  }

  if (entityType === "inspection") {
    const { data, error } = await supabaseAdmin
      .from("inspections")
      .select("id, property_id, inspection_type, status, scheduled_at, started_at, completed_at, summary")
      .eq("company_id", companyId)
      .eq("id", entityId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw Object.assign(new Error("Vistoria não encontrada para esta empresa."), { statusCode: 404 });
    }
    return { inspection: data };
  }

  if (entityType === "contract") {
    const { data, error } = await supabaseAdmin
      .from("contracts")
      .select("id, contract_type, status, title, property_id, starts_at, ends_at, total_value_cents")
      .eq("company_id", companyId)
      .eq("id", entityId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw Object.assign(new Error("Contrato não encontrado para esta empresa."), { statusCode: 404 });
    }
    return { contract: data };
  }

  return {};
}

async function ensureCurrentCreditBalance(
  companyId: string,
  planSlug: string | null | undefined,
  period: { periodStart: string; periodEnd: string },
) {
  const monthlyLimit = readPlanCreditLimit(planSlug);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("ai_credit_balances")
    .select("id, company_id, period_start, period_end, monthly_limit, used_credits, reserved_credits, source, metadata, created_at, updated_at")
    .eq("company_id", companyId)
    .eq("period_start", period.periodStart)
    .eq("period_end", period.periodEnd)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("ai_credit_balances")
    .insert({
      company_id: companyId,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      monthly_limit: monthlyLimit,
      used_credits: 0,
      reserved_credits: 0,
      source: "plan",
      metadata: {
        plan_slug: planSlug ?? null,
      },
    })
    .select("id, company_id, period_start, period_end, monthly_limit, used_credits, reserved_credits, source, metadata, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

function currentMonthPeriod() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

function readPlanCreditLimit(planSlug: string | null | undefined) {
  if (!planSlug) return 0;
  return planCreditLimits[planSlug] ?? 0;
}

function normalizeUsageFeature(feature: z.infer<typeof aiFeatureSchema>) {
  if (feature === "whatsapp_message") return "whatsapp_reply";
  if (feature === "lead_analysis") return "lead_scoring";
  return feature === "other" ? "other" : feature;
}

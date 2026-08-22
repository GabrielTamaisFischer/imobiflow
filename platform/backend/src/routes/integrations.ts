import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  getIntegrationProvider,
  integrationProviderCatalog,
  type IntegrationCategory,
  type IntegrationProvider,
} from "../services/external-integrations.js";
import type { RequestWithAccess } from "../types/access.js";

export const integrationsRouter = Router();

integrationsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const connectionSelect =
  "id, company_id, provider, category, name, status, environment, credentials_ref, webhook_secret_ref, settings, capabilities, last_checked_at, last_error, created_at, updated_at";

const providerSchema = z.enum([
  "whatsapp_business",
  "zap_imoveis",
  "olx",
  "viva_real",
  "stripe",
  "google",
  "asaas",
  "receita_federal",
]);

const connectionSchema = z.object({
  provider: providerSchema,
  name: z.string().min(2).max(160),
  status: z.enum(["draft", "testing", "active", "paused"]).default("testing"),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  credentials_ref: z.string().max(240).optional().or(z.literal("")),
  webhook_secret_ref: z.string().max(240).optional().or(z.literal("")),
  settings: z.record(z.unknown()).optional().default({}),
});

const statusSchema = z.object({
  status: z.enum(["draft", "testing", "active", "paused", "archived"]),
  last_error: z.string().max(1000).optional().or(z.literal("")),
});

integrationsRouter.get(
  "/providers",
  requirePermission("integrations.view"),
  (_req, res) => {
    res.json({
      providers: integrationProviderCatalog.map((provider) => ({
        ...provider,
        env_ready: provider.requiredCredentialRefs.every((key) => hasEnvValue(key)),
      })),
    });
  },
);

integrationsRouter.get(
  "/connections",
  requirePermission("integrations.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const { data, error } = await supabaseAdmin
        .from("integration_connections")
        .select(connectionSelect)
        .eq("company_id", companyId)
        .neq("status", "archived")
        .order("created_at", { ascending: false });

      if (error) throw error;

      res.json({ connections: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

integrationsRouter.post(
  "/connections",
  requirePermission("integrations.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = connectionSchema.parse(req.body);
      const provider = getIntegrationProvider(input.provider);

      if (!provider) {
        return res.status(422).json({
          error: "UNSUPPORTED_INTEGRATION_PROVIDER",
          message: "Provedor de integração não suportado.",
        });
      }

      const readiness = buildReadiness(provider.provider, input.credentials_ref, input.webhook_secret_ref);
      const status = input.status === "active" && !readiness.ready ? "testing" : input.status;

      const { data, error } = await supabaseAdmin
        .from("integration_connections")
        .insert({
          company_id: companyId,
          created_by: userId,
          provider: provider.provider,
          category: provider.category,
          name: input.name,
          status,
          environment: input.environment,
          credentials_ref: input.credentials_ref || null,
          webhook_secret_ref: input.webhook_secret_ref || null,
          settings: {
            ...input.settings,
            readiness,
          },
          capabilities: provider.capabilities,
          last_checked_at: new Date().toISOString(),
          last_error: readiness.ready ? null : readiness.missing.join(", "),
        })
        .select(connectionSelect)
        .single();

      if (error) throw error;

      await supabaseAdmin.from("audit_logs").insert({
        company_id: companyId,
        user_id: userId,
        action: "integration.connection.created",
        entity_type: "integration_connections",
        entity_id: data.id,
        metadata: {
          provider: provider.provider,
          environment: input.environment,
          status,
        },
      });

      res.status(201).json({ connection: data });
    } catch (error) {
      next(error);
    }
  },
);

integrationsRouter.patch(
  "/connections/:id/status",
  requirePermission("integrations.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = statusSchema.parse(req.body);
      const { data, error } = await supabaseAdmin
        .from("integration_connections")
        .update({
          status: input.status,
          last_error: input.last_error || null,
          last_checked_at: new Date().toISOString(),
        })
        .eq("id", req.params.id)
        .eq("company_id", companyId)
        .select(connectionSelect)
        .single();

      if (error) throw error;

      await supabaseAdmin.from("audit_logs").insert({
        company_id: companyId,
        user_id: userId,
        action: "integration.connection.status_changed",
        entity_type: "integration_connections",
        entity_id: data.id,
        metadata: {
          provider: data.provider,
          status: input.status,
        },
      });

      res.json({ connection: data });
    } catch (error) {
      next(error);
    }
  },
);

integrationsRouter.post(
  "/connections/:id/check",
  requirePermission("integrations.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("integration_connections")
        .select(connectionSelect)
        .eq("id", req.params.id)
        .eq("company_id", companyId)
        .single<{
          id: string;
          provider: IntegrationProvider;
          credentials_ref: string | null;
          webhook_secret_ref: string | null;
          settings: Record<string, unknown>;
        }>();

      if (existingError) throw existingError;

      const readiness = buildReadiness(existing.provider, existing.credentials_ref, existing.webhook_secret_ref);
      const { data, error } = await supabaseAdmin
        .from("integration_connections")
        .update({
          settings: {
            ...existing.settings,
            readiness,
          },
          last_checked_at: new Date().toISOString(),
          last_error: readiness.ready ? null : readiness.missing.join(", "),
        })
        .eq("id", req.params.id)
        .eq("company_id", companyId)
        .select(connectionSelect)
        .single();

      if (error) throw error;

      res.json({ connection: data, readiness });
    } catch (error) {
      next(error);
    }
  },
);

function buildReadiness(
  providerKey: IntegrationProvider,
  credentialsRef?: string | null,
  webhookSecretRef?: string | null,
) {
  const provider = getIntegrationProvider(providerKey);
  if (!provider) return { ready: false, missing: ["provider_catalog"] };

  const credentialMissing = provider.requiredCredentialRefs.filter((key) => !hasEnvValue(key));
  const refMissing = [
    ...(credentialsRef ? [] : ["credentials_ref"]),
    ...(provider.webhookEvents.length > 0 && !webhookSecretRef ? ["webhook_secret_ref"] : []),
  ];
  const missing = [...credentialMissing, ...refMissing];

  return {
    ready: missing.length === 0,
    missing,
    checked_at: new Date().toISOString(),
    stage: provider.stage,
  };
}

function hasEnvValue(key: string) {
  return Boolean((env as unknown as Record<string, string | undefined>)[key]);
}

export function categoryLabel(category: IntegrationCategory) {
  const labels: Record<IntegrationCategory, string> = {
    communication: "Comunicação",
    real_estate_portal: "Portais imobiliários",
    payment: "Pagamentos",
    identity: "Identidade e dados",
    productivity: "Produtividade",
    other: "Outro",
  };
  return labels[category];
}

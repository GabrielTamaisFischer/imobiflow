import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";

const previewAiRequestsKey = "imobiflow.preview.ai_requests";

export type AiFeature =
  | "property_description"
  | "whatsapp_message"
  | "inspection_summary"
  | "lead_analysis"
  | "contract_summary"
  | "other";

export type AiCreditBalance = {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  monthly_limit: number;
  used_credits: number;
  reserved_credits: number;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AiPromptTemplate = {
  id: string;
  company_id: string | null;
  template_key: string;
  feature: AiFeature;
  name: string;
  description: string | null;
  system_prompt: string;
  required_context: string[];
  status: "active" | "draft" | "archived";
  created_at: string;
  updated_at: string;
};

export type AiGenerationRequest = {
  id: string;
  company_id: string;
  user_id: string | null;
  template_id: string | null;
  feature: AiFeature;
  status: "pending_provider" | "queued" | "processing" | "completed" | "failed" | "cancelled";
  entity_type: string | null;
  entity_id: string | null;
  input_text: string | null;
  instructions: string | null;
  source_context: Record<string, unknown>;
  result_text: string | null;
  provider: string | null;
  model: string | null;
  credits_estimated: number;
  credits_charged: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AiOverview = {
  balance: AiCreditBalance;
  requests: AiGenerationRequest[];
  templates: AiPromptTemplate[];
  usage_summary: {
    total_requests: number;
    completed_requests: number;
    pending_provider_requests: number;
    failed_requests: number;
    tokens_used: number;
    estimated_cost_cents: number;
  };
};

export type AiRequestInput = {
  feature: AiFeature;
  entity_type?: "property" | "lead" | "inspection" | "contract" | "rental" | "manual" | "other";
  entity_id?: string;
  input_text?: string;
  instructions?: string;
  template_key?: string;
};

export function isPreviewAi() {
  return isPreviewToken(getStoredToken());
}

export async function getAiOverview() {
  if (isPreviewAi()) return createPreviewOverview();

  return apiRequest<AiOverview>("/ai/overview", {
    token: getStoredToken() ?? undefined,
  });
}

export async function createAiRequest(input: AiRequestInput) {
  if (isPreviewAi()) {
    const request = createPreviewAiRequest(input);
    return {
      request,
      balance: createPreviewBalance(),
      provider_ready: false,
      message:
        "Solicitação registrada em modo visualização. A geração real será ativada com o provider de IA.",
    };
  }

  return apiRequest<{
    request: AiGenerationRequest;
    balance: AiCreditBalance;
    provider_ready: boolean;
    message: string;
  }>("/ai/requests", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

function createPreviewOverview(): AiOverview {
  const requests = readPreviewAiRequests();

  return {
    balance: createPreviewBalance(),
    requests,
    templates: previewTemplates,
    usage_summary: {
      total_requests: requests.length,
      completed_requests: requests.filter((item) => item.status === "completed").length,
      pending_provider_requests: requests.filter((item) => item.status === "pending_provider").length,
      failed_requests: requests.filter((item) => item.status === "failed").length,
      tokens_used: 0,
      estimated_cost_cents: 0,
    },
  };
}

function createPreviewBalance(): AiCreditBalance {
  const period = currentMonthPeriod();

  return {
    id: "preview-ai-balance",
    company_id: "preview-company",
    period_start: period.periodStart,
    period_end: period.periodEnd,
    monthly_limit: 0,
    used_credits: 0,
    reserved_credits: 0,
    source: "preview",
    metadata: { provider_ready: false },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createPreviewAiRequest(input: AiRequestInput): AiGenerationRequest {
  const now = new Date().toISOString();
  const request: AiGenerationRequest = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    user_id: "preview-user",
    template_id: null,
    feature: input.feature,
    status: "pending_provider",
    entity_type: input.entity_type ?? "manual",
    entity_id: input.entity_id || null,
    input_text: input.input_text || null,
    instructions: input.instructions || null,
    source_context: {},
    result_text: null,
    provider: null,
    model: null,
    credits_estimated: 1,
    credits_charged: 0,
    error_message: "AI_PROVIDER_NOT_CONFIGURED",
    metadata: {
      provider_ready: false,
      safety_rule: "use_only_real_user_or_database_context",
    },
    created_at: now,
    updated_at: now,
    completed_at: null,
  };

  writePreviewAiRequests([request, ...readPreviewAiRequests()]);
  return request;
}

function readPreviewAiRequests() {
  if (typeof window === "undefined") return [] as AiGenerationRequest[];

  try {
    return JSON.parse(
      window.localStorage.getItem(previewAiRequestsKey) ?? "[]",
    ) as AiGenerationRequest[];
  } catch {
    return [];
  }
}

function writePreviewAiRequests(requests: AiGenerationRequest[]) {
  window.localStorage.setItem(previewAiRequestsKey, JSON.stringify(requests));
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

const previewTemplates: AiPromptTemplate[] = [
  {
    id: "preview-template-property",
    company_id: null,
    template_key: "property_description_default",
    feature: "property_description",
    name: "Descrição de imóvel",
    description: "Gera descrição comercial a partir de dados reais do imóvel.",
    system_prompt: "Use somente os dados reais informados. Não invente características.",
    required_context: ["dados reais do imóvel"],
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "preview-template-whatsapp",
    company_id: null,
    template_key: "whatsapp_message_default",
    feature: "whatsapp_message",
    name: "Mensagem WhatsApp",
    description: "Sugere mensagem objetiva com contexto real.",
    system_prompt: "Não prometa descontos ou disponibilidade sem dado confirmado.",
    required_context: ["destinatário", "objetivo", "contexto"],
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "preview-template-inspection",
    company_id: null,
    template_key: "inspection_summary_default",
    feature: "inspection_summary",
    name: "Resumo de vistoria",
    description: "Padroniza observações sem criar fatos novos.",
    system_prompt: "Melhore a redação técnica sem adicionar avarias não informadas.",
    required_context: ["observações reais da vistoria"],
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "preview-template-lead",
    company_id: null,
    template_key: "lead_analysis_default",
    feature: "lead_analysis",
    name: "Análise de lead",
    description: "Classifica o lead com base em histórico real.",
    system_prompt: "Quando faltar dado, indique incerteza.",
    required_context: ["origem", "interesse", "histórico"],
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

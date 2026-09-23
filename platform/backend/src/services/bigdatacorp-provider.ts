import type {
  OwnerIntelligenceProviderResult,
  OwnerProviderAdapter,
  OwnerProviderQueryStatus,
  OwnerProviderSubjectType,
} from "./owner-intelligence.js";

export const BIGDATACORP_ENDPOINT = "https://plataforma.bigdatacorp.com.br/pessoas";
export const BIGDATACORP_ENV_NAMES = ["BIGDATACORP_ACCESS_TOKEN", "BIGDATACORP_TOKEN_ID"] as const;
export const BIGDATACORP_DATASET_BY_CAPABILITY = {
  IDENTITY: "basic_data",
  COMPANY: "registration_data",
  ADDRESS: "addresses_extended",
} as const;
export const BIGDATACORP_PRICING_METADATA = {
  basic_data: { currency: "BRL", firstTierReference: 0.04, mutable: true },
  registration_data: { currency: "BRL", firstTierReference: 0.14, mutable: true },
  addresses_extended: { currency: "BRL", firstTierReference: 0.06, mutable: true },
} as const;

type BigDataCorpFetch = typeof fetch;

export type BigDataCorpProviderOptions = {
  fetchImpl?: BigDataCorpFetch;
  env?: NodeJS.ProcessEnv;
  endpoint?: string;
  timeoutMs?: number;
  maxRetryAttempts?: number;
};

type BigDataCorpPayload = Record<string, unknown>;

function configured(env: NodeJS.ProcessEnv) {
  return Boolean(env.BIGDATACORP_ACCESS_TOKEN?.trim() && env.BIGDATACORP_TOKEN_ID?.trim());
}

function protocolFrom(payload: BigDataCorpPayload) {
  const value = payload.Protocol ?? payload.protocol ?? payload.RequestId ?? payload.request_id;
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(value) ? value : null;
}

function valueAt(source: BigDataCorpPayload, names: string[]) {
  const entries = Object.entries(source);
  const wanted = new Set(names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const entry = entries.find(([key]) => wanted.has(key.toLowerCase().replace(/[^a-z0-9]/g, "")));
  return entry?.[1];
}

function basicDataFrom(payload: BigDataCorpPayload): BigDataCorpPayload | null {
  const result = payload.Result ?? payload.result ?? payload.Results ?? payload.results;
  const first = Array.isArray(result) ? result[0] : result;
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const candidate =
      (first as BigDataCorpPayload).BasicData ?? (first as BigDataCorpPayload).basic_data ?? first;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate))
      return candidate as BigDataCorpPayload;
  }
  const candidate = payload.BasicData ?? payload.basic_data;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as BigDataCorpPayload)
    : null;
}

function normalizeBasicData(payload: BigDataCorpPayload) {
  const fullName = valueAt(payload, ["Name", "FullName", "full_name"]);
  const birthDate = valueAt(payload, ["BirthDate", "birth_date"]);
  const motherName = valueAt(payload, ["MotherName", "mother_name", "MothersName"]);
  const data: Record<string, unknown> = {};
  if (typeof fullName === "string" && fullName.trim()) data.full_name = fullName.trim();
  if (typeof birthDate === "string" && birthDate.trim()) data.birth_date = birthDate.trim();
  if (typeof motherName === "string" && motherName.trim()) data.parentage = [motherName.trim()];
  return data;
}

function result(
  status: OwnerProviderQueryStatus | "verified",
  values: Record<string, unknown>,
  warning: string,
  protocol: string | null,
): OwnerIntelligenceProviderResult {
  return {
    status,
    provider: "BIGDATACORP",
    consultedAt: new Date().toISOString(),
    sections: ["IDENTITY"],
    values,
    warnings: [warning],
    protocol,
  } as OwnerIntelligenceProviderResult;
}

export function createBigDataCorpProvider(
  options: BigDataCorpProviderOptions = {},
): OwnerProviderAdapter {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? BIGDATACORP_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxRetryAttempts = Math.max(1, options.maxRetryAttempts ?? 2);

  return {
    id: "bigdatacorp",
    name: "BIGDATACORP",
    type: "COMMERCIAL",
    capabilities: ["IDENTITY"],
    priorities: ["PRIMARY"],
    envNames: [...BIGDATACORP_ENV_NAMES],
    costProfile: {
      pricingModel: "pay_per_use",
      estimatedCost: null,
      currency: "BRL",
      isPaid: true,
    },
    isConfigured: () => configured(env),
    supports: (subjectType: OwnerProviderSubjectType, capability) =>
      subjectType === "PERSON" && capability === "IDENTITY",
    normalize: (rawResult) => normalizeBasicData(rawResult),
    healthCheck: async () => (configured(env) ? "AVAILABLE" : "NOT_CONFIGURED"),
    async query({ document }) {
      if (!configured(env))
        return result(
          "NOT_CONFIGURED",
          {},
          "BigDataCorp não está configurada neste ambiente.",
          null,
        );

      const body = JSON.stringify({
        q: `doc${document}`,
        Datasets: BIGDATACORP_DATASET_BY_CAPABILITY.IDENTITY,
      });
      for (let attempt = 1; attempt <= maxRetryAttempts; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            headers: {
              AccessToken: env.BIGDATACORP_ACCESS_TOKEN!,
              TokenId: env.BIGDATACORP_TOKEN_ID!,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body,
            signal: controller.signal,
          });
          const payload = (await response.json().catch(() => null)) as BigDataCorpPayload | null;
          if (response.status === 401 || response.status === 403)
            return result(
              "AUTH_ERROR",
              {},
              "Credenciais BigDataCorp rejeitadas.",
              payload ? protocolFrom(payload) : null,
            );
          if (response.status === 429)
            return result(
              "RATE_LIMITED",
              {},
              "BigDataCorp limitou a frequência da consulta.",
              payload ? protocolFrom(payload) : null,
            );
          if (response.status >= 500) {
            if (attempt < maxRetryAttempts) continue;
            return result(
              "PROVIDER_ERROR",
              {},
              "BigDataCorp indisponível após tentativas limitadas.",
              payload ? protocolFrom(payload) : null,
            );
          }
          if (response.status === 404)
            return result(
              "NOT_FOUND",
              {},
              "CPF não encontrado na BigDataCorp.",
              payload ? protocolFrom(payload) : null,
            );
          if (!response.ok)
            return result(
              "PROVIDER_ERROR",
              {},
              "BigDataCorp retornou erro controlado.",
              payload ? protocolFrom(payload) : null,
            );
          if (!payload)
            return result("PROVIDER_ERROR", {}, "Resposta BigDataCorp malformada.", null);
          const basicData = basicDataFrom(payload);
          if (!basicData)
            return result(
              "PROVIDER_ERROR",
              {},
              "Resposta BigDataCorp sem basic_data reconhecível.",
              protocolFrom(payload),
            );
          const values = normalizeBasicData(basicData);
          return result(
            Object.keys(values).length ? "verified" : "PARTIAL",
            values,
            Object.keys(values).length
              ? "Dados básicos normalizados pela BigDataCorp."
              : "Resposta BigDataCorp parcial, sem campos básicos mapeados.",
            protocolFrom(payload),
          );
        } catch (error) {
          if ((error as { name?: string }).name === "AbortError")
            return result("TIMEOUT", {}, "Timeout na consulta BigDataCorp.", null);
          if (attempt < maxRetryAttempts) continue;
          return result("PROVIDER_ERROR", {}, "Falha de transporte na consulta BigDataCorp.", null);
        } finally {
          clearTimeout(timer);
        }
      }
      return result("PROVIDER_ERROR", {}, "Falha inesperada na consulta BigDataCorp.", null);
    },
  };
}

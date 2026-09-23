import { describe, expect, it, vi } from "vitest";
import {
  OwnerEnrichmentProviderRegistry,
  notConfiguredOwnerProvider,
  type OwnerProviderAdapter,
} from "../src/services/owner-intelligence.js";
import {
  OwnerProviderOrchestrator,
  detectOwnerSubject,
  isValidCnpj,
  isValidCpf,
} from "../src/services/owner-provider-orchestrator.js";

function adapter(overrides: Partial<OwnerProviderAdapter> = {}): OwnerProviderAdapter {
  return {
    id: "test-provider",
    name: "TEST_PROVIDER",
    type: "TEST",
    capabilities: ["IDENTITY", "LEGAL", "CREDIT"],
    priorities: ["PRIMARY"],
    envNames: [],
    costProfile: { pricingModel: "free", estimatedCost: 0, currency: "BRL", isPaid: false },
    isConfigured: () => true,
    supports: (_subjectType, capability) => ["IDENTITY", "LEGAL", "CREDIT"].includes(capability),
    query: async ({ capabilities }) => ({ status: "verified", provider: "TEST_PROVIDER", consultedAt: "2026-09-22T12:00:00.000Z", sections: capabilities, values: { full_name: "Pessoa QA", score: 700, raw: "should be removed", political: "should be removed" }, warnings: [] }),
    normalize: (value) => value,
    healthCheck: async () => "AVAILABLE",
    ...overrides,
  };
}

describe("H2 multi-provider orchestration", () => {
  it("detects and validates CPF/CNPJ canonically", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(detectOwnerSubject("529.982.247-25")).toEqual({ subjectType: "PERSON", document: "52998224725" });
    expect(detectOwnerSubject("11.222.333/0001-81")).toEqual({ subjectType: "COMPANY", document: "11222333000181" });
    expect(detectOwnerSubject("invalid")).toBeNull();
  });

  it("exposes all H2 adapters as NOT_CONFIGURED without making network calls", async () => {
    const registry = new OwnerEnrichmentProviderRegistry().register(notConfiguredOwnerProvider);
    const defaultRegistry = (await import("../src/services/owner-intelligence.js")).ownerIntelligenceRegistry;
    const names = defaultRegistry.list().map((entry) => entry.name);
    expect(names).toEqual(expect.arrayContaining(["BIGDATACORP", "RECEITA_OPEN_DATA", "SERPRO_CNPJ", "DATAJUD_CNJ", "ESCAVADOR", "SERASA_EXPERIAN", "EQUIFAX_BOA_VISTA"]));
    const result = await new OwnerProviderOrchestrator(registry).query({ companyId: "company-a", actorUserId: "user-a", document: "52998224725", capabilities: ["IDENTITY"], idempotencyKey: "h2-not-configured" });
    expect(result.status).toBe("NOT_CONFIGURED");
    expect(result.results[0]).toMatchObject({ provider: "NOT_CONFIGURED", status: "NOT_CONFIGURED", data: {} });
    const defaultResult = await new OwnerProviderOrchestrator(defaultRegistry).query({ companyId: "company-a", actorUserId: "user-a", document: "52998224725", capabilities: ["IDENTITY"], idempotencyKey: "h2-default-not-configured" });
    expect(defaultResult.status).toBe("NOT_CONFIGURED");
    expect(defaultResult.results[0]).toMatchObject({ provider: "NOT_CONFIGURED", status: "NOT_CONFIGURED", data: {} });
  });

  it("selects a configured adapter by capability and preserves provenance without raw payload", async () => {
    const provider = adapter();
    const registry = new OwnerEnrichmentProviderRegistry().register(notConfiguredOwnerProvider).register(provider);
    const audit = vi.fn();
    const result = await new OwnerProviderOrchestrator(registry, audit).query({ companyId: "company-a", actorUserId: "user-a", document: "52998224725", capabilities: ["IDENTITY"], idempotencyKey: "h2-success" });
    expect(result).toMatchObject({ status: "SUCCESS", subject: { subjectType: "PERSON" }, normalized: { full_name: "Pessoa QA" } });
    expect(result.results[0]).toMatchObject({ provider: "TEST_PROVIDER", capability: "IDENTITY", status: "SUCCESS", source: "test", confidence: "high" });
    expect(result.results[0]?.data).not.toHaveProperty("raw");
    expect(result.results[0]?.data).not.toHaveProperty("political");
    expect(result.provenance.IDENTITY).toMatchObject({ provider: "TEST_PROVIDER", source: "test" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: "owner.provider.query.requested", companyId: "company-a", capability: "IDENTITY" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: "owner.intelligence.orchestration.completed", companyId: "company-a" }));
  });

  it("rejects invalid documents and enforces capability authorization", async () => {
    const orchestrator = new OwnerProviderOrchestrator();
    await expect(orchestrator.query({ companyId: "company-a", actorUserId: "user-a", document: "11111111111", capabilities: ["IDENTITY"], idempotencyKey: "h2-invalid" })).rejects.toMatchObject({ code: "OWNER_DOCUMENT_INVALID", statusCode: 400 });
    await expect(orchestrator.query({ companyId: "company-a", actorUserId: "user-a", document: "52998224725", capabilities: ["CREDIT"], idempotencyKey: "h2-forbidden", authorize: () => false })).rejects.toMatchObject({ code: "OWNER_PROVIDER_PERMISSION_REQUIRED", statusCode: 403 });
  });

  it("is idempotent for the same company/key and rejects key reuse with another fingerprint", async () => {
    const query = vi.fn(async ({ capabilities }: { capabilities: string[] }) => ({ status: "verified", provider: "TEST_PROVIDER", consultedAt: new Date().toISOString(), sections: capabilities, values: { full_name: "Pessoa QA" }, warnings: [] }));
    const registry = new OwnerEnrichmentProviderRegistry().register(notConfiguredOwnerProvider).register(adapter({ query: query as OwnerProviderAdapter["query"] }));
    const orchestrator = new OwnerProviderOrchestrator(registry);
    const input = { companyId: "company-a", actorUserId: "user-a", document: "52998224725", capabilities: ["IDENTITY"] as const, idempotencyKey: "h2-same-key" };
    const first = await orchestrator.query(input);
    const second = await orchestrator.query(input);
    expect(second).toBe(first);
    expect(query).toHaveBeenCalledTimes(1);
    await expect(orchestrator.query({ ...input, document: "11222333000181" })).rejects.toMatchObject({ code: "OWNER_PROVIDER_IDEMPOTENCY_CONFLICT", statusCode: 409 });
  });

  it("uses a configured fallback after a primary NOT_FOUND and never falls back on AUTH_ERROR", async () => {
    const primary = adapter({ id: "primary", name: "PRIMARY", isConfigured: () => true, priorities: ["PRIMARY"], query: async () => ({ status: "not_found", provider: "PRIMARY", consultedAt: new Date().toISOString(), sections: ["LEGAL"], values: {}, warnings: [] }) });
    const fallback = adapter({ id: "fallback", name: "FALLBACK", priorities: ["FALLBACK"], query: async () => ({ status: "verified", provider: "FALLBACK", consultedAt: new Date().toISOString(), sections: ["LEGAL"], values: { status: "NO_RECORDS_FOUND" }, warnings: [] }) });
    const registry = new OwnerEnrichmentProviderRegistry().register(notConfiguredOwnerProvider).register(primary).register(fallback);
    const result = await new OwnerProviderOrchestrator(registry).query({ companyId: "company-a", actorUserId: "user-a", document: "52998224725", capabilities: ["LEGAL"], idempotencyKey: "h2-fallback" });
    expect(result.results[0]).toMatchObject({ provider: "FALLBACK", status: "SUCCESS" });

    const authPrimary = adapter({ name: "AUTH_PRIMARY", query: async () => ({ status: "auth_error", provider: "AUTH_PRIMARY", consultedAt: new Date().toISOString(), sections: ["LEGAL"], values: {}, warnings: [] }) });
    const authRegistry = new OwnerEnrichmentProviderRegistry().register(notConfiguredOwnerProvider).register(authPrimary).register(fallback);
    const authResult = await new OwnerProviderOrchestrator(authRegistry).query({ companyId: "company-a", actorUserId: "user-a", document: "52998224725", capabilities: ["LEGAL"], idempotencyKey: "h2-auth-no-fallback" });
    expect(authResult.results[0]).toMatchObject({ provider: "AUTH_PRIMARY", status: "AUTH_ERROR" });
  });

  it("applies freshness and paid cost guards before external execution", async () => {
    const query = vi.fn(async () => ({ status: "verified", provider: "PAID", consultedAt: new Date().toISOString(), sections: ["CREDIT"], values: {}, warnings: [] }));
    const paid = adapter({ name: "PAID", costProfile: { pricingModel: "contract", estimatedCost: null, currency: "BRL", isPaid: true }, query: query as OwnerProviderAdapter["query"] });
    const registry = new OwnerEnrichmentProviderRegistry().register(notConfiguredOwnerProvider).register(paid);
    const orchestrator = new OwnerProviderOrchestrator(registry);
    const cost = await orchestrator.query({ companyId: "company-a", actorUserId: "user-a", document: "52998224725", capabilities: ["CREDIT"], idempotencyKey: "h2-cost" });
    expect(cost.results[0]).toMatchObject({ status: "SKIPPED_COST", provider: "PAID" });
    expect(query).not.toHaveBeenCalled();
    const fresh = await orchestrator.query({ companyId: "company-a", actorUserId: "user-a", document: "52998224725", capabilities: ["CREDIT"], idempotencyKey: "h2-fresh", allowPaid: true, freshness: { CREDIT: { lastCheckedAt: new Date().toISOString(), maxAgeSeconds: 300 } } });
    expect(fresh.results[0]).toMatchObject({ status: "SKIPPED_FRESH" });
    expect(query).not.toHaveBeenCalled();
  });

  it("reports provider health without polling or credentials", async () => {
    const provider = adapter({ name: "HEALTHY" });
    const registry = new OwnerEnrichmentProviderRegistry().register(notConfiguredOwnerProvider).register(provider);
    await expect(new OwnerProviderOrchestrator(registry).health()).resolves.toEqual(expect.arrayContaining([{ provider: "HEALTHY", health: "AVAILABLE" }]));
  });
});

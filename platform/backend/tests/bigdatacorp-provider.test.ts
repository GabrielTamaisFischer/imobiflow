import { describe, expect, it, vi } from "vitest";
import {
  BIGDATACORP_DATASET_BY_CAPABILITY,
  BIGDATACORP_ENDPOINT,
  createBigDataCorpProvider,
} from "../src/services/bigdatacorp-provider.js";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const configuredEnv = {
  BIGDATACORP_ACCESS_TOKEN: "test-access-token",
  BIGDATACORP_TOKEN_ID: "test-token-id",
};

describe("BigDataCorp CPF adapter H3A", () => {
  it("remains NOT_CONFIGURED and makes zero external calls without both credentials", async () => {
    const fetchImpl = vi.fn();
    const provider = createBigDataCorpProvider({ fetchImpl, env: {} });

    expect(provider.isConfigured()).toBe(false);
    await expect(provider.healthCheck()).resolves.toBe("NOT_CONFIGURED");
    await expect(
      provider.query({ document: "52998224725", capabilities: ["IDENTITY"] }),
    ).resolves.toMatchObject({ status: "NOT_CONFIGURED", provider: "BIGDATACORP", values: {} });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the canonical CPF query and normalizes basic_data without raw payload or CPF persistence", async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, {
        Protocol: "BDC-TEST-001",
        Result: [
          {
            BasicData: {
              Name: "Pessoa Sintética",
              CPF: "52998224725",
              BirthDate: "1988-04-12",
              MotherName: "Mãe Sintética",
              SecretField: "must not persist",
            },
          },
        ],
      }),
    );
    const provider = createBigDataCorpProvider({ fetchImpl, env: configuredEnv });
    const result = await provider.query({ document: "52998224725", capabilities: ["IDENTITY"] });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(BIGDATACORP_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      AccessToken: configuredEnv.BIGDATACORP_ACCESS_TOKEN,
      TokenId: configuredEnv.BIGDATACORP_TOKEN_ID,
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      q: "doc52998224725",
      Datasets: BIGDATACORP_DATASET_BY_CAPABILITY.IDENTITY,
    });
    expect(result).toMatchObject({
      status: "verified",
      provider: "BIGDATACORP",
      protocol: "BDC-TEST-001",
      values: {
        full_name: "Pessoa Sintética",
        birth_date: "1988-04-12",
        parentage: ["Mãe Sintética"],
      },
    });
    expect(result.values).not.toHaveProperty("CPF");
    expect(result.values).not.toHaveProperty("SecretField");
    expect(result).not.toHaveProperty("raw");
  });

  it("maps provider HTTP outcomes without retrying non-retryable errors", async () => {
    for (const [status, expected] of [
      [401, "AUTH_ERROR"],
      [403, "AUTH_ERROR"],
      [404, "NOT_FOUND"],
      [429, "RATE_LIMITED"],
    ] as const) {
      const fetchImpl = vi.fn(async () => response(status, {}));
      const result = await createBigDataCorpProvider({ fetchImpl, env: configuredEnv }).query({
        document: "52998224725",
        capabilities: ["IDENTITY"],
      });
      expect(result.status).toBe(expected);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("retries a provider 5xx once, then returns PROVIDER_ERROR", async () => {
    const fetchImpl = vi.fn(async () => response(503, {}));
    const result = await createBigDataCorpProvider({
      fetchImpl,
      env: configuredEnv,
      maxRetryAttempts: 2,
    }).query({ document: "52998224725", capabilities: ["IDENTITY"] });
    expect(result.status).toBe("PROVIDER_ERROR");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps timeout and malformed payloads to controlled provider states", async () => {
    const timeout = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    await expect(
      createBigDataCorpProvider({ fetchImpl: timeout, env: configuredEnv }).query({
        document: "52998224725",
        capabilities: ["IDENTITY"],
      }),
    ).resolves.toMatchObject({ status: "TIMEOUT", values: {} });

    const malformed = vi.fn(async () => response(200, ["not-an-object"]));
    await expect(
      createBigDataCorpProvider({ fetchImpl: malformed, env: configuredEnv }).query({
        document: "52998224725",
        capabilities: ["IDENTITY"],
      }),
    ).resolves.toMatchObject({ status: "PROVIDER_ERROR", values: {} });
  });

  it("returns PARTIAL when the provider response is valid but lacks mapped basic fields", async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, { Result: [{ BasicData: { CPF: "52998224725" } }] }),
    );
    await expect(
      createBigDataCorpProvider({ fetchImpl, env: configuredEnv }).query({
        document: "52998224725",
        capabilities: ["IDENTITY"],
      }),
    ).resolves.toMatchObject({ status: "PARTIAL", values: {} });
  });

  it("declares only the implemented PERSON/IDENTITY capability", () => {
    const provider = createBigDataCorpProvider({ env: configuredEnv });
    expect(provider.capabilities).toEqual(["IDENTITY"]);
    expect(provider.supports("PERSON", "IDENTITY")).toBe(true);
    expect(provider.supports("COMPANY", "IDENTITY")).toBe(false);
    expect(provider.supports("PERSON", "ADDRESS")).toBe(false);
  });
});

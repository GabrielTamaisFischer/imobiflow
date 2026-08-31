import { afterEach, describe, expect, it } from "vitest";
import { corsOrigins } from "../src/app.js";
import { env } from "../src/config/env.js";

const original = {
  corsOrigin: env.CORS_ORIGIN,
  frontendUrl: env.FRONTEND_URL,
  appUrl: env.APP_URL,
};

afterEach(() => {
  env.CORS_ORIGIN = original.corsOrigin;
  env.FRONTEND_URL = original.frontendUrl;
  env.APP_URL = original.appUrl;
});

// Diretriz Mestre do MVP, Item 14/Seção 2: CORS de staging é uma allowlist
// explícita por env var, nunca wildcard (a API responde com credentials:true).
describe("corsOrigins — allowlist explícita para staging (Diretriz Mestre, Item 14)", () => {
  it("refuses to start with a wildcard origin", () => {
    env.CORS_ORIGIN = "*";
    expect(() => corsOrigins()).toThrowError(/CORS_ORIGIN nao pode ser/);
  });

  it("refuses a wildcard even when mixed with real origins", () => {
    env.CORS_ORIGIN = "https://app.imobiflow.test,*";
    expect(() => corsOrigins()).toThrowError(/CORS_ORIGIN nao pode ser/);
  });

  it("accepts a single explicit staging origin", () => {
    env.CORS_ORIGIN = "https://imobiflow-staging.vercel.app";
    expect(corsOrigins()).toEqual(["https://imobiflow-staging.vercel.app"]);
  });

  it("accepts multiple comma-separated explicit origins (desktop/mobile testing against the same staging domain)", () => {
    env.CORS_ORIGIN = "https://imobiflow-staging.vercel.app, https://staging.imobiflow.com.br";
    expect(corsOrigins()).toEqual([
      "https://imobiflow-staging.vercel.app",
      "https://staging.imobiflow.com.br",
    ]);
  });

  it("falls back to FRONTEND_URL then APP_URL when CORS_ORIGIN is unset", () => {
    env.CORS_ORIGIN = undefined;
    env.FRONTEND_URL = "https://app.imobiflow.test";
    expect(corsOrigins()).toEqual(["https://app.imobiflow.test"]);

    env.FRONTEND_URL = undefined;
    env.APP_URL = "http://localhost:5173";
    expect(corsOrigins()).toEqual(["http://localhost:5173"]);
  });
});

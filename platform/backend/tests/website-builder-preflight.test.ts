import { describe, expect, it } from "vitest";

async function loadPreflightModule() {
  return import("../../scripts/website-builder-preflight.mjs");
}

describe("Website Builder preflight", () => {
  it("marca ambiente incompleto como pendente sem gravar dados", async () => {
    const { buildWebsiteBuilderPreflight, formatWebsiteBuilderPreflight } = await loadPreflightModule();
    const result = buildWebsiteBuilderPreflight({});
    const output = formatWebsiteBuilderPreflight(result);

    expect(result.ready).toBe(false);
    expect(result.missingStorage).toEqual([
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ]);
    expect(output).toContain("OK       Backend API - /api");
    expect(output).toContain("PENDENTE DATABASE_URL");
  });

  it("marca ambiente completo como pronto", async () => {
    const { buildWebsiteBuilderPreflight, formatWebsiteBuilderPreflight } = await loadPreflightModule();
    const result = buildWebsiteBuilderPreflight({
      VITE_IMOBIFLOW_API_URL: "https://api.imobiflow.com",
      DATABASE_URL: "mysql://imobiflow:senha@mysql.imobiflow.com:3306/imobiflow",
      STORAGE_PROVIDER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    });
    const output = formatWebsiteBuilderPreflight(result, { strict: true });

    expect(result.ready).toBe(true);
    expect(result.checks.every((check) => check.ok)).toBe(true);
    expect(output).toContain("OK       Backend API");
    expect(output).not.toContain("ERRO");
  });

  it("recusa API local em configuracao de producao", async () => {
    const { buildWebsiteBuilderPreflight } = await loadPreflightModule();
    const result = buildWebsiteBuilderPreflight({
      VITE_IMOBIFLOW_API_URL: "http://localhost:3333",
      DATABASE_URL: "mysql://imobiflow:senha@mysql.imobiflow.com:3306/imobiflow",
      STORAGE_PROVIDER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    });

    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.label === "Backend API")).toMatchObject({
      ok: false,
    });
  });
});

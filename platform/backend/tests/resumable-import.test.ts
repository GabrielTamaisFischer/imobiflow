import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_IMPORT_BATCH_SIZE,
  MAX_IMPORT_BATCH_SIZE,
  TEST_IMPORT_LIMIT,
  assertFullImportConfirmed,
  canClaimImportStatus,
  clampImportBatchSize,
  selectRowsForMode,
  processNextImportBatch,
  getImportReport,
  getImportMediaConcurrency,
  mapWithConcurrency,
} from "../src/services/resumable-import.js";
import { importMetricsEnabled, mergeImportMetrics, recordImportMetric } from "../src/services/import-metrics.js";
import { assertPublicHost, isPrivateAddress, validateImageBytes } from "../src/services/import-media.js";

describe("resumable import policy", () => {
  it("limita o modo test a 50 linhas", () => {
    expect(selectRowsForMode(Array.from({ length: 80 }, (_, index) => index), "test")).toHaveLength(TEST_IMPORT_LIMIT);
  });

  it("nao limita artificialmente o modo full confirmado", () => {
    const rows = Array.from({ length: 120 }, (_, index) => index);
    expect(selectRowsForMode(rows, "full")).toHaveLength(120);
  });

  it("rejeita full sem confirmacao explicita", () => {
    expect(() => assertFullImportConfirmed("full", false)).toThrowError(/confirm_full_import/);
  });

  it("aceita full somente com confirmacao", () => {
    expect(() => assertFullImportConfirmed("full", true)).not.toThrow();
  });

  it("mantem test como operacao sem confirmacao full", () => {
    expect(() => assertFullImportConfirmed("test", false)).not.toThrow();
  });

  it("usa lote padrao pequeno", () => {
    expect(clampImportBatchSize()).toBe(DEFAULT_IMPORT_BATCH_SIZE);
  });

  it("impede lote maior que o maximo absoluto", () => {
    expect(clampImportBatchSize(5_000)).toBe(MAX_IMPORT_BATCH_SIZE);
  });

  it("impede lote zero", () => {
    expect(clampImportBatchSize(0)).toBe(1);
  });

  it("permite retomada de jobs pendentes, parciais e com falha", () => {
    expect(["PENDING", "PARTIALLY_COMPLETED", "FAILED"].every(canClaimImportStatus)).toBe(true);
  });

  it("nao permite reclamar job concluido ou cancelado", () => {
    expect(canClaimImportStatus("COMPLETED")).toBe(false);
    expect(canClaimImportStatus("CANCELED")).toBe(false);
  });

  it("limita concorrencia de midia ao intervalo seguro", () => {
    expect(getImportMediaConcurrency(undefined)).toBe(3);
    expect(getImportMediaConcurrency("0")).toBe(1);
    expect(getImportMediaConcurrency("4")).toBe(4);
    expect(getImportMediaConcurrency("500")).toBe(5);
    expect(getImportMediaConcurrency("invalido")).toBe(3);
  });

  it("executa midias com concorrencia limitada e preserva a ordem", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item * 2;
    });
    expect(peak).toBe(3);
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it("habilita metricas somente em staging ou teste por opt-in", () => {
    expect(importMetricsEnabled({ NODE_ENV: "staging", IMPORT_METRICS_ENABLED: "true" })).toBe(true);
    expect(importMetricsEnabled({ NODE_ENV: "test", IMPORT_METRICS_ENABLED: "true" })).toBe(true);
    expect(importMetricsEnabled({ NODE_ENV: "production", IMPORT_METRICS_ENABLED: "true" })).toBe(false);
    expect(importMetricsEnabled({ NODE_ENV: "staging", IMPORT_METRICS_ENABLED: "false" })).toBe(false);
  });

  it("agrega metricas sem incluir payloads", () => {
    const first = { duplicate_lookup: { count: 2, total_ms: 4, max_ms: 3 } };
    const second = { duplicate_lookup: { count: 1, total_ms: 5, max_ms: 5 } };
    expect(mergeImportMetrics(first, second)).toEqual({ duplicate_lookup: { count: 3, total_ms: 9, max_ms: 5 } });
    const disabled = {};
    recordImportMetric(disabled, "file_parse", performance.now());
    expect(disabled).toEqual({});
  });
});

describe("resumable import service isolation", () => {
  it("somente uma chamada concorrente consegue assumir o lote", async () => {
    let claims = 0;
    const job = { id: "job-a", companyId: "company-a", status: "PROCESSING", nextCursor: 1, batchSize: 25, totalRows: 0 };
    const prisma = {
      importJob: {
        updateMany: vi.fn(async () => ({ count: claims++ === 0 ? 1 : claims === 2 ? 0 : 1 })),
        findFirst: vi.fn(async () => ({ status: "PROCESSING" })),
        findFirstOrThrow: vi.fn(async () => job),
      },
      importRow: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        count: vi.fn(async () => 0),
        groupBy: vi.fn(async () => []),
      },
    } as unknown as PrismaClient;
    const results = await Promise.allSettled([
      processNextImportBatch(prisma, "company-a", "user-a", "job-a"),
      processNextImportBatch(prisma, "company-a", "user-a", "job-a"),
    ]);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((results.find((result) => result.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "IMPORT_BATCH_ALREADY_CLAIMED" });
  });

  it("nao retorna relatorio de job pertencente a outra empresa", async () => {
    const prisma = { importJob: { findFirst: vi.fn(async () => null) } } as unknown as PrismaClient;
    await expect(getImportReport(prisma, "company-b", "job-a")).rejects.toMatchObject({ code: "IMPORT_NOT_FOUND", statusCode: 404 });
    expect(prisma.importJob.findFirst).toHaveBeenCalledWith({ where: { id: "job-a", companyId: "company-b" } });
  });
});

describe("import image security", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.1.1", "172.31.255.255", "192.168.1.1", "169.254.1.1", "::1", "fd00::1"])(
    "identifica endereco privado %s",
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );

  it("aceita endereco publico", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("bloqueia localhost antes de qualquer download", async () => {
    await expect(assertPublicHost("localhost")).rejects.toMatchObject({ code: "IMPORT_IMAGE_PRIVATE_URL" });
  });

  it("valida magic bytes de JPEG", () => {
    expect(() => validateImageBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).not.toThrow();
  });

  it("valida magic bytes de PNG", () => {
    expect(() => validateImageBytes(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), "image/png")).not.toThrow();
  });

  it("rejeita imagem vazia", () => {
    expect(() => validateImageBytes(new Uint8Array(), "image/png")).toThrowError(/vazia/);
  });

  it("rejeita MIME incompatível com o conteúdo", () => {
    expect(() => validateImageBytes(Uint8Array.from([1, 2, 3, 4]), "image/jpeg")).toThrowError(/Assinatura/);
  });
});

describe("import storage boundaries", () => {
  it("nao usa supabaseAdmin nem Supabase Storage nas regras de importacao", async () => {
    const sources = await Promise.all([
      readFile(new URL("../src/routes/imports.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/resumable-import.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/import-media.ts", import.meta.url), "utf8"),
    ]);
    expect(sources.join("\n")).not.toMatch(/supabaseAdmin|\.storage\.from\(/);
  });

  it("centraliza uploads no contrato StorageProvider", async () => {
    const source = await readFile(new URL("../src/services/import-media.ts", import.meta.url), "utf8");
    expect(source).toContain("provider.uploadFile");
    expect(source).not.toMatch(/cloudinary|r2-storage-provider/i);
  });

  it("mantem escopo empresarial e idempotencia no schema", async () => {
    const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    expect(schema).toContain("@@unique([importJobId, rowNumber])");
    expect(schema).toContain("@@index([companyId, importJobId, status, rowNumber])");
    expect(schema).toContain("@@index([companyId, importSource, importExternalId])");
  });

  it("filtra job e linhas simultaneamente por companyId", async () => {
    const source = await readFile(new URL("../src/services/resumable-import.ts", import.meta.url), "utf8");
    expect(source).toMatch(/id: jobId, companyId/g);
    expect(source).toMatch(/importJobId: jobId, companyId/g);
  });

  it("rollback seleciona somente propriedades e arquivos do proprio job", async () => {
    const source = await readFile(new URL("../src/services/resumable-import.ts", import.meta.url), "utf8");
    expect(source).toContain("where: { companyId, importJobId: jobId }");
    expect(source).toContain("where: { companyId, importJobId: jobId }");
    expect(source).toContain("property.deleteMany({ where: { companyId, importJobId: jobId } })");
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("GAP-03 — rastreabilidade transversal sem ledger paralelo", () => {
  it("audita CRUD principal de Property e Owner no store canônico AuthAuditLog", async () => {
    const source = await readFile(new URL("../src/routes/real-estate.ts", import.meta.url), "utf8");
    for (const eventType of [
      "owner.created",
      "owner.updated",
      "owner.archived",
      "property.created",
      "property.updated",
      "property.archived",
    ]) {
      expect(source).toContain(`\"${eventType}\"`);
    }
    expect(source).toContain("writeAuthAudit(getPrisma()");
  });

  it("mantém o envelope mínimo tenant/ator e não cria tabela de auditoria paralela", async () => {
    const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
    expect(schema).toContain("model AuthAuditLog");
    expect(schema).not.toContain("model GlobalAuditLog");
    expect(schema).not.toContain("model AuditLedger");
    expect(schema).toContain("companyId    String");
    expect(schema).toContain("actorUserId  String?");
  });
});

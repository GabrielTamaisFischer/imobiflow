import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ensureMutable, itemConditions, inspectionStatuses, inspectionTypes, nextStatus } from "../src/routes/inspections-mysql.js";

describe("F5B Inspection domain lifecycle", () => {
  it("supports only the canonical entry and exit inspection types in F5B", () => {
    expect(inspectionTypes).toEqual(["entry", "exit"]);
  });

  it("starts every canonical workflow as draft", () => {
    expect(inspectionStatuses).toEqual(["draft", "in_progress", "completed", "archived"]);
  });

  it("allows draft to progress to in_progress", () => {
    expect(nextStatus("draft", "in_progress")).toBe("in_progress");
  });

  it("allows an in-progress inspection to complete", () => {
    expect(nextStatus("in_progress", "completed")).toBe("completed");
  });

  it("allows mutable work to be archived", () => {
    expect(nextStatus("draft", "archived")).toBe("archived");
    expect(nextStatus("in_progress", "archived")).toBe("archived");
  });

  it("rejects a silent completion or reopen transition", () => {
    expect(() => nextStatus("draft", "completed")).toThrow("Transição de status inválida");
    expect(() => nextStatus("completed", "in_progress")).toThrow("Transição de status inválida");
  });

  it("allows only an explicit completed to archived transition", () => {
    expect(() => ensureMutable({ status: "completed" }, "archived")).not.toThrow();
    expect(() => ensureMutable({ status: "completed" })).toThrow("Vistoria concluída ou arquivada não pode ser alterada");
    expect(() => ensureMutable({ status: "completed" }, "archived", true)).toThrow("Vistoria concluída ou arquivada não pode ser alterada");
    expect(() => ensureMutable({ status: "archived" }, "archived")).toThrow("Vistoria concluída ou arquivada não pode ser alterada");
  });

  it("keeps the structured condition vocabulary bounded", () => {
    expect(itemConditions).toEqual([
      "not_inspected",
      "excellent",
      "good",
      "fair",
      "poor",
      "damaged",
      "not_applicable",
    ]);
  });

  it("uses the existing idempotency ledger separately for Inspection, Room and Item creates", async () => {
    const source = await readFile(new URL("../src/routes/inspections-mysql.ts", import.meta.url), "utf8");
    expect(source).toContain('withIdempotency(companyId, "inspection.create", key');
    expect(source).toContain('withIdempotency(companyId, "inspection.room.create", key');
    expect(source).toContain('withIdempotency(companyId, "inspection.item.create", key');
  });

  it("requires an expected aggregate version and performs conflict-safe mutation", async () => {
    const source = await readFile(new URL("../src/routes/inspections-mysql.ts", import.meta.url), "utf8");
    expect(source).toContain("expected_version: z.number().int().positive()");
    expect(source).toContain("version: expectedVersion");
    expect(source).toContain("INSPECTION_VERSION_CONFLICT");
  });

  it("keeps completed room and item mutations guarded by inspection lifecycle", async () => {
    const source = await readFile(new URL("../src/routes/inspections-mysql.ts", import.meta.url), "utf8");
    expect(source).toContain('await ensureMutable(inspection);');
    expect(source).toContain('ensureMutable(existing, status, hasOtherChanges);');
  });

  it("uses the private StoredFile evidence pipeline with tenant-safe lifecycle guards", async () => {
    const source = await readFile(new URL("../src/routes/inspections-mysql.ts", import.meta.url), "utf8");
    expect(source).toContain('purpose: "inspection_evidence"');
    expect(source).toContain('deliveryAccessForPurpose("inspection_evidence")');
    expect(source).toContain('requirePermission("inspections.view")');
    expect(source).toContain('requirePermission("inspections.manage")');
    expect(source).toContain('await ensureMutable(inspection);');
    expect(source).toContain('where: { id: String(req.params.evidenceId), inspectionId: inspection.id, companyId: access.company.id }');
  });

  it("makes evidence retries idempotent and validates the binary before provider upload", async () => {
    const source = await readFile(new URL("../src/routes/inspections-mysql.ts", import.meta.url), "utf8");
    expect(source).toContain('withIdempotency(access.company.id, "inspection.evidence.create", key');
    expect(source).toContain('validateUploadFile({ purpose: "inspection_evidence"');
    expect(source).toContain("content_base64");
    expect(source).toContain("INSPECTION_VERSION_CONFLICT");
  });

  it("does not expose provider URLs as evidence DTO data", async () => {
    const source = await readFile(new URL("../src/routes/inspections-mysql.ts", import.meta.url), "utf8");
    const serializer = source.slice(source.indexOf("function serializeEvidence"), source.indexOf("async function evidenceSignedUrl"));
    expect(serializer).not.toContain("secureUrl");
    expect(serializer).not.toContain("publicId");
    expect(serializer).toContain("signed_url");
  });

  it("does not accept tenant or role fields in the create contract", async () => {
    const source = await readFile(new URL("../src/routes/inspections-mysql.ts", import.meta.url), "utf8");
    const createSchema = source.slice(source.indexOf("const createInspectionSchema"), source.indexOf("const patchInspectionSchema"));
    expect(createSchema).not.toContain("company_id");
    expect(createSchema).not.toContain("companyId");
    expect(createSchema).not.toContain("role");
  });

  it("records only minimal audit metadata for the canonical inspection events", async () => {
    const source = await readFile(new URL("../src/routes/inspections-mysql.ts", import.meta.url), "utf8");
    for (const eventName of [
      "inspection.created",
      "inspection.started",
      "inspection.completed",
      "inspection.archived",
      "inspection.updated",
      "inspection.room_added",
      "inspection.item_added",
    ]) {
      expect(source).toContain(`"${eventName}"`);
    }
    const eventCalls = source.match(/await event\([^\n]+/g)?.join("\n") ?? "";
    expect(eventCalls).not.toContain("notes:");
    expect(eventCalls).not.toContain("secureUrl");
  });
});

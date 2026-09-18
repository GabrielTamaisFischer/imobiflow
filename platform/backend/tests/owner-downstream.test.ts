import { describe, expect, it } from "vitest";
import { buildDownstreamReadiness } from "../src/services/owner-downstream.js";

describe("Owner360 downstream readiness", () => {
  it("is factual and reports missing fields without inventing values", () => {
    const readiness = buildDownstreamReadiness({ required: { name: "Pessoa QA", document: null, address: {} }, unresolvedConflicts: [], documents: [] });
    expect(readiness.ready).toBe(false);
    expect(readiness.missing_fields).toEqual(["document", "address"]);
  });

  it("blocks silent prefill when a critical conflict or expired document exists", () => {
    const readiness = buildDownstreamReadiness({ required: { name: "Pessoa QA", document: "52998224725", address: { city: "São Paulo" } }, unresolvedConflicts: ["identity.document"], documents: [{ type: "identity", status: "EXPIRED" }] });
    expect(readiness.ready).toBe(false);
    expect(readiness.conflicting_fields).toContain("identity.document");
    expect(readiness.expired_documents).toEqual(["identity"]);
    expect(readiness.requires_review).toBe(true);
  });

  it("keeps a complete, conflict-free owner ready", () => {
    const readiness = buildDownstreamReadiness({ required: { name: "Pessoa QA", document: "52998224725", nationality: "Brasileira", marital_status: "solteira", profession: "Arquiteta", address: { city: "São Paulo" } }, unresolvedConflicts: [], documents: [{ type: "identity", status: "VALID" }] });
    expect(readiness).toMatchObject({ ready: true, missing_fields: [], conflicting_fields: [], expired_documents: [], requires_review: false });
  });
});

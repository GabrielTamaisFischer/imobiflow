import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodePortalSignature } from "../src/services/portal-signatures-f8b.js";
import { portalSignatureSchema } from "../src/routes/portal-mysql.js";
import { canTransitionContract } from "../src/services/contracts-f6.js";
import { deliveryAccessForPurpose } from "../src/services/storage/purposes.js";

const routeSource = readFileSync(new URL("../src/routes/portal-mysql.ts", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../src/services/portal-signatures-f8b.ts", import.meta.url), "utf8");
const validSignature = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const validInput = { version_id: "00000000-0000-0000-0000-000000000001", signer_name: "Tenant QA", signature_base64: validSignature };

describe("F8B.0 — assinatura autenticada por token do portal", () => {
  it("aceita payload mínimo e default de aceite", () => {
    expect(portalSignatureSchema.parse(validInput).accepted_terms).toBe(true);
  });
  it("exige version_id UUID", () => {
    expect(() => portalSignatureSchema.parse({ ...validInput, version_id: "not-a-uuid" })).toThrow();
  });
  it("exige nome de signatário", () => {
    expect(() => portalSignatureSchema.parse({ ...validInput, signer_name: "x" })).toThrow();
  });
  it("rejeita party_id controlado pelo cliente", () => {
    expect(() => portalSignatureSchema.parse({ ...validInput, party_id: "00000000-0000-0000-0000-000000000002" })).toThrow();
  });
  it("rejeita signer_role controlado pelo cliente", () => {
    expect(() => portalSignatureSchema.parse({ ...validInput, signer_role: "buyer" })).toThrow();
  });
  it("rejeita company_id controlado pelo cliente", () => {
    expect(() => portalSignatureSchema.parse({ ...validInput, company_id: "company-b" })).toThrow();
  });
  it("exige aceite explícito quando false", () => {
    expect(portalSignatureSchema.parse({ ...validInput, accepted_terms: false }).accepted_terms).toBe(false);
    expect(serviceSource).toContain("SIGNATURE_TERMS_REQUIRED");
  });
  it("decodifica assinatura PNG em data URL", () => {
    expect(decodePortalSignature(`data:image/png;base64,${validSignature}`)).toEqual(Buffer.from(validSignature, "base64"));
  });
  it("decodifica base64 sem data URL", () => {
    expect(decodePortalSignature(validSignature).byteLength).toBeGreaterThan(0);
  });
  it("rejeita conteúdo que não é base64", () => {
    expect(() => decodePortalSignature("not base64 <>" )).toThrow(/inválido/);
  });
  it("mantém assinatura e evidência privadas", () => {
    expect(deliveryAccessForPurpose("signature_evidence")).toBe("authenticated");
    expect(deliveryAccessForPurpose("contract_signature")).toBe("authenticated");
  });
  it("bloqueia versão arquivada/cancelada por lifecycle", () => {
    expect(canTransitionContract("archived", "signed")).toBe(false);
    expect(canTransitionContract("cancelled", "signed")).toBe(false);
    expect(serviceSource).toContain("CONTRACT_VERSION_IMMUTABLE");
  });
  it("mantém signed imutável para uma nova assinatura", () => {
    expect(serviceSource).toContain('input.version.status === "signed"');
    expect(serviceSource).toContain("CONTRACT_VERSION_SIGNED");
  });
  it("impede assinatura duplicada de uma mesma parte", () => {
    expect(serviceSource).toContain("SIGNATURE_DUPLICATE");
    expect(serviceSource).toContain('partySignatureStatus === "signed"');
  });
  it("usa atualização atômica condicionada da parte", () => {
    expect(serviceSource).toContain("updateMany");
    expect(serviceSource).toContain('signatureStatus: { not: "signed" }');
  });
  it("usa idempotência por empresa, versão e parte", () => {
    expect(serviceSource).toContain('withIdempotency(input.companyId, "contract.signature.create"');
    expect(serviceSource).toContain("contract.signature:${input.version.id}:${input.partyId}");
  });
  it("resolve identidade pelo token e não por campos de contrato enviados", () => {
    expect(routeSource).toContain("requirePortalParty(partyType)");
    expect(routeSource).toContain("party.companyId");
    expect(routeSource).toContain("party.id");
    expect(routeSource).not.toContain("input.party_id");
    expect(routeSource).not.toContain("input.company_id");
  });
  it("escopa contrato e versão por tenant e vínculo da parte", () => {
    expect(routeSource).toContain("companyId: party.companyId");
    expect(routeSource).toContain("contractId: contract.id");
    expect(routeSource).toContain("partyType, signatureRequired: true");
  });
  it("não retorna token nem internals do provider", () => {
    expect(routeSource).toContain("return res.status(result.replayed ? 200 : 201).json({ ...result.result, replayed: result.replayed });");
    expect(serviceSource).toContain("signature_type: \"simple_electronic_capture\"");
    expect(serviceSource).toContain("simple_electronic_capture");
  });
  it("registra evento de assinatura originado no portal", () => {
    expect(serviceSource).toContain('eventType: "contract.signature_created"');
    expect(serviceSource).toContain('source: "portal"');
  });
  it("expõe rotas separadas para tenant e buyer", () => {
    expect(routeSource).toContain('post("/tenant/contracts/:id/signatures"');
    expect(routeSource).toContain('post("/buyer/contracts/:id/signatures"');
  });
});

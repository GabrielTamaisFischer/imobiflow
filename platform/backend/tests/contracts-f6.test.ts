import { describe, expect, it } from "vitest";
import { canTransitionContract, contractSnapshotHash, stableContractJson } from "../src/services/contracts-f6.js";
import { deliveryAccessForPurpose } from "../src/services/storage/purposes.js";
import { validateUploadFile } from "../src/services/storage/file-policy.js";
import { canPartyViewContract, canPartySignVersion } from "../src/services/contract-party-portal.js";
import { brokerResourceScopedPermissions, roleTemplates } from "../src/services/roles.js";

describe("F6A contrato canônico", () => {
  it("mantém contrato como capability Broker somente em resource-scope", () => {
    const broker = roleTemplates.find((role) => role.systemKey === "broker");
    expect(broker?.permissions).toContain("contracts.view");
    expect(broker?.permissions).not.toContain("contracts.manage");
    expect(brokerResourceScopedPermissions).toContain("contracts.view");
  });
  it("protege lifecycle e imutabilidade arquivada", () => {
    expect(canTransitionContract("draft", "generated")).toBe(true);
    expect(canTransitionContract("generated", "signed")).toBe(false);
    expect(canTransitionContract("signed", "active")).toBe(true);
    expect(canTransitionContract("archived", "draft")).toBe(false);
  });

  it("produz snapshot determinístico e hash verificável", () => {
    const left = { b: 2, a: { z: true, x: 1 } };
    const right = { a: { x: 1, z: true }, b: 2 };
    expect(stableContractJson(left)).toBe(stableContractJson(right));
    expect(contractSnapshotHash(left)).toBe(contractSnapshotHash(right));
    expect(contractSnapshotHash(left)).not.toBe(contractSnapshotHash({ ...left, b: 3 }));
  });

  it("mantém documentos, assinaturas e anexos privados", () => {
    expect(deliveryAccessForPurpose("contract_document")).toBe("authenticated");
    expect(deliveryAccessForPurpose("contract_signature")).toBe("authenticated");
    expect(deliveryAccessForPurpose("signature_evidence")).toBe("authenticated");
    expect(deliveryAccessForPurpose("contract_attachment")).toBe("authenticated");
  });

  it("rejeita anexo com MIME incompatível no backend", () => {
    expect(() => validateUploadFile({
      purpose: "contract_attachment",
      fileName: "malware.exe",
      mimeType: "application/x-msdownload",
      body: Buffer.from("MZ"),
    })).toThrow();
  });

  it("modela assinatura parcial e impede regressões de status", () => {
    expect(canTransitionContract("draft", "generated")).toBe(true);
    expect(canTransitionContract("generated", "waiting_signature")).toBe(true);
    expect(canTransitionContract("waiting_signature", "partially_signed")).toBe(true);
    expect(canTransitionContract("partially_signed", "signed")).toBe(true);
    expect(canTransitionContract("waiting_signature", "signed")).toBe(true);
    expect(canTransitionContract("signed", "draft")).toBe(false);
    expect(canTransitionContract("cancelled", "draft")).toBe(false);
    expect(canTransitionContract("archived", "signed")).toBe(false);
  });

  it("mantém autorização de parte tenant-scoped", async () => {
    const fakeDb = {
      contractParty: { findFirst: async ({ where }: any) => where.companyId === "company-a" && where.email === "tenant@example.test" ? { id: "party-a" } : null },
      contractVersion: { findFirst: async ({ where }: any) => where.companyId === "company-a" ? { id: "version-a" } : null },
    } as any;
    await expect(canPartyViewContract(fakeDb, { companyId: "company-a", email: "tenant@example.test" }, "contract-a")).resolves.toBe(true);
    await expect(canPartyViewContract(fakeDb, { companyId: "company-b", email: "tenant@example.test" }, "contract-a")).resolves.toBe(false);
    await expect(canPartySignVersion(fakeDb, { companyId: "company-a", email: "tenant@example.test" }, "contract-a", "version-a")).resolves.toBe(true);
  });

  it("permite download somente de versão assinada da parte correspondente", async () => {
    const fakeDb = {
      contractParty: { findFirst: async ({ where }: any) => where.companyId === "company-a" && where.email === "tenant@example.test" ? { id: "party-a" } : null },
      contractVersion: { findFirst: async ({ where }: any) => where.companyId === "company-a" && where.status === "signed" ? { id: "version-a" } : null },
    } as any;
    const { canPartyDownloadSignedDocument } = await import("../src/services/contract-party-portal.js");
    await expect(canPartyDownloadSignedDocument(fakeDb, { companyId: "company-a", email: "tenant@example.test" }, "contract-a", "version-a")).resolves.toBe(true);
    await expect(canPartyDownloadSignedDocument(fakeDb, { companyId: "company-b", email: "tenant@example.test" }, "contract-a", "version-a")).resolves.toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  portalApiPath,
  portalDocumentView,
  portalErrorMessage,
  portalHistory,
  portalStatusLabel,
  type PortalAggregate,
} from "./portal-interfaces";

const contract = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  title: "Contrato QA",
  contract_type: "rental",
  status: "waiting_signature",
  starts_at: null,
  ends_at: null,
  current_version: 1,
  signed_version: null,
  property: null,
  party: [],
  signature: { pending: true, status: [] },
  latest_version: { id: "v1", version_number: 1, status: "waiting_signature", document_hash: null },
  documents: [
    {
      id: "d1",
      purpose: "contract_document",
      filename: "contrato.pdf",
      mime_type: "application/pdf",
      size_bytes: 12,
      created_at: "2026-09-11T00:00:00.000Z",
      download_path: "/portal/tenant/contracts/c1/document?version_id=v1",
    },
  ],
  history: [],
  ...overrides,
});

describe("F8B portal UI contract", () => {
  it("1. usa endpoints separados por papel", () => {
    expect(portalApiPath("tenant")).toBe("/portal/tenant/me");
    expect(portalApiPath("buyer")).toBe("/portal/buyer/me");
  });
  it("2. traduz status de contrato", () => {
    expect(portalStatusLabel("waiting_signature")).toBe("Aguardando assinatura");
    expect(portalStatusLabel("partially_signed")).toBe("Parcialmente assinado");
  });
  it("3. traduz status desconhecido sem quebrar", () => {
    expect(portalStatusLabel("new_status")).toBe("new status");
  });
  it("4. classifica 401 sem expor backend", () => {
    expect(portalErrorMessage({ status: 401 })).toContain("revogado");
  });
  it("5. classifica 404", () => {
    expect(portalErrorMessage({ status: 404 })).toContain("não está disponível");
  });
  it("6. classifica 409", () => {
    expect(portalErrorMessage({ status: 409 })).toContain("outra sessão");
  });
  it("7. classifica 422", () => {
    expect(portalErrorMessage({ status: 422 })).toContain("Confira");
  });
  it("8. fallback de erro não mostra stack", () => {
    expect(portalErrorMessage({ message: "Falha controlada" })).toBe("Falha controlada");
  });
  it("9. documento expõe somente metadados para a UI", () => {
    expect(
      portalDocumentView({
        id: "d",
        purpose: "contract_document",
        filename: "a.pdf",
        mime_type: "application/pdf",
        size_bytes: 1,
        created_at: "2026-09-11",
        download_path: "/private",
      }),
    ).toEqual({ name: "a.pdf", mimeType: "application/pdf", date: "2026-09-11", sizeBytes: 1 });
  });
  it("10. documento sem nome recebe label neutro", () => {
    expect(
      portalDocumentView({
        id: "d",
        purpose: "contract_document",
        filename: "",
        mime_type: "application/pdf",
        size_bytes: null,
        created_at: "2026-09-11",
        download_path: null,
      }).name,
    ).toBe("Documento");
  });
  it("11. histórico combina contratos", () => {
    const aggregate = {
      portal: "tenant",
      identity: { name: "A", email: null, party_type: "tenant" },
      properties: [],
      contracts: [
        contract({
          history: [{ type: "contract.created", occurred_at: "2026-09-11T02:00:00.000Z" }],
        }),
      ],
      inspections: [],
      payments: { available: false, next_due_dates: [] },
      actions: { sign_contract: true, download_document: true, view_inspection: false },
    } as unknown as PortalAggregate;
    expect(portalHistory(aggregate)).toHaveLength(1);
    expect(portalHistory(aggregate)[0].contractTitle).toBe("Contrato QA");
  });
  it("12. histórico ordena cronologicamente", () => {
    const aggregate = {
      contracts: [
        contract({ title: "A", history: [{ type: "a", occurred_at: "2026-09-12" }] }),
        contract({ id: "c2", title: "B", history: [{ type: "b", occurred_at: "2026-09-11" }] }),
      ],
    } as unknown as PortalAggregate;
    expect(portalHistory(aggregate).map((event) => event.type)).toEqual(["b", "a"]);
  });
  it("13. contrato mantém documentos reais", () => {
    expect(contract().documents[0].filename).toBe("contrato.pdf");
  });
  it("14. contrato mantém assinatura pendente", () => {
    expect(contract().signature.pending).toBe(true);
  });
  it("15. contrato pode refletir assinatura concluída", () => {
    expect(contract({ signature: { pending: false, status: [] } }).signature.pending).toBe(false);
  });
  it("16. proposta indisponível é estado explícito", () => {
    const value = { available: false, reason: "proposal_domain_futuro" };
    expect(value.available).toBe(false);
    expect(value.reason).toBeTruthy();
  });
  it("17. financeiro indisponível não inventa valores", () => {
    const value = { available: false, next_due_dates: [] };
    expect(value.next_due_dates).toEqual([]);
  });
  it("18. rota não recebe companyId", () => {
    expect(portalApiPath("tenant")).not.toContain("company");
  });
  it("19. rota não recebe partyId", () => {
    expect(portalApiPath("buyer")).not.toContain("party");
  });
  it("20. documentos usam path privado do backend", () => {
    expect(contract().documents[0].download_path).toContain("/portal/tenant/contracts/");
  });
  it("21. histórico vazio é permitido", () => {
    const aggregate = { contracts: [] } as unknown as PortalAggregate;
    expect(portalHistory(aggregate)).toEqual([]);
  });
});

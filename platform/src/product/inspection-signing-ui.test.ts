import { describe, expect, it } from "vitest";
import {
  canCancelProcess,
  canDownloadSignedReport,
  canIssueNewLink,
  canRevokeParty,
  canSignInPerson,
  findTypedSignatureFont,
  isSigningProcessActive,
  signedReportAvailability,
  TYPED_SIGNATURE_FONTS,
} from "./inspection-signing-ui";
import type { SigningParty, SigningProcess } from "./inspection-signing";

function party(overrides: Partial<SigningParty> = {}): SigningParty {
  return {
    id: "party-1",
    role: "owner",
    role_label: "Proprietário",
    party_id: null,
    name: "Maria",
    document: null,
    email: null,
    phone: null,
    status: "pending",
    signature_method: null,
    has_active_link: true,
    token_expires_at: null,
    link_created_at: null,
    viewed_at: null,
    consented_at: null,
    signed_at: null,
    revoked_at: null,
    expired_at: null,
    ...overrides,
  };
}

function process(overrides: Partial<SigningProcess> = {}): SigningProcess {
  return {
    id: "process-1",
    inspection_id: "inspection-1",
    report_stored_file_id: "file-1",
    document_hash: "hash",
    status: "pending",
    progress_label: "0 de 1",
    created_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
    cancelled_at: null,
    expired_at: null,
    parties: [],
    ...overrides,
  };
}

describe("isSigningProcessActive", () => {
  it("pending e partially_signed são ativos; completed/expired/cancelled não são", () => {
    expect(isSigningProcessActive("pending")).toBe(true);
    expect(isSigningProcessActive("partially_signed")).toBe(true);
    expect(isSigningProcessActive("completed")).toBe(false);
    expect(isSigningProcessActive("expired")).toBe(false);
    expect(isSigningProcessActive("cancelled")).toBe(false);
  });
});

describe("canIssueNewLink", () => {
  it("permite para signatário pending/expired em processo ativo", () => {
    expect(canIssueNewLink(process(), party({ status: "pending" }))).toBe(true);
    expect(canIssueNewLink(process(), party({ status: "expired" }))).toBe(true);
  });

  it("nega para signatário já assinado ou revogado", () => {
    expect(canIssueNewLink(process(), party({ status: "signed" }))).toBe(false);
    expect(canIssueNewLink(process(), party({ status: "revoked" }))).toBe(false);
  });

  it("nega quando o processo não está mais ativo, mesmo com signatário pending", () => {
    expect(canIssueNewLink(process({ status: "cancelled" }), party({ status: "pending" }))).toBe(false);
  });
});

describe("canRevokeParty / canSignInPerson / canCancelProcess / canDownloadSignedReport", () => {
  it("canRevokeParty permite pending/expired, nega signed/revoked", () => {
    expect(canRevokeParty(party({ status: "pending" }))).toBe(true);
    expect(canRevokeParty(party({ status: "expired" }))).toBe(true);
    expect(canRevokeParty(party({ status: "signed" }))).toBe(false);
    expect(canRevokeParty(party({ status: "revoked" }))).toBe(false);
  });

  it("canSignInPerson exige processo ativo e signatário pending", () => {
    expect(canSignInPerson(process(), party({ status: "pending" }))).toBe(true);
    expect(canSignInPerson(process(), party({ status: "expired" }))).toBe(false);
    expect(canSignInPerson(process({ status: "completed" }), party({ status: "pending" }))).toBe(false);
  });

  it("canCancelProcess e canDownloadSignedReport refletem o status do processo", () => {
    expect(canCancelProcess(process({ status: "pending" }))).toBe(true);
    expect(canCancelProcess(process({ status: "completed" }))).toBe(false);
    expect(canDownloadSignedReport(process({ status: "completed" }))).toBe(true);
    expect(canDownloadSignedReport(process({ status: "pending" }))).toBe(false);
  });
});

describe("TYPED_SIGNATURE_FONTS / findTypedSignatureFont", () => {
  it("oferece entre 4 e 6 estilos, todos com id/label/fontFamily", () => {
    expect(TYPED_SIGNATURE_FONTS.length).toBeGreaterThanOrEqual(4);
    expect(TYPED_SIGNATURE_FONTS.length).toBeLessThanOrEqual(6);
    for (const font of TYPED_SIGNATURE_FONTS) {
      expect(font.id).toBeTruthy();
      expect(font.label).toBeTruthy();
      expect(font.fontFamily).toBeTruthy();
    }
  });

  it("findTypedSignatureFont resolve por id e cai para o primeiro quando ausente/inválido", () => {
    expect(findTypedSignatureFont("cursive-3")?.id).toBe("cursive-3");
    expect(findTypedSignatureFont(null)).toBe(TYPED_SIGNATURE_FONTS[0]);
    expect(findTypedSignatureFont("id-que-nao-existe")).toBe(TYPED_SIGNATURE_FONTS[0]);
  });
});

describe("signedReportAvailability", () => {
  it("'ready' quando algum processo está completed, mesmo com outros cancelados", () => {
    expect(signedReportAvailability([process({ status: "cancelled" }), process({ status: "completed" })])).toBe("ready");
  });

  it("'in_progress' quando há processo ativo e nenhum completed", () => {
    expect(signedReportAvailability([process({ status: "pending" })])).toBe("in_progress");
  });

  it("'none' quando não há processos ou todos estão cancelados/expirados", () => {
    expect(signedReportAvailability([])).toBe("none");
    expect(signedReportAvailability([process({ status: "cancelled" }), process({ status: "expired" })])).toBe("none");
  });
});

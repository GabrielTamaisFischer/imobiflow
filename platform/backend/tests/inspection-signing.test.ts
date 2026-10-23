import { describe, expect, it } from "vitest";
import {
  buildSigningPartySnapshot,
  computeSigningProcessStatus,
  generateSigningToken,
  hashDocument,
  hashSigningToken,
  isActiveSigningParty,
  isSigningPartyRole,
  requiresPartyLink,
  SIGNING_CONSENT_TEXT,
  signingProgressLabel,
  signingTokenExpiry,
} from "../src/services/inspection-signing.js";

describe("generateSigningToken / hashSigningToken", () => {
  it("gera tokens diferentes a cada chamada (nunca reutiliza o mesmo valor)", () => {
    const a = generateSigningToken();
    const b = generateSigningToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it("o hash nunca é igual ao token em plaintext, e é determinístico para o mesmo input", () => {
    const token = generateSigningToken();
    const hash = hashSigningToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSigningToken(token)).toBe(hash);
  });

  it("tokens diferentes produzem hashes diferentes", () => {
    expect(hashSigningToken(generateSigningToken())).not.toBe(hashSigningToken(generateSigningToken()));
  });
});

describe("signingTokenExpiry", () => {
  it("expira 7 dias após 'now' por padrão", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expiry = signingTokenExpiry(now);
    expect(expiry.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("aceita um número de dias customizado", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(signingTokenExpiry(now, 1).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("hashDocument", () => {
  it("é determinístico (mesmo conteúdo -> mesmo hash SHA-256) e sensível a qualquer alteração", () => {
    const bytes = Buffer.from("conteudo do laudo");
    const hash1 = hashDocument(bytes);
    const hash2 = hashDocument(Buffer.from("conteudo do laudo"));
    const hashDifferent = hashDocument(Buffer.from("conteudo do laudo alterado"));
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDifferent);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isSigningPartyRole", () => {
  it("aceita exatamente os 4 papéis do domínio e rejeita qualquer outro valor", () => {
    expect(isSigningPartyRole("owner")).toBe(true);
    expect(isSigningPartyRole("tenant_buyer")).toBe(true);
    expect(isSigningPartyRole("responsible")).toBe(true);
    expect(isSigningPartyRole("witness")).toBe(true);
    expect(isSigningPartyRole("corretor")).toBe(false);
    expect(isSigningPartyRole(null)).toBe(false);
    expect(isSigningPartyRole(42)).toBe(false);
  });
});

describe("requiresPartyLink", () => {
  it("nenhum papel exige Party vinculada — testemunha pode existir sozinha, e os demais também aceitam snapshot puro", () => {
    expect(requiresPartyLink("owner")).toBe(false);
    expect(requiresPartyLink("tenant_buyer")).toBe(false);
    expect(requiresPartyLink("responsible")).toBe(false);
    expect(requiresPartyLink("witness")).toBe(false);
  });
});

describe("buildSigningPartySnapshot", () => {
  it("normaliza nome/documento/telefone (trim) e e-mail (trim + lowercase)", () => {
    const snapshot = buildSigningPartySnapshot({
      role: "owner",
      name: "  Maria Silva  ",
      document: " 123.456.789-00 ",
      email: " MARIA@Example.COM ",
      phone: " (11) 99999-0000 ",
      partyId: "party-1",
    });
    expect(snapshot).toEqual({
      role: "owner",
      partyId: "party-1",
      signerNameSnapshot: "Maria Silva",
      signerDocumentSnapshot: "123.456.789-00",
      signerEmailSnapshot: "maria@example.com",
      signerPhoneSnapshot: "(11) 99999-0000",
    });
  });

  it("campos opcionais ausentes/vazios tornam-se null (nunca string vazia), e partyId ausente é null", () => {
    const snapshot = buildSigningPartySnapshot({ role: "witness", name: "Testemunha Sem Party" });
    expect(snapshot).toEqual({
      role: "witness",
      partyId: null,
      signerNameSnapshot: "Testemunha Sem Party",
      signerDocumentSnapshot: null,
      signerEmailSnapshot: null,
      signerPhoneSnapshot: null,
    });
  });
});

describe("isActiveSigningParty", () => {
  it("só 'revoked' é considerado inativo — pending/signed/expired contam para completude", () => {
    expect(isActiveSigningParty("pending")).toBe(true);
    expect(isActiveSigningParty("signed")).toBe(true);
    expect(isActiveSigningParty("expired")).toBe(true);
    expect(isActiveSigningParty("revoked")).toBe(false);
  });
});

describe("computeSigningProcessStatus", () => {
  it("nenhum signatário assinado ainda -> pending", () => {
    expect(computeSigningProcessStatus("pending", [{ status: "pending" }, { status: "pending" }])).toBe("pending");
  });

  it("alguns assinados, outros não -> partially_signed", () => {
    expect(computeSigningProcessStatus("pending", [{ status: "signed" }, { status: "pending" }])).toBe("partially_signed");
  });

  it("todos os signatários ATIVOS assinados -> completed", () => {
    expect(computeSigningProcessStatus("partially_signed", [{ status: "signed" }, { status: "signed" }])).toBe("completed");
  });

  it("signatário revogado é excluído do cálculo — os demais assinados ainda completam o processo", () => {
    expect(computeSigningProcessStatus("partially_signed", [{ status: "signed" }, { status: "revoked" }])).toBe("completed");
  });

  it("todos revogados -> mantém o status atual (nunca conclui nem cancela sozinho)", () => {
    expect(computeSigningProcessStatus("pending", [{ status: "revoked" }, { status: "revoked" }])).toBe("pending");
  });

  it("processo já cancelled ou expired nunca é recalculado, mesmo que todos estejam assinados", () => {
    expect(computeSigningProcessStatus("cancelled", [{ status: "signed" }])).toBe("cancelled");
    expect(computeSigningProcessStatus("expired", [{ status: "signed" }])).toBe("expired");
  });
});

describe("signingProgressLabel", () => {
  it("formata 'X de Y' contando só signatários ativos (nunca revogados)", () => {
    expect(signingProgressLabel([{ status: "pending" }, { status: "pending" }, { status: "signed" }])).toBe("1 de 3");
    expect(signingProgressLabel([{ status: "signed" }, { status: "revoked" }])).toBe("Concluído");
  });

  it("'Concluído' só quando TODOS os ativos estão assinados", () => {
    expect(signingProgressLabel([{ status: "signed" }, { status: "signed" }])).toBe("Concluído");
    expect(signingProgressLabel([{ status: "signed" }, { status: "pending" }])).toBe("1 de 2");
  });
});

describe("SIGNING_CONSENT_TEXT", () => {
  it("é exatamente o texto exigido pelo usuário, sem paráfrase", () => {
    expect(SIGNING_CONSENT_TEXT).toBe(
      "Declaro que li o laudo apresentado e concordo em registrar minha assinatura eletrônica neste documento.",
    );
  });
});

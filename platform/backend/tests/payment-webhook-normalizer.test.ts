import { describe, expect, it } from "vitest";
import {
  normalizePaymentWebhookPayload,
  resolvePaymentWebhookSecret,
} from "../src/services/payment-webhook-normalizer.js";

describe("payment webhook normalizer", () => {
  it("prioriza segredo especifico da Iugu e usa fallback geral quando necessario", () => {
    expect(
      resolvePaymentWebhookSecret("iugu", {
        fallback: "global-secret",
        iugu: "iugu-secret",
        pjbank: "pjbank-secret",
      }),
    ).toBe("iugu-secret");

    expect(
      resolvePaymentWebhookSecret("asaas", {
        fallback: "global-secret",
        asaas: "asaas-secret",
        iugu: "iugu-secret",
      }),
    ).toBe("asaas-secret");

    expect(
      resolvePaymentWebhookSecret("mercado_pago", {
        fallback: "global-secret",
        asaas: "asaas-secret",
      }),
    ).toBe("global-secret");

    expect(
      resolvePaymentWebhookSecret("pjbank", {
        fallback: "global-secret",
      }),
    ).toBe("global-secret");
  });

  it("identifica cobranca interna em payload Iugu por custom_variables", () => {
    const normalized = normalizePaymentWebhookPayload(
      {
        event: "invoice.status_changed",
        data: {
          id: "IUGU_INVOICE_123",
          status: "paid",
          payment_method: "iugu_pix",
          amount_cents: 300379,
          paid_at: "2026-05-16T12:30:00.000Z",
          custom_variables: [
            {
              name: "imobiflow_charge_id",
              value: "8bd0d4c7-6f3b-4bde-b4b4-3594a09261db",
            },
            {
              name: "imobiflow_company_id",
              value: "0aa08d6d-f9bb-427a-b9cb-5bbbc09ed46b",
            },
          ],
        },
      },
      new Date("2026-05-16T13:00:00.000Z"),
    );

    expect(normalized.eventType).toBe("invoice.status_changed");
    expect(normalized.gatewayChargeId).toBe("IUGU_INVOICE_123");
    expect(normalized.internalChargeId).toBe("8bd0d4c7-6f3b-4bde-b4b4-3594a09261db");
    expect(normalized.normalizedStatus).toBe("paid");
    expect(normalized.paymentMethod).toBe("pix");
    expect(normalized.amountCents).toBe(300379);
    expect(normalized.paidAt).toBe("2026-05-16T12:30:00.000Z");
  });

  it("mantem boleto criado como aguardando pagamento sem marcar como pago", () => {
    const normalized = normalizePaymentWebhookPayload(
      {
        event: "invoice.created",
        invoice: {
          id: "IUGU_INVOICE_456",
          status: "pending",
          payment_method: "bank_slip",
          total: "3003.79",
          custom_variables: [
            {
              name: "imobiflow_charge_id",
              value: "58267e5c-079f-49f5-aeb9-77a916e1b882",
            },
          ],
        },
      },
      new Date("2026-05-16T13:00:00.000Z"),
    );

    expect(normalized.gatewayChargeId).toBe("IUGU_INVOICE_456");
    expect(normalized.internalChargeId).toBe("58267e5c-079f-49f5-aeb9-77a916e1b882");
    expect(normalized.normalizedStatus).toBe("waiting_payment");
    expect(normalized.paymentMethod).toBe("boleto");
    expect(normalized.amountCents).toBe(300379);
  });

  it("normaliza webhook Asaas de pagamento recebido usando externalReference", () => {
    const normalized = normalizePaymentWebhookPayload(
      {
        id: "evt_asaas_123",
        event: "PAYMENT_RECEIVED",
        payment: {
          id: "pay_456",
          status: "RECEIVED",
          billingType: "PIX",
          value: 3003.79,
          netValue: 2999.42,
          paymentDate: "2026-05-17",
          clientPaymentDate: "2026-05-17",
          externalReference: "64fd31f1-47a3-4dcc-9485-6c0a9ad9db1f",
        },
      },
      new Date("2026-05-17T15:00:00.000Z"),
    );

    expect(normalized.eventType).toBe("PAYMENT_RECEIVED");
    expect(normalized.gatewayEventId).toBe("evt_asaas_123");
    expect(normalized.gatewayChargeId).toBe("pay_456");
    expect(normalized.internalChargeId).toBe("64fd31f1-47a3-4dcc-9485-6c0a9ad9db1f");
    expect(normalized.normalizedStatus).toBe("paid");
    expect(normalized.paymentMethod).toBe("pix");
    expect(normalized.amountCents).toBe(300379);
  });
});

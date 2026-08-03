import { unsupportedGatewayOperation } from "./errors.js";
import type {
  FinancialGatewayCancelChargeInput,
  FinancialGatewayChargeInput,
  FinancialGatewayChargeResult,
  FinancialGatewayConnector,
  FinancialGatewayEnvironment,
  FinancialGatewayHealthcheckResult,
  FinancialGatewayTransferInput,
  FinancialGatewayTransferResult,
  FinancialGatewayWebhookVerificationInput,
  NormalizedFinancialWebhookEvent,
} from "./types.js";

export class ManualFinancialGatewayConnector implements FinancialGatewayConnector {
  provider = "manual" as const;

  async createCharge(input: FinancialGatewayChargeInput): Promise<FinancialGatewayChargeResult> {
    return {
      provider: this.provider,
      externalChargeId: `manual_${input.internalChargeId}`,
      status: "pending",
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      paymentMethod: input.paymentMethods[0] ?? null,
      boleto: null,
      pix: null,
      raw: {
        mode: "manual",
        internalChargeId: input.internalChargeId,
        idempotencyKey: input.idempotencyKey,
      },
    };
  }

  async cancelCharge(input: FinancialGatewayCancelChargeInput): Promise<FinancialGatewayChargeResult> {
    return {
      provider: this.provider,
      externalChargeId: input.externalChargeId,
      status: "cancelled",
      amountCents: 0,
      dueDate: new Date().toISOString().slice(0, 10),
      paymentMethod: null,
      boleto: null,
      pix: null,
      raw: {
        mode: "manual",
        reason: input.reason ?? null,
      },
    };
  }

  async getCharge(
    _connectionId: string,
    externalChargeId: string,
  ): Promise<FinancialGatewayChargeResult> {
    return {
      provider: this.provider,
      externalChargeId,
      status: "pending",
      amountCents: 0,
      dueDate: new Date().toISOString().slice(0, 10),
      paymentMethod: null,
      boleto: null,
      pix: null,
      raw: {
        mode: "manual",
        message: "Cobranca manual sem consulta externa.",
      },
    };
  }

  async createTransfer(_input: FinancialGatewayTransferInput): Promise<FinancialGatewayTransferResult> {
    throw unsupportedGatewayOperation(this.provider, "createTransfer");
  }

  async verifyWebhook(input: FinancialGatewayWebhookVerificationInput): Promise<boolean> {
    return input.provider === this.provider;
  }

  async normalizeWebhookEvent(
    input: FinancialGatewayWebhookVerificationInput,
  ): Promise<NormalizedFinancialWebhookEvent> {
    let parsed: Record<string, unknown> = {};

    try {
      parsed = JSON.parse(input.rawBody) as Record<string, unknown>;
    } catch {
      parsed = { rawBody: input.rawBody };
    }

    return {
      provider: this.provider,
      eventType: String(parsed.event_type ?? parsed.eventType ?? "manual.event"),
      gatewayEventId: String(parsed.id ?? parsed.gateway_event_id ?? `manual_${Date.now()}`),
      gatewayChargeId:
        typeof parsed.gateway_charge_id === "string"
          ? parsed.gateway_charge_id
          : typeof parsed.charge_id === "string"
            ? parsed.charge_id
            : null,
      gatewayTransferId:
        typeof parsed.gateway_transfer_id === "string"
          ? parsed.gateway_transfer_id
          : typeof parsed.transfer_id === "string"
            ? parsed.transfer_id
            : null,
      statusBefore: null,
      statusAfter: "processing",
      grossAmountCents:
        typeof parsed.gross_amount_cents === "number" ? parsed.gross_amount_cents : null,
      netAmountCents:
        typeof parsed.net_amount_cents === "number" ? parsed.net_amount_cents : null,
      feeAmountCents:
        typeof parsed.fee_amount_cents === "number" ? parsed.fee_amount_cents : null,
      paymentMethod: null,
      paidAt: typeof parsed.paid_at === "string" ? parsed.paid_at : null,
      occurredAt: typeof parsed.occurred_at === "string" ? parsed.occurred_at : null,
      raw: parsed,
    };
  }

  async healthcheck(
    _connectionId: string,
    environment: FinancialGatewayEnvironment,
  ): Promise<FinancialGatewayHealthcheckResult> {
    return {
      provider: this.provider,
      environment,
      ok: true,
      checkedAt: new Date().toISOString(),
      message: "Gateway manual disponivel para operacao assistida.",
      raw: {
        mode: "manual",
      },
    };
  }
}

export const manualFinancialGatewayConnector = new ManualFinancialGatewayConnector();

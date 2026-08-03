export type FinancialGatewayProvider =
  | "asaas"
  | "pjbank"
  | "iugu"
  | "mercado_pago"
  | "stripe"
  | "manual"
  | "other";

export type FinancialGatewayEnvironment = "sandbox" | "production";

export type FinancialGatewayPaymentMethod = "pix" | "boleto" | "card";

export type FinancialGatewayChargeStatus =
  | "pending"
  | "waiting_payment"
  | "processing"
  | "waiting_bank_settlement"
  | "paid"
  | "overdue"
  | "cancelled"
  | "refunded"
  | "failed"
  | "disputed";

export type FinancialGatewayTransferStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type FinancialGatewayRequestStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export type FinancialGatewayHeaders = Record<string, string | string[] | undefined>;

export type FinancialGatewayMetadata = Record<string, unknown>;

export type FinancialGatewayPayer = {
  name: string;
  email?: string | null;
  document?: string | null;
  phone?: string | null;
};

export type FinancialGatewayAddress = {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export type FinancialGatewayChargeInput = {
  companyId: string;
  connectionId: string;
  idempotencyKey: string;
  internalChargeId: string;
  contractId?: string | null;
  propertyId?: string | null;
  tenantId?: string | null;
  ownerId?: string | null;
  payer: FinancialGatewayPayer;
  payerAddress?: FinancialGatewayAddress | null;
  amountCents: number;
  dueDate: string;
  description: string;
  paymentMethods: FinancialGatewayPaymentMethod[];
  fineCents?: number;
  interestCents?: number;
  discountCents?: number;
  metadata?: FinancialGatewayMetadata;
};

export type FinancialGatewayChargeResult = {
  provider: FinancialGatewayProvider;
  externalChargeId: string;
  status: FinancialGatewayChargeStatus;
  amountCents: number;
  dueDate: string;
  paymentMethod?: FinancialGatewayPaymentMethod | null;
  boleto?: {
    barcode?: string | null;
    digitableLine?: string | null;
    pdfUrl?: string | null;
    paymentUrl?: string | null;
  } | null;
  pix?: {
    qrCode?: string | null;
    copyPasteCode?: string | null;
    expiresAt?: string | null;
  } | null;
  raw: FinancialGatewayMetadata;
};

export type FinancialGatewayCancelChargeInput = {
  companyId: string;
  connectionId: string;
  externalChargeId: string;
  reason?: string | null;
  metadata?: FinancialGatewayMetadata;
};

export type FinancialGatewayTransferInput = {
  companyId: string;
  connectionId: string;
  idempotencyKey: string;
  internalTransferId: string;
  ownerId: string;
  amountCents: number;
  description: string;
  bankAccount?: FinancialGatewayMetadata | null;
  metadata?: FinancialGatewayMetadata;
};

export type FinancialGatewayTransferResult = {
  provider: FinancialGatewayProvider;
  externalTransferId: string;
  status: FinancialGatewayTransferStatus;
  amountCents: number;
  scheduledFor?: string | null;
  completedAt?: string | null;
  raw: FinancialGatewayMetadata;
};

export type FinancialGatewayWebhookVerificationInput = {
  provider: FinancialGatewayProvider;
  headers: FinancialGatewayHeaders;
  rawBody: string;
  secret?: string | null;
};

export type NormalizedFinancialWebhookEvent = {
  provider: FinancialGatewayProvider;
  eventType: string;
  gatewayEventId: string;
  gatewayChargeId?: string | null;
  gatewayTransferId?: string | null;
  statusBefore?: FinancialGatewayChargeStatus | null;
  statusAfter?: FinancialGatewayChargeStatus | null;
  grossAmountCents?: number | null;
  netAmountCents?: number | null;
  feeAmountCents?: number | null;
  paymentMethod?: FinancialGatewayPaymentMethod | null;
  paidAt?: string | null;
  occurredAt?: string | null;
  raw: FinancialGatewayMetadata;
};

export type FinancialGatewayHealthcheckResult = {
  provider: FinancialGatewayProvider;
  environment: FinancialGatewayEnvironment;
  ok: boolean;
  checkedAt: string;
  message?: string | null;
  raw?: FinancialGatewayMetadata;
};

export type FinancialGatewayConnector = {
  provider: FinancialGatewayProvider;
  createCharge(input: FinancialGatewayChargeInput): Promise<FinancialGatewayChargeResult>;
  cancelCharge(input: FinancialGatewayCancelChargeInput): Promise<FinancialGatewayChargeResult>;
  getCharge(
    connectionId: string,
    externalChargeId: string,
  ): Promise<FinancialGatewayChargeResult>;
  createTransfer(input: FinancialGatewayTransferInput): Promise<FinancialGatewayTransferResult>;
  verifyWebhook(input: FinancialGatewayWebhookVerificationInput): Promise<boolean>;
  normalizeWebhookEvent(
    input: FinancialGatewayWebhookVerificationInput,
  ): Promise<NormalizedFinancialWebhookEvent>;
  healthcheck(
    connectionId: string,
    environment: FinancialGatewayEnvironment,
  ): Promise<FinancialGatewayHealthcheckResult>;
};

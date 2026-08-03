import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";
import { listContracts, type Contract } from "./contracts";
import { createNotificationEvent, type NotificationEvent } from "./notifications";

const previewEntriesKey = "imobiflow.preview.finance.entries";
const previewChargesKey = "imobiflow.preview.finance.charges";
const previewTransfersKey = "imobiflow.preview.finance.owner_transfers";
const previewOperationActionsKey = "imobiflow.preview.finance.operation_actions";

export type FinancialEntry = {
  id: string;
  company_id: string;
  contract_id: string | null;
  property_id: string | null;
  owner_id: string | null;
  lead_id: string | null;
  title: string;
  description: string | null;
  entry_type: "income" | "expense";
  category: string | null;
  status: "draft" | "open" | "paid" | "overdue" | "cancelled" | "archived";
  amount_cents: number;
  due_date: string | null;
  paid_at: string | null;
  competence_date: string | null;
  payment_method: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  contracts?: {
    id: string;
    title: string;
    contract_number: string | null;
  } | null;
  properties?: {
    id: string;
    code: string | null;
    title: string;
  } | null;
};

export type FinancialSummary = {
  received_cents: number;
  paid_expenses_cents: number;
  open_receivables_cents: number;
  open_payables_cents: number;
  overdue_cents: number;
};

export type FinancialWebhookEvent = {
  id: string;
  company_id: string | null;
  charge_id: string | null;
  provider: string;
  event_type: string;
  gateway_event_id: string | null;
  gateway_charge_id: string | null;
  status_before: string | null;
  status_after: string | null;
  gross_amount_cents: number | null;
  net_amount_cents: number | null;
  processed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FinancialAuditLog = {
  id: string;
  company_id: string;
  charge_id: string | null;
  entry_id: string | null;
  contract_id: string | null;
  owner_id: string | null;
  user_id: string | null;
  event_type: string;
  gateway_event_id: string | null;
  gateway_charge_id: string | null;
  gross_amount_cents: number | null;
  net_amount_cents: number | null;
  commission_amount_cents: number | null;
  fee_amount_cents: number | null;
  status_before: string | null;
  status_after: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FinancialOperationsSummary = {
  overdue_charges_count: number;
  overdue_charges_cents: number;
  waiting_compensation_count: number;
  waiting_compensation_cents: number;
  gateway_issues_count: number;
  gateway_issues_cents: number;
  pending_transfers_count: number;
  pending_transfers_cents: number;
  failed_webhooks_count: number;
  paid_without_transfer_count: number;
  open_operation_actions_count: number;
};

export type FinancialOperationAction = {
  id: string;
  company_id: string;
  charge_id: string | null;
  webhook_event_id: string | null;
  owner_transfer_id: string | null;
  action_type:
    | "gateway_issue_review"
    | "webhook_review"
    | "webhook_reprocess_requested"
    | "missing_transfer_created"
    | "collection_task";
  title: string;
  description: string | null;
  status: "open" | "done" | "cancelled";
  due_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FinancialOperationsResponse = {
  summary: FinancialOperationsSummary;
  overdue_charges: FinancialCharge[];
  waiting_compensation_charges: FinancialCharge[];
  gateway_issues: FinancialCharge[];
  pending_transfers: OwnerTransfer[];
  paid_without_transfer: FinancialCharge[];
  recent_webhooks: FinancialWebhookEvent[];
  recent_audit_logs: FinancialAuditLog[];
  operation_actions: FinancialOperationAction[];
};

export type FinancialCharge = {
  id: string;
  company_id: string;
  contract_id: string;
  property_id: string | null;
  owner_id: string | null;
  tenant_party_id: string | null;
  entry_id: string | null;
  gateway_account_id: string | null;
  gateway_charge_id: string | null;
  payment_method: "pix" | "boleto" | "hybrid" | "credit_card" | "bank_transfer" | "manual";
  gross_amount_cents: number;
  base_rent_amount_cents: number;
  fee_amount_cents: number;
  fee_payer: "company" | "tenant" | "owner";
  fee_acceptance_required?: boolean;
  fee_acceptance_confirmed?: boolean;
  fee_acceptance_json?: Record<string, unknown>;
  commission_amount_cents: number;
  net_owner_amount_cents: number;
  due_date: string;
  paid_at: string | null;
  status:
    | "pending"
    | "waiting_payment"
    | "processing"
    | "waiting_compensation"
    | "paid"
    | "overdue"
    | "cancelled"
    | "refunded"
    | "failed"
    | "disputed"
    | "transfer_pending"
    | "transferred";
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  boleto_barcode: string | null;
  boleto_digitable_line: string | null;
  payment_url: string | null;
  boleto_pdf_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  contracts?: {
    id: string;
    title: string;
    contract_number: string | null;
  } | null;
  properties?: {
    id: string;
    code: string | null;
    title: string;
  } | null;
};

export type OwnerTransfer = {
  id: string;
  company_id: string;
  charge_id: string | null;
  contract_id: string | null;
  owner_id: string | null;
  property_id: string | null;
  gross_amount_cents: number;
  deductions_cents: number;
  net_amount_cents: number;
  status: "pending" | "approved" | "paid" | "cancelled";
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  receipt_url: string | null;
  receipt_reference: string | null;
  gateway_transfer_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  contracts?: {
    id: string;
    title: string;
    contract_number: string | null;
  } | null;
  properties?: {
    id: string;
    code: string | null;
    title: string;
  } | null;
  property_owners?: {
    id: string;
    name: string;
  } | null;
};

export type FinancialEntryInput = {
  contract_id?: string;
  property_id?: string;
  title: string;
  description?: string;
  entry_type: FinancialEntry["entry_type"];
  category?: string;
  status?: FinancialEntry["status"];
  amount_cents: number;
  due_date?: string;
  competence_date?: string;
  payment_method?: string;
  notes?: string;
};

export type RentalChargeInput = {
  contract_id: string;
  due_date: string;
  payment_method: "pix" | "boleto" | "hybrid" | "manual";
  base_amount_cents?: number;
  fee_amount_cents?: number;
  fee_payer?: "company" | "tenant" | "owner";
  fee_acceptance_confirmed?: boolean;
  fee_acceptance_reference?: string;
  commission_type?: "percentage" | "fixed";
  commission_rate?: number;
  commission_fixed_cents?: number;
  notes?: string;
};

export type ChargeNotificationInput = {
  notification_type:
    | "charge_created"
    | "charge_due_reminder"
    | "charge_overdue_notice"
    | "charge_payment_confirmed";
  channel: "email" | "whatsapp";
};

export type OwnerTransferNotificationInput = {
  notification_type:
    | "owner_transfer_calculated"
    | "owner_transfer_pending"
    | "owner_transfer_paid";
  channel: "email" | "whatsapp";
};

export function isPreviewFinance() {
  return isPreviewToken(getStoredToken());
}

export async function listFinancialEntries() {
  if (isPreviewFinance()) return { entries: await readPreviewEntriesWithContracts() };

  return apiRequest<{ entries: FinancialEntry[] }>("/finance/entries?status=all", {
    token: getStoredToken() ?? undefined,
  });
}

export async function listFinancialCharges() {
  if (isPreviewFinance()) return { charges: await readPreviewChargesWithContracts() };

  return apiRequest<{ charges: FinancialCharge[] }>("/finance/charges?status=all", {
    token: getStoredToken() ?? undefined,
  });
}

export async function listOwnerTransfers() {
  if (isPreviewFinance()) return { transfers: await readPreviewTransfersWithContracts() };

  return apiRequest<{ transfers: OwnerTransfer[] }>("/finance/owner-transfers?status=all", {
    token: getStoredToken() ?? undefined,
  });
}

export async function getFinancialSummary() {
  if (isPreviewFinance()) return { summary: buildPreviewSummary(readPreviewEntries()) };

  return apiRequest<{ summary: FinancialSummary }>("/finance/summary", {
    token: getStoredToken() ?? undefined,
  });
}

export async function getFinancialOperationsSummary() {
  if (isPreviewFinance()) return createPreviewFinancialOperationsSummary();

  return apiRequest<FinancialOperationsResponse>("/finance/operations-summary", {
    token: getStoredToken() ?? undefined,
  });
}

export async function generateRentalCharge(input: RentalChargeInput) {
  if (isPreviewFinance()) {
    const response = await generatePreviewRentalCharge(input);
    return response;
  }

  return apiRequest<{ charge: FinancialCharge; entry: FinancialEntry }>("/finance/charges/from-contract", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function confirmFinancialChargePayment(
  chargeId: string,
  input: { payment_method?: string; paid_at?: string; notes?: string },
) {
  if (isPreviewFinance()) return { charge: payPreviewCharge(chargeId, input) };

  return apiRequest<{ charge: FinancialCharge }>(`/finance/charges/${chargeId}/confirm-payment`, {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function confirmOwnerTransferPayment(
  transferId: string,
  input: {
    payment_method?: string;
    paid_at?: string;
    receipt_url?: string;
    receipt_reference?: string;
    notes?: string;
  },
) {
  if (isPreviewFinance()) return { transfer: payPreviewTransfer(transferId, input) };

  return apiRequest<{ transfer: OwnerTransfer }>(
    `/finance/owner-transfers/${transferId}/confirm-payment`,
    {
      method: "POST",
      body: JSON.stringify(input),
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function issueFinancialChargePayment(chargeId: string) {
  if (isPreviewFinance()) return { charge: issuePreviewCharge(chargeId) };

  return apiRequest<{
    charge: FinancialCharge;
    gateway_issue: {
      provider: string;
      status: "prepared" | "blocked" | "issued" | "failed";
      connector_status: string;
      real_api_call: boolean;
      next_step?: string;
      payment_url?: string | null;
      boleto_pdf_url?: string | null;
    };
  }>(
    `/finance/charges/${chargeId}/issue-payment`,
    {
      method: "POST",
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function syncFinancialChargeGatewayCustomer(chargeId: string) {
  if (isPreviewFinance()) return { charge: syncPreviewChargeGatewayCustomer(chargeId) };

  return apiRequest<{
    charge: FinancialCharge;
    gateway_customer: {
      provider: string;
      status: "prepared" | "blocked" | "synced" | "failed";
      connector_status: string;
      real_api_call: boolean;
      gateway_customer_id?: string | null;
      next_step?: string;
    };
  }>(`/finance/charges/${chargeId}/sync-gateway-customer`, {
    method: "POST",
    token: getStoredToken() ?? undefined,
  });
}

export async function reviewFinancialGatewayIssue(chargeId: string, reason?: string) {
  if (isPreviewFinance()) return { charge: reviewPreviewGatewayIssue(chargeId, reason), action: null };

  return apiRequest<{ charge: FinancialCharge; action: FinancialOperationAction }>(
    `/finance/charges/${chargeId}/review-gateway-issue`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function createMissingOwnerTransfer(chargeId: string, reason?: string) {
  if (isPreviewFinance()) return createPreviewMissingOwnerTransfer(chargeId, reason);

  return apiRequest<{
    charge: FinancialCharge;
    transfer: OwnerTransfer;
    action: FinancialOperationAction;
  }>(`/finance/charges/${chargeId}/create-owner-transfer`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    token: getStoredToken() ?? undefined,
  });
}

export async function createFinancialCollectionTask(
  chargeId: string,
  input: { reason?: string; due_at?: string } = {},
) {
  if (isPreviewFinance()) return { action: createPreviewFinancialOperationAction(chargeId, input) };

  return apiRequest<{ action: FinancialOperationAction }>(
    `/finance/charges/${chargeId}/create-collection-task`,
    {
      method: "POST",
      body: JSON.stringify(input),
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function resolveFinancialWebhook(webhookId: string, reason?: string) {
  if (isPreviewFinance()) return { webhook: null, action: null };

  return apiRequest<{
    webhook: FinancialWebhookEvent;
    action: FinancialOperationAction;
  }>(`/finance/webhooks/${webhookId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    token: getStoredToken() ?? undefined,
  });
}

export async function requestFinancialWebhookReprocess(webhookId: string, reason?: string) {
  if (isPreviewFinance()) return { webhook: null, action: null };

  return apiRequest<{
    webhook: FinancialWebhookEvent;
    action: FinancialOperationAction;
  }>(`/finance/webhooks/${webhookId}/request-reprocess`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    token: getStoredToken() ?? undefined,
  });
}

export async function executeFinancialWebhookReprocess(webhookId: string, reason?: string) {
  if (isPreviewFinance()) return { webhook: null, result: { processed: true } };

  return apiRequest<{
    webhook: FinancialWebhookEvent;
    result: {
      processed: boolean;
      charge_id: string;
      previous_status: FinancialCharge["status"];
      status: FinancialCharge["status"];
      gateway_status: FinancialCharge["status"];
      charge_updated: boolean;
    };
  }>(`/finance/webhooks/${webhookId}/reprocess`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    token: getStoredToken() ?? undefined,
  });
}

export async function resolveFinancialOperationAction(actionId: string, reason?: string) {
  if (isPreviewFinance()) return { action: updatePreviewFinancialOperationAction(actionId, "done", reason) };

  return apiRequest<{ action: FinancialOperationAction }>(
    `/finance/operation-actions/${actionId}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function cancelFinancialOperationAction(actionId: string, reason?: string) {
  if (isPreviewFinance()) {
    return { action: updatePreviewFinancialOperationAction(actionId, "cancelled", reason) };
  }

  return apiRequest<{ action: FinancialOperationAction }>(
    `/finance/operation-actions/${actionId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function prepareChargeNotification(
  charge: FinancialCharge,
  input: ChargeNotificationInput,
) {
  if (isPreviewFinance()) {
    const tenant = readChargeTenant(charge);
    const event = await createNotificationEvent({
      template_key: input.notification_type,
      channel: input.channel,
      recipient_type: "tenant",
      recipient_id: charge.tenant_party_id,
      recipient_name: tenant.name,
      recipient_contact: input.channel === "email" ? tenant.email : tenant.phone,
      subject: input.channel === "email" ? buildPreviewChargeSubject(input.notification_type) : null,
      body: buildPreviewChargeMessage(charge, input.notification_type, tenant.name),
      provider: "manual",
      status: "prepared",
      related_entity_type: "financial_charge",
      related_entity_id: charge.id,
      metadata: {
        notification_type: input.notification_type,
        charge_status: charge.status,
      },
    });

    return event as { event: NotificationEvent };
  }

  return apiRequest<{ event: NotificationEvent }>(
    `/finance/charges/${charge.id}/prepare-notification`,
    {
      method: "POST",
      body: JSON.stringify(input),
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function prepareOwnerTransferNotification(
  transfer: OwnerTransfer,
  input: OwnerTransferNotificationInput,
) {
  if (isPreviewFinance()) {
    const ownerName = transfer.property_owners?.name ?? "Proprietario";
    const event = await createNotificationEvent({
      template_key: input.notification_type,
      channel: input.channel,
      recipient_type: "owner",
      recipient_id: transfer.owner_id,
      recipient_name: ownerName,
      recipient_contact: input.channel === "email" ? "proprietario@preview.com" : "5599999999999",
      subject: input.channel === "email" ? buildPreviewOwnerTransferSubject(input.notification_type) : null,
      body: buildPreviewOwnerTransferMessage(transfer, input.notification_type, ownerName),
      provider: "manual",
      status: "prepared",
      related_entity_type: "owner_transfer",
      related_entity_id: transfer.id,
      metadata: {
        notification_type: input.notification_type,
        transfer_status: transfer.status,
      },
    });

    return event as { event: NotificationEvent };
  }

  return apiRequest<{ event: NotificationEvent }>(
    `/finance/owner-transfers/${transfer.id}/prepare-notification`,
    {
      method: "POST",
      body: JSON.stringify(input),
      token: getStoredToken() ?? undefined,
    },
  );
}

function readChargeTenant(charge: FinancialCharge) {
  const metadataTenant =
    typeof charge.metadata.tenant === "object" && charge.metadata.tenant !== null
      ? (charge.metadata.tenant as { name?: string; email?: string; phone?: string })
      : {};

  return {
    name: metadataTenant.name || "Inquilino",
    email: metadataTenant.email || "inquilino@exemplo.local",
    phone: metadataTenant.phone || "5599999999999",
  };
}

function buildPreviewChargeSubject(type: ChargeNotificationInput["notification_type"]) {
  if (type === "charge_overdue_notice") return "Cobrança vencida - ImobiFlow";
  if (type === "charge_payment_confirmed") return "Pagamento confirmado - ImobiFlow";
  if (type === "charge_created") return "Cobrança gerada - ImobiFlow";
  return "Lembrete de vencimento - ImobiFlow";
}

function buildPreviewChargeMessage(
  charge: FinancialCharge,
  type: ChargeNotificationInput["notification_type"],
  recipientName: string,
) {
  const amount = formatMoneyForMessage(charge.gross_amount_cents);
  const dueDate = formatDateForMessage(charge.due_date);
  const link = "/portal/inquilino/preview";

  if (type === "charge_overdue_notice") {
    return `Olá, ${recipientName}. Identificamos uma cobrança vencida de ${amount}, com vencimento em ${dueDate}. Regularize pelo link: ${link}`;
  }

  if (type === "charge_payment_confirmed") {
    return `Olá, ${recipientName}. Recebemos o pagamento de ${amount}. Obrigado. Seu histórico fica disponível em: ${link}`;
  }

  if (type === "charge_created") {
    return `Olá, ${recipientName}. Sua cobrança de ${amount} foi gerada com vencimento em ${dueDate}. Acesse: ${link}`;
  }

  return `Olá, ${recipientName}. Lembrete: sua cobrança de ${amount} vence em ${dueDate}. Acesse: ${link}`;
}

function buildPreviewOwnerTransferSubject(type: OwnerTransferNotificationInput["notification_type"]) {
  if (type === "owner_transfer_paid") return "Repasse realizado - ImobiFlow";
  if (type === "owner_transfer_calculated") return "Repasse calculado - ImobiFlow";
  return "Repasse pendente - ImobiFlow";
}

function buildPreviewOwnerTransferMessage(
  transfer: OwnerTransfer,
  type: OwnerTransferNotificationInput["notification_type"],
  recipientName: string,
) {
  const amount = formatMoneyForMessage(transfer.net_amount_cents);
  const dueDate = transfer.due_date ? formatDateForMessage(transfer.due_date) : "data nao informada";
  const paidAt = transfer.paid_at ? formatDateForMessage(transfer.paid_at) : "data nao informada";
  const receipt = transfer.receipt_url || transfer.receipt_reference || "Nao informado";
  const propertyTitle = transfer.properties?.title ?? transfer.contracts?.title ?? "imovel vinculado";
  const portalLink = "/portal/proprietario/preview";

  if (type === "owner_transfer_paid") {
    return `Ola, ${recipientName}. O repasse de ${amount} referente a ${propertyTitle} foi realizado em ${paidAt}. Comprovante: ${receipt}. Portal: ${portalLink}`;
  }

  if (type === "owner_transfer_calculated") {
    return `Ola, ${recipientName}. O repasse de ${amount} referente a ${propertyTitle} foi calculado com previsao para ${dueDate}. Acompanhe pelo portal: ${portalLink}`;
  }

  return `Ola, ${recipientName}. Seu repasse de ${amount} referente a ${propertyTitle} esta pendente e previsto para ${dueDate}. Portal: ${portalLink}`;
}

function formatMoneyForMessage(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function formatDateForMessage(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

export async function createFinancialEntry(input: FinancialEntryInput) {
  if (isPreviewFinance()) {
    const entry = await createPreviewEntry(input);
    return { entry };
  }

  return apiRequest<{ entry: FinancialEntry }>("/finance/entries", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function createFinancialPayment(
  entryId: string,
  input: { amount_cents?: number; payment_method?: string; paid_at?: string; notes?: string },
) {
  if (isPreviewFinance()) {
    const entry = payPreviewEntry(entryId, input);
    return { entry, payment: null };
  }

  return apiRequest<{ entry: FinancialEntry; payment: unknown }>(`/finance/entries/${entryId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

function readPreviewEntries() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewEntriesKey) ?? "[]") as FinancialEntry[];
  } catch {
    return [];
  }
}

function writePreviewEntries(entries: FinancialEntry[]) {
  window.localStorage.setItem(previewEntriesKey, JSON.stringify(entries));
}

function readPreviewCharges() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewChargesKey) ?? "[]") as FinancialCharge[];
  } catch {
    return [];
  }
}

function writePreviewCharges(charges: FinancialCharge[]) {
  window.localStorage.setItem(previewChargesKey, JSON.stringify(charges));
}

function readPreviewTransfers() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewTransfersKey) ?? "[]") as OwnerTransfer[];
  } catch {
    return [];
  }
}

function writePreviewTransfers(transfers: OwnerTransfer[]) {
  window.localStorage.setItem(previewTransfersKey, JSON.stringify(transfers));
}

function readPreviewOperationActions() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(
      window.localStorage.getItem(previewOperationActionsKey) ?? "[]",
    ) as FinancialOperationAction[];
  } catch {
    return [];
  }
}

function writePreviewOperationActions(actions: FinancialOperationAction[]) {
  window.localStorage.setItem(previewOperationActionsKey, JSON.stringify(actions));
}

function createPreviewFinancialOperationsSummary(): FinancialOperationsResponse {
  const today = new Date().toISOString().slice(0, 10);
  const charges = readPreviewCharges();
  const transfers = readPreviewTransfers();
  const actions = readPreviewOperationActions();
  const openChargeStatuses = [
    "pending",
    "waiting_payment",
    "processing",
    "waiting_compensation",
    "overdue",
    "failed",
    "disputed",
  ];
  const overdueCharges = charges.filter(
    (charge) =>
      openChargeStatuses.includes(charge.status) &&
      charge.due_date < today &&
      !["paid", "cancelled", "refunded", "transferred"].includes(charge.status),
  );
  const waitingCompensationCharges = charges.filter((charge) =>
    ["processing", "waiting_compensation"].includes(charge.status),
  );
  const gatewayIssues = charges.filter(
    (charge) =>
      ["failed", "disputed"].includes(charge.status) ||
      (charge.payment_method !== "manual" &&
        !charge.gateway_charge_id &&
        ["pending", "waiting_payment", "processing"].includes(charge.status)),
  );
  const pendingTransfers = transfers.filter((transfer) =>
    ["pending", "approved"].includes(transfer.status),
  );
  const paidWithoutTransfer = charges.filter(
    (charge) =>
      charge.owner_id &&
      ["paid", "transfer_pending"].includes(charge.status) &&
      !transfers.some((transfer) => transfer.charge_id === charge.id),
  );

  return {
    summary: {
      overdue_charges_count: overdueCharges.length,
      overdue_charges_cents: sumPreviewCents(overdueCharges, "gross_amount_cents"),
      waiting_compensation_count: waitingCompensationCharges.length,
      waiting_compensation_cents: sumPreviewCents(waitingCompensationCharges, "gross_amount_cents"),
      gateway_issues_count: gatewayIssues.length,
      gateway_issues_cents: sumPreviewCents(gatewayIssues, "gross_amount_cents"),
      pending_transfers_count: pendingTransfers.length,
      pending_transfers_cents: sumPreviewCents(pendingTransfers, "net_amount_cents"),
      failed_webhooks_count: 0,
      paid_without_transfer_count: paidWithoutTransfer.length,
      open_operation_actions_count: actions.filter((action) => action.status === "open").length,
    },
    overdue_charges: overdueCharges,
    waiting_compensation_charges: waitingCompensationCharges,
    gateway_issues: gatewayIssues,
    pending_transfers: pendingTransfers,
    paid_without_transfer: paidWithoutTransfer,
    recent_webhooks: [],
    recent_audit_logs: [],
    operation_actions: actions,
  };
}

function sumPreviewCents<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce((sum, row) => {
    const value = row[key];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

async function readPreviewEntriesWithContracts() {
  const { contracts } = await listContracts();

  return readPreviewEntries().map((entry) => ({
    ...entry,
    contracts: buildContractSummary(contracts.find((contract) => contract.id === entry.contract_id)),
  }));
}

async function readPreviewChargesWithContracts() {
  const { contracts } = await listContracts();

  return readPreviewCharges().map((charge) => ({
    ...charge,
    contracts: buildContractSummary(contracts.find((contract) => contract.id === charge.contract_id)),
  }));
}

async function readPreviewTransfersWithContracts() {
  const { contracts } = await listContracts();

  return readPreviewTransfers().map((transfer) => ({
    ...transfer,
    contracts: buildContractSummary(contracts.find((contract) => contract.id === transfer.contract_id)),
  }));
}

async function createPreviewEntry(input: FinancialEntryInput): Promise<FinancialEntry> {
  const now = new Date().toISOString();
  const { contracts } = await listContracts();
  const contract = contracts.find((item) => item.id === input.contract_id);
  const entry: FinancialEntry = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    contract_id: input.contract_id || null,
    property_id: input.property_id || null,
    owner_id: null,
    lead_id: null,
    title: input.title,
    description: input.description || null,
    entry_type: input.entry_type,
    category: input.category || null,
    status: input.status ?? "open",
    amount_cents: input.amount_cents,
    due_date: input.due_date || null,
    paid_at: null,
    competence_date: input.competence_date || null,
    payment_method: input.payment_method || null,
    notes: input.notes || null,
    metadata: {},
    created_at: now,
    updated_at: now,
    contracts: buildContractSummary(contract),
  };

  writePreviewEntries([entry, ...readPreviewEntries()]);
  return entry;
}

async function generatePreviewRentalCharge(input: RentalChargeInput) {
  const now = new Date().toISOString();
  const { contracts } = await listContracts();
  const contract = contracts.find((item) => item.id === input.contract_id);

  if (!contract) throw new Error("Contrato não encontrado.");
  if (contract.contract_type !== "rental") throw new Error("Selecione um contrato de locação.");

  const baseRentAmountCents = input.base_amount_cents ?? contract.monthly_amount_cents ?? contract.total_amount_cents ?? 0;
  if (baseRentAmountCents <= 0) throw new Error("Informe o valor do aluguel.");

  const feeAmountCents = input.fee_amount_cents ?? 0;
  const feePayer = input.fee_payer ?? "company";
  const feeAcceptanceRequired = feeAmountCents > 0 && feePayer !== "company";

  if (feeAcceptanceRequired && !input.fee_acceptance_confirmed) {
    throw new Error("Taxa atribuída ao inquilino ou proprietário exige aceite contratual registrado.");
  }

  const commissionAmountCents =
    input.commission_type === "fixed"
      ? input.commission_fixed_cents ?? 0
      : Math.round(baseRentAmountCents * ((input.commission_rate ?? 10) / 100));
  const grossAmountCents = feePayer === "tenant" ? baseRentAmountCents + feeAmountCents : baseRentAmountCents;
  const ownerFeeDeduction = feePayer === "owner" ? feeAmountCents : 0;
  const netOwnerAmountCents = Math.max(0, baseRentAmountCents - commissionAmountCents - ownerFeeDeduction);

  const entry: FinancialEntry = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    contract_id: contract.id,
    property_id: contract.property_id,
    owner_id: null,
    lead_id: null,
    title: `Cobrança de aluguel - ${contract.title}`,
    description: input.notes || "Cobrança gerada a partir do contrato de locação.",
    entry_type: "income",
    category: "Aluguel",
    status: "open",
    amount_cents: grossAmountCents,
    due_date: input.due_date,
    paid_at: null,
    competence_date: `${input.due_date.slice(0, 7)}-01`,
    payment_method: input.payment_method,
    notes: input.notes || null,
    metadata: {
      source: "rental_charge",
      base_rent_amount_cents: baseRentAmountCents,
      fee_amount_cents: feeAmountCents,
      fee_payer: feePayer,
      fee_acceptance_required: feeAcceptanceRequired,
      fee_acceptance_confirmed: !feeAcceptanceRequired || Boolean(input.fee_acceptance_confirmed),
      commission_amount_cents: commissionAmountCents,
      net_owner_amount_cents: netOwnerAmountCents,
    },
    created_at: now,
    updated_at: now,
    contracts: buildContractSummary(contract),
  };

  const charge: FinancialCharge = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    contract_id: contract.id,
    property_id: contract.property_id,
    owner_id: null,
    tenant_party_id: null,
    entry_id: entry.id,
    gateway_account_id: null,
    gateway_charge_id: null,
    payment_method: input.payment_method,
    gross_amount_cents: grossAmountCents,
    base_rent_amount_cents: baseRentAmountCents,
    fee_amount_cents: feeAmountCents,
    fee_payer: feePayer,
    fee_acceptance_required: feeAcceptanceRequired,
    fee_acceptance_confirmed: !feeAcceptanceRequired || Boolean(input.fee_acceptance_confirmed),
    fee_acceptance_json: {
      accepted: !feeAcceptanceRequired || Boolean(input.fee_acceptance_confirmed),
      reference_document: input.fee_acceptance_reference || null,
      source: "preview",
    },
    commission_amount_cents: commissionAmountCents,
    net_owner_amount_cents: netOwnerAmountCents,
    due_date: input.due_date,
    paid_at: null,
    status: input.payment_method === "manual" ? "pending" : "waiting_payment",
    pix_qr_code: null,
    pix_copy_paste: null,
    boleto_barcode: null,
    boleto_digitable_line: null,
    payment_url: null,
    boleto_pdf_url: null,
    metadata: { provider_status: "preview_not_sent_to_gateway" },
    created_at: now,
    updated_at: now,
    contracts: buildContractSummary(contract),
  };

  const transfer: OwnerTransfer = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    charge_id: charge.id,
    contract_id: contract.id,
    property_id: contract.property_id,
    owner_id: null,
    gross_amount_cents: baseRentAmountCents,
    deductions_cents: commissionAmountCents + ownerFeeDeduction,
    net_amount_cents: netOwnerAmountCents,
    status: "pending",
    due_date: input.due_date,
    paid_at: null,
    payment_method: null,
    receipt_url: null,
    receipt_reference: null,
    gateway_transfer_id: null,
    notes: `Repasse calculado a partir da cobranÃ§a ${charge.id}`,
    metadata: { source: "preview_charge" },
    created_at: now,
    updated_at: now,
    contracts: buildContractSummary(contract),
    properties: null,
    property_owners: null,
  };

  writePreviewEntries([entry, ...readPreviewEntries()]);
  writePreviewCharges([charge, ...readPreviewCharges()]);
  writePreviewTransfers([transfer, ...readPreviewTransfers()]);

  return { charge, entry };
}

function payPreviewEntry(
  entryId: string,
  input: { amount_cents?: number; payment_method?: string; paid_at?: string; notes?: string },
) {
  const entries = readPreviewEntries();
  const paidAt = input.paid_at || new Date().toISOString();
  const updated = entries.map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          status: "paid" as const,
          paid_at: paidAt,
          payment_method: input.payment_method || entry.payment_method,
          updated_at: paidAt,
        }
      : entry,
  );
  writePreviewEntries(updated);

  const entry = updated.find((item) => item.id === entryId);
  if (!entry) throw new Error("Lançamento financeiro não encontrado.");

  return entry;
}

function payPreviewCharge(
  chargeId: string,
  input: { payment_method?: string; paid_at?: string; notes?: string },
) {
  const charges = readPreviewCharges();
  const paidAt = input.paid_at || new Date().toISOString();
  const updatedCharges = charges.map((charge) =>
    charge.id === chargeId
      ? {
          ...charge,
          status: "paid" as const,
          paid_at: paidAt,
          updated_at: paidAt,
        }
      : charge,
  );
  const charge = updatedCharges.find((item) => item.id === chargeId);
  if (!charge) throw new Error("Cobrança não encontrada.");

  writePreviewCharges(updatedCharges);

  if (charge.entry_id) {
    payPreviewEntry(charge.entry_id, {
      payment_method: input.payment_method || charge.payment_method,
      paid_at: paidAt,
      notes: input.notes,
    });
  }

  return charge;
}

function payPreviewTransfer(
  transferId: string,
  input: {
    payment_method?: string;
    paid_at?: string;
    receipt_url?: string;
    receipt_reference?: string;
    notes?: string;
  },
) {
  const transfers = readPreviewTransfers();
  const paidAt = input.paid_at || new Date().toISOString();
  const updatedTransfers = transfers.map((transfer) =>
    transfer.id === transferId
      ? {
          ...transfer,
          status: "paid" as const,
          paid_at: paidAt,
          payment_method: input.payment_method || "manual_transfer",
          receipt_url: input.receipt_url || null,
          receipt_reference: input.receipt_reference || null,
          notes: input.notes || transfer.notes,
          updated_at: paidAt,
        }
      : transfer,
  );
  const transfer = updatedTransfers.find((item) => item.id === transferId);
  if (!transfer) throw new Error("Repasse nÃ£o encontrado.");

  writePreviewTransfers(updatedTransfers);

  if (transfer.charge_id) {
    const charges = readPreviewCharges();
    writePreviewCharges(
      charges.map((charge) =>
        charge.id === transfer.charge_id
          ? { ...charge, status: "transferred", updated_at: paidAt }
          : charge,
      ),
    );
  }

  return transfer;
}

function buildPreviewSummary(entries: FinancialEntry[]): FinancialSummary {
  const today = new Date().toISOString().slice(0, 10);

  return entries.reduce(
    (summary, entry) => {
      if (entry.status === "paid") {
        if (entry.entry_type === "income") summary.received_cents += entry.amount_cents;
        if (entry.entry_type === "expense") summary.paid_expenses_cents += entry.amount_cents;
      } else if (entry.status !== "cancelled") {
        if (entry.entry_type === "income") summary.open_receivables_cents += entry.amount_cents;
        if (entry.entry_type === "expense") summary.open_payables_cents += entry.amount_cents;
      }

      if (entry.status !== "paid" && entry.status !== "cancelled" && entry.due_date && entry.due_date < today) {
        summary.overdue_cents += entry.amount_cents;
      }

      return summary;
    },
    {
      received_cents: 0,
      paid_expenses_cents: 0,
      open_receivables_cents: 0,
      open_payables_cents: 0,
      overdue_cents: 0,
    },
  );
}

function issuePreviewCharge(chargeId: string) {
  const charges = readPreviewCharges();
  const charge = charges.find((item) => item.id === chargeId);
  if (!charge) throw new Error("Cobrança não encontrada.");
  if (charge.payment_method === "manual") throw new Error("Cobrança manual não deve ser enviada ao gateway.");

  const updated: FinancialCharge = {
    ...charge,
    status: "processing",
    metadata: {
      ...charge.metadata,
      gateway_issue: {
        provider: "preview",
        status: "prepared",
        real_api_call: false,
        prepared_at: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
  };

  writePreviewCharges(charges.map((item) => (item.id === chargeId ? updated : item)));
  return updated;
}

function syncPreviewChargeGatewayCustomer(chargeId: string) {
  const charges = readPreviewCharges();
  const charge = charges.find((item) => item.id === chargeId);
  if (!charge) throw new Error("Cobrança não encontrada.");
  if (charge.payment_method === "manual") throw new Error("Cobrança manual não precisa sincronizar gateway.");

  const now = new Date().toISOString();
  const updated: FinancialCharge = {
    ...charge,
    metadata: {
      ...charge.metadata,
      gateway_customer_sync: {
        provider: "preview",
        status: "prepared",
        real_api_call: false,
        synced_at: now,
      },
    },
    updated_at: now,
  };

  writePreviewCharges(charges.map((item) => (item.id === chargeId ? updated : item)));
  return updated;
}

function reviewPreviewGatewayIssue(chargeId: string, reason?: string) {
  const charges = readPreviewCharges();
  const charge = charges.find((item) => item.id === chargeId);
  if (!charge) throw new Error("Cobrança não encontrada.");

  const now = new Date().toISOString();
  const updated: FinancialCharge = {
    ...charge,
    metadata: {
      ...charge.metadata,
      gateway_issue_review: {
        status: "resolved",
        resolved_at: now,
        reason: reason || "Inconsistência revisada no modo preview.",
      },
    },
    updated_at: now,
  };

  writePreviewCharges(charges.map((item) => (item.id === chargeId ? updated : item)));
  createPreviewFinancialOperationAction(chargeId, {
    reason: reason || "Inconsistência revisada no modo preview.",
    action_type: "gateway_issue_review",
    status: "done",
    title: "Inconsistência de gateway revisada",
  });
  return updated;
}

function createPreviewMissingOwnerTransfer(chargeId: string, reason?: string) {
  const charges = readPreviewCharges();
  const transfers = readPreviewTransfers();
  const charge = charges.find((item) => item.id === chargeId);
  if (!charge) throw new Error("Cobrança não encontrada.");
  if (transfers.some((transfer) => transfer.charge_id === chargeId)) {
    throw new Error("Já existe repasse vinculado a esta cobrança.");
  }

  const now = new Date().toISOString();
  const transfer: OwnerTransfer = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    charge_id: charge.id,
    contract_id: charge.contract_id,
    owner_id: charge.owner_id,
    property_id: charge.property_id,
    gross_amount_cents: charge.gross_amount_cents,
    deductions_cents: charge.commission_amount_cents + charge.fee_amount_cents,
    net_amount_cents: charge.net_owner_amount_cents,
    status: charge.status === "paid" || charge.status === "transfer_pending" ? "approved" : "pending",
    due_date: now.slice(0, 10),
    paid_at: null,
    payment_method: null,
    receipt_url: null,
    receipt_reference: null,
    gateway_transfer_id: null,
    notes: reason || "Repasse criado pela central financeira preview.",
    metadata: { source: "preview_financial_operation" },
    created_at: now,
    updated_at: now,
    contracts: charge.contracts ?? null,
    properties: charge.properties ?? null,
    property_owners: null,
  };
  const updatedCharge: FinancialCharge = {
    ...charge,
    status: charge.status === "paid" ? "transfer_pending" : charge.status,
    updated_at: now,
  };
  const action = createPreviewFinancialOperationAction(chargeId, {
    reason: reason || "Repasse criado pela central financeira preview.",
    action_type: "missing_transfer_created",
    status: "done",
    title: "Repasse ausente gerado",
  });

  writePreviewTransfers([transfer, ...transfers]);
  writePreviewCharges(charges.map((item) => (item.id === chargeId ? updatedCharge : item)));

  return { charge: updatedCharge, transfer, action };
}

function createPreviewFinancialOperationAction(
  chargeId: string,
  input: {
    reason?: string;
    due_at?: string;
    action_type?: FinancialOperationAction["action_type"];
    status?: FinancialOperationAction["status"];
    title?: string;
  } = {},
) {
  const now = new Date().toISOString();
  const action: FinancialOperationAction = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    charge_id: chargeId,
    webhook_event_id: null,
    owner_transfer_id: null,
    action_type: input.action_type ?? "collection_task",
    title: input.title ?? "Tarefa de cobrança",
    description:
      input.reason ||
      "Entrar em contato com o inquilino, registrar retorno e orientar regularização.",
    status: input.status ?? "open",
    due_at: input.due_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    resolved_at: input.status === "done" ? now : null,
    resolved_by: null,
    created_by: "preview-user",
    metadata: { source: "preview" },
    created_at: now,
    updated_at: now,
  };

  writePreviewOperationActions([action, ...readPreviewOperationActions()]);
  return action;
}

function updatePreviewFinancialOperationAction(
  actionId: string,
  status: "done" | "cancelled",
  reason?: string,
) {
  const actions = readPreviewOperationActions();
  const now = new Date().toISOString();
  const updatedActions = actions.map((action) =>
    action.id === actionId
      ? {
          ...action,
          status,
          description: reason || action.description,
          resolved_at: now,
          resolved_by: "preview-user",
          metadata: {
            ...action.metadata,
            resolution: {
              status,
              reason: reason || null,
              resolved_at: now,
              resolved_by: "preview-user",
            },
          },
          updated_at: now,
        }
      : action,
  );
  const action = updatedActions.find((item) => item.id === actionId);
  if (!action) throw new Error("Ação financeira operacional não encontrada.");

  writePreviewOperationActions(updatedActions);
  return action;
}

function buildContractSummary(contract?: Contract) {
  if (!contract) return null;

  return {
    id: contract.id,
    title: contract.title,
    contract_number: contract.contract_number,
  };
}

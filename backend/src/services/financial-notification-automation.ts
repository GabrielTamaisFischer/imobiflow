import { env } from "../config/env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { dispatchEventSelect } from "./notification-dispatcher.js";

type NotificationChannel = "email" | "whatsapp" | "sms" | "system";

type NotificationRuleStep = {
  id: string;
  company_id: string | null;
  rule_key: string;
  channel: NotificationChannel;
  offset_days: number;
  trigger_status: string;
  template_key: string;
};

type FinancialCharge = {
  id: string;
  company_id: string;
  contract_id: string;
  property_id: string | null;
  owner_id: string | null;
  tenant_party_id: string | null;
  gross_amount_cents: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  payment_url: string | null;
  boleto_pdf_url: string | null;
  contracts?: { title: string | null; contract_number: string | null } | null;
  properties?: { title: string | null; code: string | null } | null;
};

type ContractParty = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type OwnerTransfer = {
  id: string;
  company_id: string;
  charge_id: string | null;
  contract_id: string | null;
  owner_id: string | null;
  property_id: string | null;
  net_amount_cents: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  receipt_url: string | null;
  properties?: { title: string | null; code: string | null } | null;
};

type PropertyOwner = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  portal_token: string | null;
};

type AutomationSummary = {
  run_id: string;
  companies_scanned: number;
  events_created: number;
  events_skipped: number;
  charge_events_created: number;
  owner_transfer_events_created: number;
  errors: string[];
};

export async function runFinancialNotificationAutomation(limitPerCompany = 80) {
  const runId = await createAutomationRun();
  const summary: AutomationSummary = {
    run_id: runId,
    companies_scanned: 0,
    events_created: 0,
    events_skipped: 0,
    charge_events_created: 0,
    owner_transfer_events_created: 0,
    errors: [],
  };

  try {
    const companies = await loadActiveCompanyIds();
    summary.companies_scanned = companies.length;

    for (const companyId of companies) {
      try {
        const result = await processCompany(companyId, Math.max(1, Math.min(limitPerCompany, 250)));
        summary.events_created += result.eventsCreated;
        summary.events_skipped += result.eventsSkipped;
        summary.charge_events_created += result.chargeEventsCreated;
        summary.owner_transfer_events_created += result.ownerTransferEventsCreated;
      } catch (error) {
        summary.errors.push(
          `${companyId}: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
        );
      }
    }

    await finishAutomationRun(runId, summary, summary.errors.length > 0 ? "failed" : "completed");
    return summary;
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : "Erro desconhecido");
    await finishAutomationRun(runId, summary, "failed");
    throw error;
  }
}

async function processCompany(companyId: string, limitPerCompany: number) {
  const steps = await loadRuleSteps(companyId);
  const chargeSteps = steps.filter((step) => step.rule_key === "rent_charge_collection");
  const ownerTransferSteps = steps.filter((step) => step.rule_key === "owner_transfer");
  let eventsCreated = 0;
  let eventsSkipped = 0;
  let chargeEventsCreated = 0;
  let ownerTransferEventsCreated = 0;

  for (const step of chargeSteps) {
    const charges = await loadEligibleCharges(companyId, step, limitPerCompany);

    for (const charge of charges) {
      const created = await createChargeNotificationIfMissing(charge, step);
      if (created) {
        eventsCreated += 1;
        chargeEventsCreated += 1;
      } else {
        eventsSkipped += 1;
      }
    }
  }

  for (const step of ownerTransferSteps) {
    const transfers = await loadEligibleOwnerTransfers(companyId, step, limitPerCompany);

    for (const transfer of transfers) {
      const created = await createOwnerTransferNotificationIfMissing(transfer, step);
      if (created) {
        eventsCreated += 1;
        ownerTransferEventsCreated += 1;
      } else {
        eventsSkipped += 1;
      }
    }
  }

  return { eventsCreated, eventsSkipped, chargeEventsCreated, ownerTransferEventsCreated };
}

async function loadActiveCompanyIds() {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("company_id")
    .in("status", ["active", "trial"])
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (error) throw error;
  return Array.from(new Set((data ?? []).map((subscription) => subscription.company_id as string)));
}

async function loadRuleSteps(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("notification_rule_steps")
    .select("id, company_id, rule_key, channel, offset_days, trigger_status, template_key")
    .or(`company_id.is.null,company_id.eq.${companyId}`)
    .eq("status", "active")
    .in("rule_key", ["rent_charge_collection", "owner_transfer"])
    .order("company_id", { ascending: true, nullsFirst: true })
    .order("rule_key", { ascending: true })
    .order("offset_days", { ascending: true })
    .returns<NotificationRuleStep[]>();

  if (error) throw error;
  return data ?? [];
}

async function loadEligibleCharges(companyId: string, step: NotificationRuleStep, limit: number) {
  const today = currentLocalDate();
  const targetDueDate = addDays(today, -step.offset_days);
  const statuses =
    step.trigger_status === "overdue"
      ? ["waiting_payment", "overdue"]
      : step.trigger_status === "waiting_payment"
        ? ["waiting_payment", "pending", "processing"]
        : [step.trigger_status];

  const { data, error } = await supabaseAdmin
    .from("financial_charges")
    .select(
      "id, company_id, contract_id, property_id, owner_id, tenant_party_id, gross_amount_cents, due_date, paid_at, status, payment_url, boleto_pdf_url, contracts(title, contract_number), properties(title, code)",
    )
    .eq("company_id", companyId)
    .eq("due_date", targetDueDate)
    .in("status", statuses)
    .order("due_date", { ascending: true })
    .limit(limit)
    .returns<FinancialCharge[]>();

  if (error) throw error;
  return data ?? [];
}

async function loadEligibleOwnerTransfers(companyId: string, step: NotificationRuleStep, limit: number) {
  const today = currentLocalDate();
  let query = supabaseAdmin
    .from("owner_transfers")
    .select(
      "id, company_id, charge_id, contract_id, owner_id, property_id, net_amount_cents, status, due_date, paid_at, receipt_url, properties(title, code)",
    )
    .eq("company_id", companyId)
    .eq("status", step.trigger_status)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (step.trigger_status === "paid") {
    query = query.gte("paid_at", `${today}T00:00:00.000Z`).lt("paid_at", `${addDays(today, 1)}T00:00:00.000Z`);
  } else {
    query = query.eq("due_date", addDays(today, -step.offset_days));
  }

  const { data, error } = await query.returns<OwnerTransfer[]>();
  if (error) throw error;
  return data ?? [];
}

async function createChargeNotificationIfMissing(charge: FinancialCharge, step: NotificationRuleStep) {
  if (!charge.tenant_party_id) return false;
  const alreadyExists = await notificationAlreadyExists(charge.company_id, "financial_charge", charge.id, step);
  if (alreadyExists) return false;

  const tenant = await loadContractParty(charge.tenant_party_id, charge.company_id);
  if (!tenant) return false;

  const contact = selectContact(step.channel, tenant);
  if (!contact) return false;

  const template = await loadTemplate(step.template_key, step.channel, charge.company_id);
  const variables = {
    recipient_name: tenant.name,
    amount: formatMoney(charge.gross_amount_cents),
    due_date: formatDate(charge.due_date),
    payment_link: charge.payment_url || charge.boleto_pdf_url || env.APP_URL,
    contract_title: charge.contracts?.title ?? "contrato de locacao",
    property_title: charge.properties?.title ?? "imovel locado",
  };

  await insertQueuedNotification({
    companyId: charge.company_id,
    templateId: template?.id ?? null,
    channel: step.channel,
    recipientType: "tenant",
    recipientId: tenant.id,
    recipientName: tenant.name,
    recipientContact: contact,
    subject: template?.subject ? renderTemplate(template.subject, variables) : null,
    body: template?.body
      ? renderTemplate(template.body, variables)
      : buildChargeFallbackMessage(step.template_key, variables),
    relatedEntityType: "financial_charge",
    relatedEntityId: charge.id,
    metadata: {
      automation: true,
      automation_key: "financial_notifications",
      rule_key: step.rule_key,
      rule_step_id: step.id,
      notification_type: step.template_key,
      trigger_status: step.trigger_status,
      offset_days: step.offset_days,
      due_date: charge.due_date,
    },
  });

  return true;
}

async function createOwnerTransferNotificationIfMissing(
  transfer: OwnerTransfer,
  step: NotificationRuleStep,
) {
  if (!transfer.owner_id) return false;
  const alreadyExists = await notificationAlreadyExists(
    transfer.company_id,
    "owner_transfer",
    transfer.id,
    step,
  );
  if (alreadyExists) return false;

  const owner = await loadPropertyOwner(transfer.owner_id, transfer.company_id);
  if (!owner) return false;

  const contact = selectContact(step.channel, owner);
  if (!contact) return false;

  const template = await loadTemplate(step.template_key, step.channel, transfer.company_id);
  const portalLink = owner.portal_token ? `${env.APP_URL}/portal/proprietario/${owner.portal_token}` : env.APP_URL;
  const variables = {
    recipient_name: owner.name,
    amount: formatMoney(transfer.net_amount_cents),
    property_title: transfer.properties?.title ?? "imovel locado",
    due_date: transfer.due_date ? formatDate(transfer.due_date) : "em processamento",
    paid_at: transfer.paid_at ? formatDate(transfer.paid_at) : "em processamento",
    receipt_link: transfer.receipt_url || portalLink,
    portal_link: portalLink,
  };

  await insertQueuedNotification({
    companyId: transfer.company_id,
    templateId: template?.id ?? null,
    channel: step.channel,
    recipientType: "owner",
    recipientId: owner.id,
    recipientName: owner.name,
    recipientContact: contact,
    subject: template?.subject ? renderTemplate(template.subject, variables) : null,
    body: template?.body
      ? renderTemplate(template.body, variables)
      : buildOwnerTransferFallbackMessage(step.template_key, variables),
    relatedEntityType: "owner_transfer",
    relatedEntityId: transfer.id,
    metadata: {
      automation: true,
      automation_key: "financial_notifications",
      rule_key: step.rule_key,
      rule_step_id: step.id,
      notification_type: step.template_key,
      trigger_status: step.trigger_status,
      offset_days: step.offset_days,
      charge_id: transfer.charge_id,
      transfer_status: transfer.status,
    },
  });

  return true;
}

async function notificationAlreadyExists(
  companyId: string,
  relatedEntityType: string,
  relatedEntityId: string,
  step: NotificationRuleStep,
) {
  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .select("id")
    .eq("company_id", companyId)
    .eq("related_entity_type", relatedEntityType)
    .eq("related_entity_id", relatedEntityId)
    .eq("channel", step.channel)
    .filter("metadata->>rule_step_id", "eq", step.id)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  return Boolean(data);
}

async function insertQueuedNotification(input: {
  companyId: string;
  templateId: string | null;
  channel: NotificationChannel;
  recipientType: "owner" | "tenant";
  recipientId: string;
  recipientName: string;
  recipientContact: string;
  subject: string | null;
  body: string;
  relatedEntityType: string;
  relatedEntityId: string;
  metadata: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("notification_events")
    .insert({
      company_id: input.companyId,
      template_id: input.templateId,
      channel: input.channel,
      direction: "outbound",
      recipient_type: input.recipientType,
      recipient_id: input.recipientId,
      recipient_name: input.recipientName,
      recipient_contact: input.recipientContact,
      subject: input.subject,
      body: input.body,
      status: "queued",
      provider: "manual",
      related_entity_type: input.relatedEntityType,
      related_entity_id: input.relatedEntityId,
      metadata: input.metadata,
      queued_at: now,
      scheduled_for: now,
    })
    .select(dispatchEventSelect)
    .single();

  if (error) throw error;
}

async function loadContractParty(id: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("contract_parties")
    .select("id, name, email, phone")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<ContractParty>();

  if (error) throw error;
  return data;
}

async function loadPropertyOwner(id: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("property_owners")
    .select("id, name, email, phone, whatsapp, portal_token")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<PropertyOwner>();

  if (error) throw error;
  return data;
}

async function loadTemplate(templateKey: string, channel: NotificationChannel, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .select("id, subject, body")
    .eq("template_key", templateKey)
    .eq("channel", channel)
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .order("company_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ id: string; subject: string | null; body: string }>();

  if (error) throw error;
  return data;
}

async function createAutomationRun() {
  const { data, error } = await supabaseAdmin
    .from("notification_automation_runs")
    .insert({ automation_key: "financial_notifications", status: "running" })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}

async function finishAutomationRun(
  runId: string,
  summary: AutomationSummary,
  status: "completed" | "failed",
) {
  const { error } = await supabaseAdmin
    .from("notification_automation_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      companies_scanned: summary.companies_scanned,
      events_created: summary.events_created,
      events_skipped: summary.events_skipped,
      error_message: summary.errors.length > 0 ? summary.errors.join(" | ") : null,
      metadata: summary,
    })
    .eq("id", runId);

  if (error) throw error;
}

function selectContact(channel: NotificationChannel, party: ContractParty | PropertyOwner) {
  if (channel === "email") return party.email;
  if ("whatsapp" in party && party.whatsapp) return party.whatsapp;
  return party.phone;
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return variables[key] ?? "";
  });
}

function buildChargeFallbackMessage(templateKey: string, variables: Record<string, string>) {
  if (templateKey === "charge_overdue_notice") {
    return `Ola, ${variables.recipient_name}. Identificamos uma cobranca vencida de ${variables.amount}, com vencimento em ${variables.due_date}. Regularize pelo link: ${variables.payment_link}`;
  }

  return `Ola, ${variables.recipient_name}. Sua cobranca de ${variables.amount} vence em ${variables.due_date}. Acesse: ${variables.payment_link}`;
}

function buildOwnerTransferFallbackMessage(templateKey: string, variables: Record<string, string>) {
  if (templateKey === "owner_transfer_paid") {
    return `Ola, ${variables.recipient_name}. O repasse de ${variables.amount} referente a ${variables.property_title} foi realizado. Comprovante: ${variables.receipt_link}`;
  }

  return `Ola, ${variables.recipient_name}. Seu repasse de ${variables.amount} referente a ${variables.property_title} esta previsto para ${variables.due_date}. Portal: ${variables.portal_link}`;
}

function currentLocalDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents || 0) / 100);
}

function formatDate(value: string) {
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(date);
}

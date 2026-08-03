import { env } from "../config/env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { dispatchNotificationEvent } from "./notification-dispatcher.js";

type QueuedNotification = {
  id: string;
  company_id: string;
  channel: "email" | "whatsapp" | "sms" | "system";
  status: "queued" | "failed";
  scheduled_for: string | null;
  attempt_count: number;
  max_attempts: number;
  failure_reason: string | null;
};

type DispatchAutomationSummary = {
  run_id: string;
  companies_scanned: number;
  events_found: number;
  events_dispatched: number;
  events_failed: number;
  events_skipped: number;
  provider_missing: number;
  errors: string[];
};

export async function runNotificationDispatchAutomation(limitPerRun = 120) {
  const runId = await createAutomationRun();
  const summary: DispatchAutomationSummary = {
    run_id: runId,
    companies_scanned: 0,
    events_found: 0,
    events_dispatched: 0,
    events_failed: 0,
    events_skipped: 0,
    provider_missing: 0,
    errors: [],
  };

  try {
    const companies = await loadActiveCompanyIds();
    summary.companies_scanned = companies.length;
    const limitPerCompany = Math.max(1, Math.ceil(Math.min(limitPerRun, 500) / Math.max(companies.length, 1)));

    for (const companyId of companies) {
      try {
        const events = await loadQueuedNotifications(companyId, limitPerCompany);
        summary.events_found += events.length;

        for (const event of events) {
          if (!hasProviderConfigured(event.channel)) {
            summary.events_skipped += 1;
            summary.provider_missing += 1;
            continue;
          }

          try {
            const result = await dispatchNotificationEvent({
              eventId: event.id,
              companyId: event.company_id,
            });

            if (result.dispatched) {
              summary.events_dispatched += 1;
            } else {
              summary.events_failed += 1;
            }
          } catch (error) {
            summary.events_failed += 1;
            summary.errors.push(
              `${event.id}: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
            );
          }
        }
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

async function loadQueuedNotifications(companyId: string, limit: number) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .select("id, company_id, channel, status, scheduled_for, attempt_count, max_attempts, failure_reason")
    .eq("company_id", companyId)
    .in("status", ["queued", "failed"])
    .or(`scheduled_for.is.null,scheduled_for.lte.${now}`)
    .order("scheduled_for", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(limit * 2)
    .returns<QueuedNotification[]>();

  if (error) throw error;

  return (data ?? [])
    .filter((event) => event.attempt_count < event.max_attempts)
    .slice(0, limit);
}

async function createAutomationRun() {
  const { data, error } = await supabaseAdmin
    .from("notification_automation_runs")
    .insert({ automation_key: "notification_dispatch", status: "running" })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}

async function finishAutomationRun(
  runId: string,
  summary: DispatchAutomationSummary,
  status: "completed" | "failed",
) {
  const { error } = await supabaseAdmin
    .from("notification_automation_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      companies_scanned: summary.companies_scanned,
      events_created: summary.events_dispatched,
      events_skipped: summary.events_skipped,
      error_message: summary.errors.length > 0 ? summary.errors.join(" | ") : null,
      metadata: summary,
    })
    .eq("id", runId);

  if (error) throw error;
}

function hasProviderConfigured(channel: QueuedNotification["channel"]) {
  if (channel === "whatsapp") return Boolean(env.WHATSAPP_PROVIDER_URL);
  if (channel === "email") return Boolean(env.EMAIL_PROVIDER_URL);
  return false;
}

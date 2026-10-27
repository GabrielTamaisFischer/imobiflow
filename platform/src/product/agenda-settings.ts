import { apiRequest } from "./api";
import { getStoredToken } from "./auth";

export type AgendaUserPreferences = {
  id: string | null;
  company_id: string;
  user_id: string;
  locale: string;
  country: string;
  date_format: "DMY" | "MDY" | "YMD";
  time_format: "24h" | "12h";
  week_start: number;
  timezone: string;
  secondary_timezone: string | null;
  show_world_clock: boolean;
  default_event_duration_minutes: number;
  shorten_meetings: boolean;
  notify_enabled: boolean;
  notify_default_lead_minutes: number;
  notify_sound: boolean;
  notify_only_confirmed: boolean;
  notify_tasks_enabled: boolean;
  show_weekends: boolean;
  show_cancelled: boolean;
  show_completed_tasks: boolean;
  show_week_numbers: boolean;
  compact_short_events: boolean;
  dim_past_events: boolean;
  show_brokers_side_by_side: boolean;
  custom_view_days: number | null;
  default_visibility: "private" | "shared";
  keyboard_shortcuts_enabled: boolean;
};

export type AgendaCompanySettings = {
  id: string | null;
  company_id: string;
  default_timezone: string;
  guests_can_modify_max: boolean;
  guests_can_invite_max: boolean;
  guests_can_see_guest_list_max: boolean;
  default_visibility: "private" | "shared";
  notify_channel_system_enabled: boolean;
  notify_channel_email_enabled: boolean;
  notify_channel_whatsapp_enabled: boolean;
};

const auth = () => ({ token: getStoredToken() ?? undefined });

export function getAgendaPreferences() {
  return apiRequest<{ preferences: AgendaUserPreferences }>(
    "/real-estate/agenda/preferences",
    auth(),
  );
}

export function updateAgendaPreferences(
  input: Partial<Omit<AgendaUserPreferences, "id" | "company_id" | "user_id">>,
) {
  return apiRequest<{ preferences: AgendaUserPreferences }>("/real-estate/agenda/preferences", {
    ...auth(),
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getAgendaCompanySettings() {
  return apiRequest<{ settings: AgendaCompanySettings }>(
    "/real-estate/agenda/company-settings",
    auth(),
  );
}

export function updateAgendaCompanySettings(
  input: Partial<Omit<AgendaCompanySettings, "id" | "company_id">>,
) {
  return apiRequest<{ settings: AgendaCompanySettings }>("/real-estate/agenda/company-settings", {
    ...auth(),
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

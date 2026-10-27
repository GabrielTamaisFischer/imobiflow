import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import type { RequestWithAccess } from "../types/access.js";

export const mysqlAgendaRouter = Router();
mysqlAgendaRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const timezone = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((value) => /^[A-Za-z0-9_+\-/.]+$/.test(value), "Fuso horário inválido.");
const preferencesPatch = z
  .object({
    locale: z.string().trim().min(2).max(10),
    country: z.string().trim().length(2),
    date_format: z.enum(["DMY", "MDY", "YMD"]),
    time_format: z.enum(["24h", "12h"]),
    week_start: z.number().int().min(0).max(6),
    timezone,
    secondary_timezone: timezone.nullable(),
    show_world_clock: z.boolean(),
    default_event_duration_minutes: z.number().int().min(5).max(1440),
    shorten_meetings: z.boolean(),
    notify_enabled: z.boolean(),
    notify_default_lead_minutes: z.number().int().min(0).max(10080),
    notify_sound: z.boolean(),
    notify_only_confirmed: z.boolean(),
    notify_tasks_enabled: z.boolean(),
    show_weekends: z.boolean(),
    show_cancelled: z.boolean(),
    show_completed_tasks: z.boolean(),
    show_week_numbers: z.boolean(),
    compact_short_events: z.boolean(),
    dim_past_events: z.boolean(),
    show_brokers_side_by_side: z.boolean(),
    custom_view_days: z.number().int().min(2).max(5).nullable(),
    default_visibility: z.enum(["private", "shared"]),
    keyboard_shortcuts_enabled: z.boolean(),
  })
  .partial()
  .strict();

const companySettingsPatch = z
  .object({
    default_timezone: timezone,
    guests_can_modify_max: z.boolean(),
    guests_can_invite_max: z.boolean(),
    guests_can_see_guest_list_max: z.boolean(),
    default_visibility: z.enum(["private", "shared"]),
    notify_channel_system_enabled: z.boolean(),
    notify_channel_email_enabled: z.boolean(),
    notify_channel_whatsapp_enabled: z.boolean(),
  })
  .partial()
  .strict();

const preferenceDefaults = {
  locale: "pt-BR",
  country: "BR",
  date_format: "DMY",
  time_format: "24h",
  week_start: 1,
  timezone: "America/Sao_Paulo",
  secondary_timezone: null,
  show_world_clock: false,
  default_event_duration_minutes: 60,
  shorten_meetings: false,
  notify_enabled: true,
  notify_default_lead_minutes: 15,
  notify_sound: false,
  notify_only_confirmed: false,
  notify_tasks_enabled: true,
  show_weekends: true,
  show_cancelled: false,
  show_completed_tasks: true,
  show_week_numbers: false,
  compact_short_events: false,
  dim_past_events: true,
  show_brokers_side_by_side: false,
  custom_view_days: null,
  default_visibility: "shared",
  keyboard_shortcuts_enabled: true,
} as const;

const companySettingsDefaults = {
  default_timezone: "America/Sao_Paulo",
  guests_can_modify_max: false,
  guests_can_invite_max: false,
  guests_can_see_guest_list_max: true,
  default_visibility: "shared",
  notify_channel_system_enabled: true,
  notify_channel_email_enabled: false,
  notify_channel_whatsapp_enabled: false,
} as const;

const db = () => getPrisma() as any;

function access(req: RequestWithAccess) {
  if (!req.access?.company?.id || !req.access.appUser.id) {
    throw Object.assign(new Error("Contexto de empresa inválido."), {
      statusCode: 403,
      code: "COMPANY_REQUIRED",
    });
  }
  return req.access;
}

function serializePreferences(row: any, companyId: string, userId: string) {
  return {
    id: row?.id ?? null,
    company_id: companyId,
    user_id: userId,
    ...preferenceDefaults,
    ...(row
      ? {
          locale: row.locale,
          country: row.country,
          date_format: row.dateFormat,
          time_format: row.timeFormat,
          week_start: row.weekStart,
          timezone: row.timezone,
          secondary_timezone: row.secondaryTimezone,
          show_world_clock: row.showWorldClock,
          default_event_duration_minutes: row.defaultEventDuration,
          shorten_meetings: row.shortenMeetings,
          notify_enabled: row.notifyEnabled,
          notify_default_lead_minutes: row.notifyDefaultLeadMinutes,
          notify_sound: row.notifySound,
          notify_only_confirmed: row.notifyOnlyConfirmed,
          notify_tasks_enabled: row.notifyTasksEnabled,
          show_weekends: row.showWeekends,
          show_cancelled: row.showCancelled,
          show_completed_tasks: row.showCompletedTasks,
          show_week_numbers: row.showWeekNumbers,
          compact_short_events: row.compactShortEvents,
          dim_past_events: row.dimPastEvents,
          show_brokers_side_by_side: row.showBrokersSideBySide,
          custom_view_days: row.customViewDays,
          default_visibility: row.defaultVisibility,
          keyboard_shortcuts_enabled: row.keyboardShortcutsEnabled,
        }
      : {}),
  };
}

function serializeCompanySettings(row: any, companyId: string) {
  return {
    id: row?.id ?? null,
    company_id: companyId,
    ...companySettingsDefaults,
    ...(row
      ? {
          default_timezone: row.defaultTimezone,
          guests_can_modify_max: row.guestsCanModifyMax,
          guests_can_invite_max: row.guestsCanInviteMax,
          guests_can_see_guest_list_max: row.guestsCanSeeGuestListMax,
          default_visibility: row.defaultVisibility,
          notify_channel_system_enabled: row.notifyChannelSystemEnabled,
          notify_channel_email_enabled: row.notifyChannelEmailEnabled,
          notify_channel_whatsapp_enabled: row.notifyChannelWhatsappEnabled,
        }
      : {}),
  };
}

function mapPreferencePatch(input: z.infer<typeof preferencesPatch>) {
  return {
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.country !== undefined ? { country: input.country.toUpperCase() } : {}),
    ...(input.date_format !== undefined ? { dateFormat: input.date_format } : {}),
    ...(input.time_format !== undefined ? { timeFormat: input.time_format } : {}),
    ...(input.week_start !== undefined ? { weekStart: input.week_start } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.secondary_timezone !== undefined
      ? { secondaryTimezone: input.secondary_timezone }
      : {}),
    ...(input.show_world_clock !== undefined ? { showWorldClock: input.show_world_clock } : {}),
    ...(input.default_event_duration_minutes !== undefined
      ? { defaultEventDuration: input.default_event_duration_minutes }
      : {}),
    ...(input.shorten_meetings !== undefined ? { shortenMeetings: input.shorten_meetings } : {}),
    ...(input.notify_enabled !== undefined ? { notifyEnabled: input.notify_enabled } : {}),
    ...(input.notify_default_lead_minutes !== undefined
      ? { notifyDefaultLeadMinutes: input.notify_default_lead_minutes }
      : {}),
    ...(input.notify_sound !== undefined ? { notifySound: input.notify_sound } : {}),
    ...(input.notify_only_confirmed !== undefined
      ? { notifyOnlyConfirmed: input.notify_only_confirmed }
      : {}),
    ...(input.notify_tasks_enabled !== undefined
      ? { notifyTasksEnabled: input.notify_tasks_enabled }
      : {}),
    ...(input.show_weekends !== undefined ? { showWeekends: input.show_weekends } : {}),
    ...(input.show_cancelled !== undefined ? { showCancelled: input.show_cancelled } : {}),
    ...(input.show_completed_tasks !== undefined
      ? { showCompletedTasks: input.show_completed_tasks }
      : {}),
    ...(input.show_week_numbers !== undefined ? { showWeekNumbers: input.show_week_numbers } : {}),
    ...(input.compact_short_events !== undefined
      ? { compactShortEvents: input.compact_short_events }
      : {}),
    ...(input.dim_past_events !== undefined ? { dimPastEvents: input.dim_past_events } : {}),
    ...(input.show_brokers_side_by_side !== undefined
      ? { showBrokersSideBySide: input.show_brokers_side_by_side }
      : {}),
    ...(input.custom_view_days !== undefined ? { customViewDays: input.custom_view_days } : {}),
    ...(input.default_visibility !== undefined
      ? { defaultVisibility: input.default_visibility }
      : {}),
    ...(input.keyboard_shortcuts_enabled !== undefined
      ? { keyboardShortcutsEnabled: input.keyboard_shortcuts_enabled }
      : {}),
  };
}

function mapCompanySettingsPatch(input: z.infer<typeof companySettingsPatch>) {
  return {
    ...(input.default_timezone !== undefined ? { defaultTimezone: input.default_timezone } : {}),
    ...(input.guests_can_modify_max !== undefined
      ? { guestsCanModifyMax: input.guests_can_modify_max }
      : {}),
    ...(input.guests_can_invite_max !== undefined
      ? { guestsCanInviteMax: input.guests_can_invite_max }
      : {}),
    ...(input.guests_can_see_guest_list_max !== undefined
      ? { guestsCanSeeGuestListMax: input.guests_can_see_guest_list_max }
      : {}),
    ...(input.default_visibility !== undefined
      ? { defaultVisibility: input.default_visibility }
      : {}),
    ...(input.notify_channel_system_enabled !== undefined
      ? { notifyChannelSystemEnabled: input.notify_channel_system_enabled }
      : {}),
    ...(input.notify_channel_email_enabled !== undefined
      ? { notifyChannelEmailEnabled: input.notify_channel_email_enabled }
      : {}),
    ...(input.notify_channel_whatsapp_enabled !== undefined
      ? { notifyChannelWhatsappEnabled: input.notify_channel_whatsapp_enabled }
      : {}),
  };
}

mysqlAgendaRouter.get(
  "/preferences",
  requirePermission("appointments.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const current = access(req);
      const row = await db().agendaUserPreference.findUnique({
        where: { companyId_userId: { companyId: current.company.id, userId: current.appUser.id } },
      });
      res.json({ preferences: serializePreferences(row, current.company.id, current.appUser.id) });
    } catch (error) {
      next(error);
    }
  },
);

mysqlAgendaRouter.patch(
  "/preferences",
  requirePermission("appointments.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const current = access(req);
      const input = preferencesPatch.parse(req.body);
      if (!Object.keys(input).length)
        throw Object.assign(new Error("Informe ao menos uma preferência."), {
          statusCode: 422,
          code: "AGENDA_PREFERENCES_EMPTY",
        });
      const data = mapPreferencePatch(input);
      const row = await db().agendaUserPreference.upsert({
        where: { companyId_userId: { companyId: current.company.id, userId: current.appUser.id } },
        create: { companyId: current.company.id, userId: current.appUser.id, ...data },
        update: data,
      });
      res.json({ preferences: serializePreferences(row, current.company.id, current.appUser.id) });
    } catch (error) {
      next(error);
    }
  },
);

mysqlAgendaRouter.get(
  "/company-settings",
  requirePermission("settings.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const current = access(req);
      const row = await db().agendaCompanySettings.findUnique({
        where: { companyId: current.company.id },
      });
      res.json({ settings: serializeCompanySettings(row, current.company.id) });
    } catch (error) {
      next(error);
    }
  },
);

mysqlAgendaRouter.patch(
  "/company-settings",
  requirePermission("settings.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const current = access(req);
      const input = companySettingsPatch.parse(req.body);
      if (!Object.keys(input).length)
        throw Object.assign(new Error("Informe ao menos uma configuração."), {
          statusCode: 422,
          code: "AGENDA_SETTINGS_EMPTY",
        });
      const data = mapCompanySettingsPatch(input);
      const row = await db().agendaCompanySettings.upsert({
        where: { companyId: current.company.id },
        create: { companyId: current.company.id, ...data },
        update: data,
      });
      res.json({ settings: serializeCompanySettings(row, current.company.id) });
    } catch (error) {
      next(error);
    }
  },
);

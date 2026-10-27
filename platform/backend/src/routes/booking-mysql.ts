import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { resolveIdempotencyKey, withIdempotency } from "../services/idempotency.js";
import type { RequestWithAccess } from "../types/access.js";

export const bookingRouter = Router();
bookingRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const pageInputBase = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(5000).optional().nullable(),
  service_type: z.string().trim().min(2).max(60).default("visit"),
  owner_user_id: z.string().uuid(),
  property_id: z.string().uuid().optional().nullable(),
  location_text: z.string().trim().max(240).optional().nullable(),
  color: z.string().trim().max(20).optional().nullable(),
  duration_minutes: z.number().int().min(5).max(1440).default(60),
  buffer_minutes: z.number().int().min(0).max(1440).default(30),
  min_notice_minutes: z.number().int().min(0).max(43200).default(240),
  max_advance_days: z.number().int().min(1).max(730).default(60),
  max_bookings_per_day: z.number().int().min(1).max(1000).optional().nullable(),
  timezone: z.string().trim().min(1).max(60).default("America/Sao_Paulo"),
  availability_starts_at: z.coerce.date().optional().nullable(),
  availability_ends_at: z.coerce.date().optional().nullable(),
  guests_can_invite: z.boolean().default(false),
  guests_can_see_guest_list: z.boolean().default(true),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
});

const pageInput = pageInputBase.refine(
  (value) =>
    !value.availability_starts_at ||
    !value.availability_ends_at ||
    value.availability_ends_at > value.availability_starts_at,
  { message: "A janela final deve ser posterior à inicial." },
);
const pagePatch = pageInputBase
  .partial()
  .extend({ expected_version: z.number().int().positive() })
  .refine(
    (value) =>
      !value.availability_starts_at ||
      !value.availability_ends_at ||
      value.availability_ends_at > value.availability_starts_at,
    { message: "A janela final deve ser posterior à inicial." },
  );
const weeklyInput = z
  .object({
    intervals: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          start_minute: z.number().int().min(0).max(1439),
          end_minute: z.number().int().min(1).max(1440),
        }),
      )
      .max(100),
  })
  .refine((value) => value.intervals.every((item) => item.end_minute > item.start_minute), {
    message: "Intervalo semanal inválido.",
  });
const exceptionInput = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    is_available: z.boolean(),
    start_minute: z.number().int().min(0).max(1439).optional().nullable(),
    end_minute: z.number().int().min(1).max(1440).optional().nullable(),
    reason: z.string().trim().max(160).optional().nullable(),
  })
  .refine(
    (value) =>
      !value.is_available ||
      (value.start_minute !== null &&
        value.start_minute !== undefined &&
        value.end_minute !== null &&
        value.end_minute !== undefined &&
        value.end_minute > value.start_minute),
    { message: "Exceção disponível precisa de intervalo válido." },
  );
const bookingInput = z
  .object({
    id: z.string().uuid().optional(),
    lead_id: z.string().uuid(),
    property_id: z.string().uuid().optional().nullable(),
    starts_at: z.coerce.date(),
    ends_at: z.coerce.date(),
    party_id: z.string().uuid().optional().nullable(),
    guest: z
      .object({ email: z.string().email().optional(), name: z.string().trim().max(160).optional() })
      .optional(),
  })
  .refine((value) => value.ends_at > value.starts_at, {
    message: "O horário final deve ser posterior ao inicial.",
  });

const db = () => getPrisma() as any;
const include = {
  owner: { select: { id: true, name: true, email: true, role: true } },
  property: { select: { id: true, title: true, code: true } },
  weeklyAvailability: true,
  exceptions: true,
};

function fail(message: string, statusCode = 422, code = "BOOKING_INVALID") {
  throw Object.assign(new Error(message), { statusCode, code });
}
function current(req: RequestWithAccess) {
  if (!req.access?.company?.id) fail("Empresa obrigatória.", 403, "COMPANY_REQUIRED");
  return req.access!;
}
function serializeException(item: any) {
  return {
    ...item,
    company_id: item.companyId,
    booking_page_id: item.bookingPageId,
    date: item.date.toISOString().slice(0, 10),
    is_available: item.isAvailable,
    start_minute: item.startMinute,
    end_minute: item.endMinute,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}
function isCompanyScope(access: RequestWithAccess["access"]) {
  return Boolean(access && ["owner", "admin", "manager"].includes(access.appUser.role));
}
function pageWhere(req: RequestWithAccess, id?: string) {
  const access = current(req);
  return {
    ...(id ? { id } : {}),
    companyId: access.company.id,
    ...(isCompanyScope(access) ? {} : { ownerUserId: access.appUser.id }),
  };
}
function serializePage(row: any) {
  return {
    ...row,
    company_id: row.companyId,
    owner_user_id: row.ownerUserId,
    property_id: row.propertyId,
    service_type: row.serviceType,
    location_text: row.locationText,
    duration_minutes: row.durationMinutes,
    buffer_minutes: row.bufferMinutes,
    min_notice_minutes: row.minNoticeMinutes,
    max_advance_days: row.maxAdvanceDays,
    max_bookings_per_day: row.maxBookingsPerDay,
    availability_starts_at: row.availabilityStartsAt?.toISOString() ?? null,
    availability_ends_at: row.availabilityEndsAt?.toISOString() ?? null,
    guests_can_invite: row.guestsCanInvite,
    guests_can_see_guest_list: row.guestsCanSeeGuestList,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    owner: row.owner,
    property: row.property,
    weekly_availability: row.weeklyAvailability ?? [],
    exceptions: (row.exceptions ?? []).map(serializeException),
  };
}
async function ensureOwnerProperty(
  req: RequestWithAccess,
  ownerId: string,
  propertyId?: string | null,
) {
  const access = current(req);
  const owner = await db().appUser.findFirst({
    where: { id: ownerId, companyId: access.company.id, status: "active" },
    select: { id: true },
  });
  if (!owner) fail("Responsável inválido para esta empresa.", 422, "INVALID_BOOKING_OWNER");
  if (propertyId) {
    const property = await db().property.findFirst({
      where: { id: propertyId, companyId: access.company.id },
      select: { id: true },
    });
    if (!property) fail("Imóvel inválido para esta empresa.", 422, "INVALID_BOOKING_PROPERTY");
  }
}
async function loadPage(req: RequestWithAccess, id: string) {
  const row = await db().bookingPage.findFirst({ where: pageWhere(req, id), include });
  if (!row) fail("Página de agendamento não encontrada.", 404, "BOOKING_PAGE_NOT_FOUND");
  return row;
}

bookingRouter.get(
  "/booking-pages",
  requirePermission("appointments.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const rows = await db().bookingPage.findMany({
        where: pageWhere(req),
        include,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      });
      res.json({ pages: rows.map(serializePage) });
    } catch (error) {
      next(error);
    }
  },
);
bookingRouter.get(
  "/booking-pages/:id",
  requirePermission("appointments.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      res.json({ page: serializePage(await loadPage(req, String(req.params.id))) });
    } catch (error) {
      next(error);
    }
  },
);
bookingRouter.post(
  "/booking-pages",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const access = current(req);
      const input = pageInput.parse(req.body);
      await ensureOwnerProperty(req, input.owner_user_id, input.property_id);
      const row = await db().bookingPage.create({
        data: {
          companyId: access.company.id,
          ownerUserId: input.owner_user_id,
          propertyId: input.property_id ?? null,
          title: input.title,
          description: input.description ?? null,
          serviceType: input.service_type,
          locationText: input.location_text ?? null,
          color: input.color ?? null,
          durationMinutes: input.duration_minutes,
          bufferMinutes: input.buffer_minutes,
          minNoticeMinutes: input.min_notice_minutes,
          maxAdvanceDays: input.max_advance_days,
          maxBookingsPerDay: input.max_bookings_per_day ?? null,
          timezone: input.timezone,
          availabilityStartsAt: input.availability_starts_at ?? null,
          availabilityEndsAt: input.availability_ends_at ?? null,
          guestsCanInvite: input.guests_can_invite,
          guestsCanSeeGuestList: input.guests_can_see_guest_list,
          status: input.status,
          createdBy: access.appUser.id,
        },
        include,
      });
      res.status(201).json({ page: serializePage(row) });
    } catch (error) {
      next(error);
    }
  },
);
bookingRouter.patch(
  "/booking-pages/:id",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const page = await loadPage(req, String(req.params.id));
      const input = pagePatch.parse(req.body);
      const { expected_version, ...changes } = input;
      if (changes.owner_user_id || changes.property_id !== undefined)
        await ensureOwnerProperty(
          req,
          changes.owner_user_id ?? page.ownerUserId,
          changes.property_id === undefined ? page.propertyId : changes.property_id,
        );
      const data: Record<string, unknown> = {};
      const map: Record<string, string> = {
        owner_user_id: "ownerUserId",
        property_id: "propertyId",
        service_type: "serviceType",
        location_text: "locationText",
        duration_minutes: "durationMinutes",
        buffer_minutes: "bufferMinutes",
        min_notice_minutes: "minNoticeMinutes",
        max_advance_days: "maxAdvanceDays",
        max_bookings_per_day: "maxBookingsPerDay",
        availability_starts_at: "availabilityStartsAt",
        availability_ends_at: "availabilityEndsAt",
        guests_can_invite: "guestsCanInvite",
        guests_can_see_guest_list: "guestsCanSeeGuestList",
      };
      for (const [key, value] of Object.entries(changes)) data[map[key] ?? key] = value;
      data.version = { increment: 1 };
      const result = await db().bookingPage.updateMany({
        where: { id: page.id, companyId: current(req).company.id, version: expected_version },
        data,
      });
      if (result.count !== 1)
        fail("A página foi alterada por outra operação.", 409, "BOOKING_PAGE_VERSION_CONFLICT");
      res.json({ page: serializePage(await loadPage(req, page.id)) });
    } catch (error) {
      next(error);
    }
  },
);
bookingRouter.post(
  "/booking-pages/:id/duplicate",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const access = current(req);
      const source = await loadPage(req, String(req.params.id));
      const row = await db().bookingPage.create({
        data: {
          companyId: access.company.id,
          ownerUserId: source.ownerUserId,
          propertyId: source.propertyId,
          title: `${source.title} (cópia)`,
          description: source.description,
          serviceType: source.serviceType,
          locationText: source.locationText,
          color: source.color,
          durationMinutes: source.durationMinutes,
          bufferMinutes: source.bufferMinutes,
          minNoticeMinutes: source.minNoticeMinutes,
          maxAdvanceDays: source.maxAdvanceDays,
          maxBookingsPerDay: source.maxBookingsPerDay,
          timezone: source.timezone,
          availabilityStartsAt: source.availabilityStartsAt,
          availabilityEndsAt: source.availabilityEndsAt,
          guestsCanInvite: source.guestsCanInvite,
          guestsCanSeeGuestList: source.guestsCanSeeGuestList,
          status: "inactive",
          createdBy: access.appUser.id,
          weeklyAvailability: {
            create: source.weeklyAvailability.map((item: any) => ({
              companyId: access.company.id,
              weekday: item.weekday,
              startMinute: item.startMinute,
              endMinute: item.endMinute,
            })),
          },
        },
        include,
      });
      res.status(201).json({ page: serializePage(row) });
    } catch (error) {
      next(error);
    }
  },
);
bookingRouter.put(
  "/booking-pages/:id/weekly-availability",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const page = await loadPage(req, String(req.params.id));
      const input = weeklyInput.parse(req.body);
      const grouped = new Set<string>();
      for (const interval of input.intervals) {
        const key = `${interval.weekday}:${interval.start_minute}:${interval.end_minute}`;
        if (grouped.has(key)) fail("Intervalo semanal duplicado.");
        grouped.add(key);
      }
      for (let i = 0; i < input.intervals.length; i += 1)
        for (let j = i + 1; j < input.intervals.length; j += 1) {
          const a = input.intervals[i];
          const b = input.intervals[j];
          if (
            a.weekday === b.weekday &&
            a.start_minute < b.end_minute &&
            b.start_minute < a.end_minute
          )
            fail("Intervalos semanais não podem se sobrepor.");
        }
      await db().$transaction(async (tx: any) => {
        await tx.bookingWeeklyAvailability.deleteMany({
          where: { companyId: current(req).company.id, bookingPageId: page.id },
        });
        if (input.intervals.length)
          await tx.bookingWeeklyAvailability.createMany({
            data: input.intervals.map((item) => ({
              id: randomUUID(),
              companyId: current(req).company.id,
              bookingPageId: page.id,
              weekday: item.weekday,
              startMinute: item.start_minute,
              endMinute: item.end_minute,
            })),
          });
      });
      res.json({ page: serializePage(await loadPage(req, page.id)) });
    } catch (error) {
      next(error);
    }
  },
);
bookingRouter.post(
  "/booking-pages/:id/exceptions",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const page = await loadPage(req, String(req.params.id));
      const input = exceptionInput.parse(req.body);
      const row = await db().bookingAvailabilityException.create({
        data: {
          id: randomUUID(),
          companyId: current(req).company.id,
          bookingPageId: page.id,
          date: new Date(`${input.date}T00:00:00.000Z`),
          isAvailable: input.is_available,
          startMinute: input.start_minute ?? null,
          endMinute: input.end_minute ?? null,
          reason: input.reason ?? null,
        },
      });
      res.status(201).json({ exception: serializeException(row) });
    } catch (error) {
      next(error);
    }
  },
);
bookingRouter.delete(
  "/booking-pages/:id/exceptions/:exceptionId",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const page = await loadPage(req, String(req.params.id));
      await db().bookingAvailabilityException.deleteMany({
        where: {
          id: String(req.params.exceptionId),
          companyId: current(req).company.id,
          bookingPageId: page.id,
        },
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

function dayIntervals(page: any, date: Date) {
  const dateKey = date.toISOString().slice(0, 10);
  const exception = (page.exceptions ?? []).filter(
    (item: any) => item.date.toISOString().slice(0, 10) === dateKey,
  );
  if (exception.length)
    return exception
      .filter(
        (item: any) => item.isAvailable && item.startMinute !== null && item.endMinute !== null,
      )
      .map((item: any) => ({ start: item.startMinute, end: item.endMinute }));
  const weekday = date.getUTCDay();
  return (page.weeklyAvailability ?? [])
    .filter((item: any) => item.weekday === weekday)
    .map((item: any) => ({ start: item.startMinute, end: item.endMinute }));
}
async function availableSlots(
  req: RequestWithAccess,
  page: any,
  date: Date,
  tx = db(),
  excludeAppointmentId?: string,
) {
  const day = dayIntervals(page, date);
  if (!day.length) return [];
  const startOfDay = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const minStart = new Date(Date.now() + page.minNoticeMinutes * 60_000);
  const latest = new Date(Date.now() + page.maxAdvanceDays * 86400000);
  if (date > latest) return [];
  const rangeStart = new Date(
    startOfDay.getTime() + Math.min(...day.map((item: any) => item.start)) * 60_000,
  );
  const rangeEnd = new Date(
    startOfDay.getTime() + Math.max(...day.map((item: any) => item.end)) * 60_000,
  );
  const appointments = await tx.appointment.findMany({
    where: {
      companyId: current(req).company.id,
      assignedTo: page.ownerUserId,
      status: { in: ["scheduled", "confirmed", "in_progress", "completed"] },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
    },
    select: { startsAt: true, endsAt: true },
  });
  const occupied: Array<{ start: number; end: number }> = appointments.map((item: any) => ({
    start: item.startsAt.getTime(),
    end: item.endsAt.getTime(),
  }));
  const slots: Array<{ starts_at: string; ends_at: string }> = [];
  for (const interval of day)
    for (
      let minute = interval.start;
      minute + page.durationMinutes <= interval.end;
      minute += page.durationMinutes + page.bufferMinutes
    ) {
      const start = startOfDay.getTime() + minute * 60000;
      const end = start + page.durationMinutes * 60000;
      if (
        start < minStart.getTime() ||
        end > latest.getTime() ||
        occupied.some((item) => start < item.end && end > item.start)
      )
        continue;
      slots.push({
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
      });
    }
  return slots;
}
bookingRouter.get(
  "/booking-pages/:id/availability",
  requirePermission("appointments.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const page = await loadPage(req, String(req.params.id));
      const value = typeof req.query.date === "string" ? req.query.date : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("Data inválida.");
      res.json({
        date: value,
        timezone: page.timezone,
        slots: await availableSlots(req, page, new Date(`${value}T00:00:00.000Z`)),
      });
    } catch (error) {
      next(error);
    }
  },
);
bookingRouter.get(
  "/booking-pages/:id/bookings",
  requirePermission("appointments.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const page = await loadPage(req, String(req.params.id));
      const rows = await db().booking.findMany({
        where: { companyId: current(req).company.id, bookingPageId: page.id },
        include: { appointment: true, party: true },
        orderBy: { createdAt: "desc" },
      });
      res.json({
        bookings: rows.map((row: any) => ({
          id: row.id,
          appointment_id: row.appointmentId,
          version: row.appointment.version,
          starts_at: row.appointment.startsAt.toISOString(),
          ends_at: row.appointment.endsAt.toISOString(),
          status: row.appointment.status,
          party: row.party,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);
bookingRouter.post(
  "/booking-pages/:id/bookings",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const access = current(req);
      const page = await loadPage(req, String(req.params.id));
      if (page.status !== "active")
        fail("Página de agendamento inativa.", 409, "BOOKING_PAGE_INACTIVE");
      const input = bookingInput.parse(req.body);
      const key = resolveIdempotencyKey(
        req,
        `booking.create:${input.id ?? `${page.id}:${input.starts_at.toISOString()}:${input.ends_at.toISOString()}`}`,
      );
      const result = await withIdempotency(access.company.id, "booking.create", key, async () => {
        const row = await db().$transaction(async (tx: any) => {
          // Lock the responsible user as the shared resource so two different
          // booking pages cannot reserve the same slot concurrently.
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${page.ownerUserId} AND company_id = ${access.company.id} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM booking_pages WHERE id = ${page.id} FOR UPDATE`;
          const slots = await availableSlots(req, page, input.starts_at, tx);
          if (
            !slots.some(
              (slot) =>
                slot.starts_at === input.starts_at.toISOString() &&
                slot.ends_at === input.ends_at.toISOString(),
            )
          )
            fail("Horário não está mais disponível.", 409, "BOOKING_SLOT_UNAVAILABLE");
          if (input.property_id) {
            const property = await tx.property.findFirst({
              where: { id: input.property_id, companyId: access.company.id },
              select: { id: true },
            });
            if (!property) fail("Imóvel inválido.", 422, "INVALID_BOOKING_PROPERTY");
          }
          const lead = await tx.lead.findFirst({
            where: { id: input.lead_id, companyId: access.company.id },
            select: { id: true },
          });
          if (!lead) fail("Lead inválido.", 422, "INVALID_BOOKING_LEAD");
          if (input.party_id) {
            const party = await tx.party.findFirst({
              where: { id: input.party_id, companyId: access.company.id },
              select: { id: true },
            });
            if (!party) fail("Participante inválido.", 422, "INVALID_BOOKING_PARTY");
          }
          if (page.maxBookingsPerDay !== null) {
            const dayStart = new Date(
              `${input.starts_at.toISOString().slice(0, 10)}T00:00:00.000Z`,
            );
            const dayEnd = new Date(dayStart.getTime() + 86400000);
            const dailyCount = await tx.booking.count({
              where: {
                companyId: access.company.id,
                bookingPageId: page.id,
                appointment: {
                  startsAt: { gte: dayStart, lt: dayEnd },
                  status: { not: "cancelled" },
                },
              },
            });
            if (dailyCount >= page.maxBookingsPerDay)
              fail("O limite diário desta página foi atingido.", 409, "BOOKING_DAILY_LIMIT");
          }
          const appointmentId = randomUUID();
          const appointment = await tx.appointment.create({
            data: {
              id: appointmentId,
              companyId: access.company.id,
              leadId: input.lead_id,
              propertyId: input.property_id,
              assignedTo: page.ownerUserId,
              createdBy: access.appUser.id,
              appointmentType: page.serviceType,
              title: page.title,
              description: page.description,
              locationText: page.locationText,
              startsAt: input.starts_at,
              endsAt: input.ends_at,
              metadata: { booking_page_id: page.id },
              status: "scheduled",
            },
          });
          const booking = await tx.booking.create({
            data: {
              id: input.id ?? randomUUID(),
              companyId: access.company.id,
              bookingPageId: page.id,
              appointmentId,
              bookedByUserId: access.appUser.id,
              partyId: input.party_id ?? null,
            },
          });
          if (input.guest?.email || input.guest?.name)
            await tx.appointmentGuest.create({
              data: {
                id: randomUUID(),
                companyId: access.company.id,
                appointmentId,
                email: input.guest.email ?? null,
                name: input.guest.name ?? null,
                canModify: page.guestsCanInvite,
                canInvite: page.guestsCanInvite,
              },
            });
          await tx.appointmentEvent.create({
            data: {
              id: randomUUID(),
              companyId: access.company.id,
              appointmentId,
              actorId: access.appUser.id,
              eventType: "appointment.booked",
              metadataJson: { booking_id: booking.id, booking_page_id: page.id },
            },
          });
          return { booking, appointment };
        });
        return {
          booking: {
            id: row.booking.id,
            appointment_id: row.booking.appointmentId,
            starts_at: row.appointment.startsAt.toISOString(),
            ends_at: row.appointment.endsAt.toISOString(),
            status: row.appointment.status,
          },
        };
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

bookingRouter.patch(
  "/booking-pages/:id/bookings/:bookingId",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const access = current(req);
      const page = await loadPage(req, String(req.params.id));
      if (page.status !== "active")
        fail("Página de agendamento inativa.", 409, "BOOKING_PAGE_INACTIVE");
      const expectedVersion = z.number().int().positive().parse(req.body?.expected_version);
      const startsAt = z.coerce.date().parse(req.body?.starts_at);
      const endsAt = z.coerce.date().parse(req.body?.ends_at);
      if (endsAt <= startsAt) fail("O horário final deve ser posterior ao inicial.");
      const key = resolveIdempotencyKey(
        req,
        `booking.reschedule:${String(req.params.bookingId)}:${expectedVersion}:${startsAt.toISOString()}`,
      );
      const { result, replayed } = await withIdempotency(
        access.company.id,
        "booking.reschedule",
        key,
        async () =>
          db().$transaction(async (tx: any) => {
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${page.ownerUserId} AND company_id = ${access.company.id} FOR UPDATE`;
            await tx.$queryRaw`SELECT id FROM booking_pages WHERE id = ${page.id} FOR UPDATE`;
            const booking = await tx.booking.findFirst({
              where: {
                id: String(req.params.bookingId),
                companyId: access.company.id,
                bookingPageId: page.id,
              },
              include: { appointment: true },
            });
            if (!booking) fail("Reserva não encontrada.", 404, "BOOKING_NOT_FOUND");
            if (booking.appointment.status !== "scheduled")
              fail("Somente reservas agendadas podem ser remarcadas.", 409, "BOOKING_NOT_MUTABLE");
            const slots = await availableSlots(req, page, startsAt, tx, booking.appointmentId);
            if (
              !slots.some(
                (slot) =>
                  slot.starts_at === startsAt.toISOString() &&
                  slot.ends_at === endsAt.toISOString(),
              )
            )
              fail("Horário não está mais disponível.", 409, "BOOKING_SLOT_UNAVAILABLE");
            const updated = await tx.appointment.updateMany({
              where: {
                id: booking.appointmentId,
                companyId: access.company.id,
                version: expectedVersion,
                status: "scheduled",
              },
              data: { startsAt, endsAt, version: { increment: 1 } },
            });
            if (updated.count !== 1)
              fail("A reserva foi alterada por outra operação.", 409, "BOOKING_VERSION_CONFLICT");
            await tx.appointmentEvent.create({
              data: {
                id: randomUUID(),
                companyId: access.company.id,
                appointmentId: booking.appointmentId,
                actorId: access.appUser.id,
                eventType: "appointment.rescheduled",
                metadataJson: { booking_id: booking.id, expected_version: expectedVersion },
              },
            });
            return tx.booking.findUniqueOrThrow({
              where: { id: booking.id },
              include: { appointment: true },
            });
          }),
      );
      res.json({
        booking: {
          id: result.id,
          appointment_id: result.appointmentId,
          version: result.appointment.version,
          starts_at: result.appointment.startsAt.toISOString(),
          ends_at: result.appointment.endsAt.toISOString(),
          status: result.appointment.status,
        },
        replayed,
      });
    } catch (error) {
      next(error);
    }
  },
);

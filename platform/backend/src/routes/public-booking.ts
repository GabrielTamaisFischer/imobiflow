import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { withIdempotency, resolveIdempotencyKey } from "../services/idempotency.js";

export const publicBookingRouter = Router();

const reservationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email(),
  phone: z.string().trim().min(3).max(40).optional().or(z.literal("")),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
});

const rateWindows = new Map<string, { startedAt: number; count: number }>();
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function clientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.socket.remoteAddress ?? "unknown";
}

function fail(message: string, statusCode = 422, code = "PUBLIC_BOOKING_INVALID"): never {
  throw Object.assign(new Error(message), { statusCode, code });
}

function safePage(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    service_type: row.serviceType,
    location_text: row.locationText,
    duration_minutes: row.durationMinutes,
    buffer_minutes: row.bufferMinutes,
    min_notice_minutes: row.minNoticeMinutes,
    max_advance_days: row.maxAdvanceDays,
    timezone: row.timezone,
    weekly_availability: row.weeklyAvailability.map((item: any) => ({
      weekday: item.weekday,
      start_minute: item.startMinute,
      end_minute: item.endMinute,
    })),
  };
}

async function loadPublicPage(siteSlug: string, pageId: string) {
  const prisma = getPrisma() as any;
  const site = await prisma.companySite.findFirst({
    where: { slug: siteSlug, status: "published" },
    select: { id: true, companyId: true, name: true, brandName: true },
  });
  if (!site) fail("Site público não encontrado.", 404, "PUBLIC_SITE_NOT_FOUND");
  const page = await prisma.bookingPage.findFirst({
    where: { id: pageId, companyId: site.companyId, status: "active" },
    include: { weeklyAvailability: true, exceptions: true },
  });
  if (!page) fail("Página de agendamento não encontrada.", 404, "PUBLIC_BOOKING_NOT_FOUND");
  return { site, page };
}

function dayIntervals(page: any, date: Date) {
  const dateKey = date.toISOString().slice(0, 10);
  const exceptions = (page.exceptions ?? []).filter(
    (item: any) => item.date.toISOString().slice(0, 10) === dateKey,
  );
  if (exceptions.length) {
    return exceptions
      .filter((item: any) => item.isAvailable && item.startMinute !== null && item.endMinute !== null)
      .map((item: any) => ({ start: item.startMinute, end: item.endMinute }));
  }
  return (page.weeklyAvailability ?? [])
    .filter((item: any) => item.weekday === date.getUTCDay())
    .map((item: any) => ({ start: item.startMinute, end: item.endMinute }));
}

async function publicSlots(page: any, date: Date, tx: any) {
  const intervals = dayIntervals(page, date);
  if (!intervals.length) return [];
  const dayStart = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const minStart = new Date(Date.now() + page.minNoticeMinutes * 60_000);
  const latest = new Date(Date.now() + page.maxAdvanceDays * 86_400_000);
  if (date > latest) return [];
  const rangeStart = new Date(dayStart.getTime() + Math.min(...intervals.map((item: any) => item.start)) * 60_000);
  const rangeEnd = new Date(dayStart.getTime() + Math.max(...intervals.map((item: any) => item.end)) * 60_000);
  const appointments = await tx.appointment.findMany({
    where: {
      companyId: page.companyId,
      assignedTo: page.ownerUserId,
      status: { in: ["scheduled", "confirmed", "in_progress", "completed"] },
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
    },
    select: { startsAt: true, endsAt: true },
  });
  const slots: Array<{ starts_at: string; ends_at: string }> = [];
  for (const interval of intervals) {
    for (let minute = interval.start; minute + page.durationMinutes <= interval.end; minute += page.durationMinutes + page.bufferMinutes) {
      const start = dayStart.getTime() + minute * 60_000;
      const end = start + page.durationMinutes * 60_000;
      if (start < minStart.getTime() || end > latest.getTime()) continue;
      if (appointments.some((item: any) => start < item.endsAt.getTime() && end > item.startsAt.getTime())) continue;
      slots.push({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() });
    }
  }
  return slots;
}

publicBookingRouter.get("/:siteSlug/:pageId", async (req, res, next) => {
  try {
    const { site, page } = await loadPublicPage(String(req.params.siteSlug), String(req.params.pageId));
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const slots = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? await publicSlots(page, new Date(`${date}T00:00:00.000Z`), getPrisma())
      : [];
    res.json({ site: { name: site.brandName ?? site.name }, page: safePage(page), date: date ?? null, slots });
  } catch (error) {
    next(error);
  }
});

publicBookingRouter.post("/:siteSlug/:pageId/reservations", async (req, res, next) => {
  try {
    const ip = clientIp(req);
    const now = Date.now();
    const window = rateWindows.get(ip);
    if (!window || now - window.startedAt >= RATE_WINDOW_MS) rateWindows.set(ip, { startedAt: now, count: 1 });
    else if (window.count >= RATE_LIMIT) return res.status(429).json({ error: "PUBLIC_BOOKING_RATE_LIMITED", message: "Tente novamente mais tarde." });
    else window.count += 1;

    const { site, page } = await loadPublicPage(String(req.params.siteSlug), String(req.params.pageId));
    const input = reservationSchema.parse(req.body);
    if (input.ends_at <= input.starts_at) fail("O horário final deve ser posterior ao inicial.");
    const key = resolveIdempotencyKey(req, `public-booking:${page.id}:${input.email}:${input.starts_at.toISOString()}`);
    const result = await withIdempotency(site.companyId, "public.booking.create", key, async () => {
      const prisma = getPrisma() as any;
      return prisma.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${page.ownerUserId} AND company_id = ${site.companyId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM booking_pages WHERE id = ${page.id} FOR UPDATE`;
        const slots = await publicSlots(page, input.starts_at, tx);
        if (!slots.some((slot) => slot.starts_at === input.starts_at.toISOString() && slot.ends_at === input.ends_at.toISOString()))
          fail("Este horário não está mais disponível.", 409, "PUBLIC_BOOKING_SLOT_UNAVAILABLE");
        const stage = await tx.crmStage.findFirst({ where: { companyId: site.companyId, status: "active" }, orderBy: { position: "asc" }, select: { id: true } });
        const lead = await tx.lead.create({
          data: {
            id: randomUUID(), companyId: site.companyId, stageId: stage?.id ?? null,
            assignedTo: page.ownerUserId, name: input.name, email: input.email,
            emailNormalized: input.email.toLowerCase(), phone: input.phone || null,
            phoneNormalized: input.phone || null, source: "public_booking", interestType: "not_defined",
            status: "open", notes: `Solicitação pública para ${page.title}`,
          },
        });
        const appointmentId = randomUUID();
        const appointment = await tx.appointment.create({
          data: {
            id: appointmentId, companyId: site.companyId, leadId: lead.id, propertyId: page.propertyId,
            assignedTo: page.ownerUserId, createdBy: null, appointmentType: page.serviceType,
            title: page.title, description: page.description, locationText: page.locationText,
            startsAt: input.starts_at, endsAt: input.ends_at, metadata: { booking_page_id: page.id, source: "public" }, status: "scheduled",
          },
        });
        const booking = await tx.booking.create({ data: { id: randomUUID(), companyId: site.companyId, bookingPageId: page.id, appointmentId, bookedByUserId: null, partyId: null } });
        await tx.appointmentGuest.create({ data: { id: randomUUID(), companyId: site.companyId, appointmentId, email: input.email, name: input.name, canModify: false, canInvite: false } });
        await tx.appointmentEvent.create({ data: { id: randomUUID(), companyId: site.companyId, appointmentId, actorId: null, eventType: "appointment.public_booked", metadataJson: { booking_id: booking.id, booking_page_id: page.id } } });
        return { booking_id: booking.id, appointment_id: appointment.id, starts_at: appointment.startsAt.toISOString(), ends_at: appointment.endsAt.toISOString(), status: appointment.status };
      });
    });
    res.status(201).json({ reservation: result });
  } catch (error) {
    next(error);
  }
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const agenda = readFileSync(resolve(root, "backend/src/routes/agenda-mysql.ts"), "utf8");
const booking = readFileSync(resolve(root, "backend/src/routes/booking-mysql.ts"), "utf8");
const appointments = readFileSync(
  resolve(root, "backend/src/routes/appointments-mysql.ts"),
  "utf8",
);
const dispatcher = readFileSync(
  resolve(root, "backend/src/services/notification-dispatcher.ts"),
  "utf8",
);
const agendaUi = readFileSync(resolve(root, "src/routes/app.agenda.tsx"), "utf8");
const migration = readFileSync(
  resolve(root, "prisma/migrations/202610270001_c3_booking_pages_and_reservations/migration.sql"),
  "utf8",
);

describe("Agenda C2-C5 structural guarantees", () => {
  it("persists user/company settings only from authenticated tenant context", () => {
    expect(agenda).toContain("requireAuth, requireCompany, requireActiveSubscription");
    expect(agenda).toContain("companyId: current.company.id");
    expect(agenda).toContain("userId: current.appUser.id");
    expect(agenda).toContain('requirePermission("appointments.view")');
    expect(agenda).toContain('requirePermission("settings.manage")');
  });

  it("keeps booking pages and reservations tenant-scoped with permission gates", () => {
    expect(booking).toContain("companyId: access.company.id");
    expect(booking).toContain('requirePermission("appointments.manage")');
    expect(booking).toContain('requirePermission("appointments.view")');
    expect(booking).toContain("resolveIdempotencyKey");
    expect(booking).toContain("FOR UPDATE");
    expect(booking).toContain("booking-pages/:id/bookings/:bookingId");
    expect(booking).toContain("booking.reschedule");
    expect(booking).toContain("BOOKING_DAILY_LIMIT");
    expect(booking).toContain("INVALID_BOOKING_PARTY");
  });

  it("uses exception precedence and canonical Appointment for reservations", () => {
    expect(booking).toContain("if (exception.length)");
    expect(booking).toContain("tx.appointment.create");
    expect(booking).toContain("tx.booking.create");
    expect(booking).toContain('eventType: "appointment.booked"');
  });

  it("supports explicit reservation selection and optional property", () => {
    expect(booking).toContain("property_id: z.string().uuid().optional().nullable()");
    expect(booking).toContain("if (input.property_id)");
    expect(agendaUi).toContain("Selecione o cliente antes de reservar.");
    expect(agendaUi).toContain("property_id: propertyId || null");
    expect(agendaUi).not.toContain("const lead = leads[0]");
    expect(agendaUi).not.toContain("const property = properties[0]");
  });

  it("exposes full page configuration and weekly/exception editors", () => {
    expect(agendaUi).toContain("Disponibilidade semanal");
    expect(agendaUi).toContain("Adicionar exceção");
    expect(agendaUi).toContain("Copiar de...");
    expect(agendaUi).toContain("setCopySource");
    expect(agendaUi).toContain("Indisponível");
    expect(agendaUi).toContain("min_notice_minutes");
    expect(agendaUi).toContain("onSaveWeekly");
  });

  it("schedules and cancels idempotent appointment reminders", () => {
    expect(appointments).toContain("upsertAppointmentReminder");
    expect(appointments).toContain("cancelAppointmentReminders");
    expect(appointments).toContain("scheduleReminderIfEnabled");
    expect(dispatcher).toContain('kind: "appointment_reminder"');
    expect(dispatcher).toContain('status: "cancelled"');
  });

  it("migration is additive and preserves appointment history", () => {
    expect(migration).toContain("CREATE TABLE `booking_pages`");
    expect(migration).toContain("CREATE TABLE `bookings`");
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(migration.toUpperCase()).not.toMatch(/DROP|TRUNCATE|RENAME TABLE/);
  });
});

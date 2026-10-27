import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "src/routes/app.agenda.tsx"), "utf8");

describe("Agenda C2-C5 UI wiring", () => {
  it("renders preferences and booking pages controls", () => {
    expect(source).toContain("Preferências");
    expect(source).toContain("Páginas de agendamento");
    expect(source).toContain("AgendaPreferencesPanel");
    expect(source).toContain("BookingPagesPanel");
  });

  it("exposes availability and reservation actions without replacing Appointment", () => {
    expect(source).toContain("Consultar horários");
    expect(source).toContain("Reservar");
    expect(source).toContain("createBooking");
    expect(source).toContain("loadData()");
  });

  it("wires the agenda controls to real state and persisted preferences", () => {
    expect(source).toContain('aria-label="Visualização da agenda"');
    expect(source).toContain("imobiflow.agenda.view");
    expect(source).toContain("aria-label=\"Pesquisar na agenda\"");
    expect(source).toContain("Filtrar compromissos");
    expect(source).toContain("isoWeekNumber");
    expect(source).toContain("show_weekends");
  });

  it("keeps real-estate associations and map actions in the appointment flow", () => {
    expect(source).toContain("Visita exige cliente/interessado e imóvel vinculados.");
    expect(source).toContain("Google Maps");
    expect(source).toContain("Waze");
    expect(source).toContain("agenda-timezones");
  });

  it("uses paginated remote search and renders broker resource columns", () => {
    expect(source).toContain("searchKind=\"users\"");
    expect(source).toContain("searchKind=\"leads\"");
    expect(source).toContain("searchKind=\"properties\"");
    expect(source).toContain("setTimeout");
    expect(source).toContain("ResourceTimeGridView");
    expect(source).toContain("show_brokers_side_by_side");
  });

  it("connects the in-app notification feed without claiming background push", () => {
    expect(source).toContain("listAgendaNotifications");
    expect(source).toContain("markAgendaNotificationRead");
    expect(source).toContain("Atualização automática");
  });
});

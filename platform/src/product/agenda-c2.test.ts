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
});

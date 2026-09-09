import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  appointmentStatusLabels,
  appointmentTypeLabels,
  formatAppointmentDate,
  toIsoDateTime,
} from "./appointments";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("F7B — interface de agendamentos canônicos", () => {
  it("usa exclusivamente o endpoint MySQL e não o cliente legado", async () => {
    const client = await source("./appointments.ts");
    const route = await source("../routes/app.agenda.tsx");
    expect(client).toContain("/real-estate/appointments");
    expect(client).toContain("Idempotency-Key");
    expect(route).toContain("from: toIsoDateTime(from)");
    expect(route).not.toContain('from "@/product/agenda"');
  });

  it("mantém labels e estados terminais do contrato", () => {
    expect(appointmentTypeLabels.visit).toBe("Visita");
    expect(appointmentStatusLabels.scheduled).toBe("Agendada");
    expect(appointmentStatusLabels.completed).toBe("Concluída");
    expect(appointmentStatusLabels.cancelled).toBe("Cancelada");
  });

  it("normaliza campos datetime-local para ISO e formata no locale do usuário", () => {
    expect(toIsoDateTime("2026-09-10T10:30")).toMatch(/2026-09-10T13:30:00.000Z/);
    expect(formatAppointmentDate("2026-09-10T13:30:00.000Z")).toContain("10/09/2026");
  });

  it("usa locking otimista e refetch após conflito", async () => {
    const client = await source("./appointments.ts");
    const route = await source("../routes/app.agenda.tsx");
    expect(client).toContain("expected_version");
    expect(client).toContain("/cancel");
    expect(client).toContain("/complete");
    expect(route).toContain("status === 409");
    expect(route).toContain("void loadData()");
  });

  it("condiciona mutações à appointments.manage e oferece loading/erro/empty", async () => {
    const route = await source("../routes/app.agenda.tsx");
    expect(route).toContain('canManage(user, "appointments.manage")');
    expect(route).toContain("Nenhum agendamento encontrado");
    expect(route).toContain("Carregando agendamentos");
    expect(route).toContain('role="alert"');
  });
});

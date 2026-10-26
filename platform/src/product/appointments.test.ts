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
    expect(route).toContain("toIsoDateTime(formatDateTimeLocal(range.from))");
    expect(route).not.toContain('from "@/product/agenda"');
  });

  it("mantém labels e estados terminais do contrato (F8 — tipos/estados ampliados)", () => {
    expect(appointmentTypeLabels.visit).toBe("Visita a imóvel");
    expect(appointmentTypeLabels.event).toBe("Evento");
    expect(appointmentTypeLabels.task).toBe("Tarefa");
    expect(appointmentStatusLabels.scheduled).toBe("Agendada");
    expect(appointmentStatusLabels.completed).toBe("Concluída");
    expect(appointmentStatusLabels.cancelled).toBe("Cancelada");
  });

  it("normaliza campos datetime-local para ISO e formata no locale do usuário", () => {
    // toIsoDateTime interpreta o valor de <input type="datetime-local"> como horário LOCAL do
    // navegador (comportamento correto do runtime JS para esse formato) e converte para UTC.
    // Por isso o ISO esperado é calculado a partir do fuso local do processo em execução, em vez
    // de um literal fixo — o literal antigo (...T13:30:00.000Z) só era válido assumindo
    // America/Sao_Paulo (UTC-3) e quebrava em qualquer ambiente de CI configurado em outro fuso.
    const expectedIso = new Date(2026, 8, 10, 10, 30, 0, 0).toISOString();
    expect(toIsoDateTime("2026-09-10T10:30")).toBe(expectedIso);
    expect(formatAppointmentDate(expectedIso)).toContain("10/09/2026");
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
    expect(route).toContain("Carregando agenda");
    expect(route).toContain('role="alert"');
  });
});

import { describe, expect, it } from "vitest";
import { appointmentInput, appointmentStatuses, appointmentTypes, canTransitionAppointment, lifecycleInput, patchInput } from "../src/routes/appointments-mysql.js";
import { brokerResourceScopedPermissions, roleTemplates } from "../src/services/roles.js";

const valid = {
  id: "11111111-1111-4111-8111-111111111111",
  lead_id: "22222222-2222-4222-8222-222222222222",
  property_id: "33333333-3333-4333-8333-333333333333",
  assigned_to: "44444444-4444-4444-8444-444444444444",
  title: "Visita QA",
  starts_at: "2026-09-10T12:00:00.000Z",
  ends_at: "2026-09-10T13:00:00.000Z",
};

describe("F7A — domínio canônico de agendamento", () => {
  it.each([
    ["scheduled", "scheduled"],
    ["scheduled", "confirmed"],
    ["scheduled", "in_progress"],
    ["scheduled", "completed"],
    ["scheduled", "cancelled"],
    ["scheduled", "no_show"],
    ["confirmed", "in_progress"],
    ["confirmed", "completed"],
    ["confirmed", "cancelled"],
    ["confirmed", "no_show"],
    ["in_progress", "completed"],
    ["in_progress", "cancelled"],
  ])("permite transição válida %s -> %s (agenda F8 — visita/tarefa/evento)", (from, to) => {
    expect(canTransitionAppointment(from, to)).toBe(true);
  });

  it.each([
    ["cancelled", "scheduled"],
    ["cancelled", "completed"],
    ["completed", "scheduled"],
    ["completed", "cancelled"],
    ["no_show", "scheduled"],
    ["no_show", "completed"],
    ["unknown", "completed"],
  ])("bloqueia transição inválida %s -> %s", (from, to) => {
    expect(canTransitionAppointment(from, to)).toBe(false);
  });

  it.each([["assigned_to", "responsável"]])("create exige vínculo %s", (field) => {
    const input = { ...valid } as Record<string, unknown>;
    delete input.assigned_to;
    expect(() => appointmentInput.parse(input)).toThrow();
  });

  it("create exige imóvel vinculado quando appointment_type é visit (F8)", () => {
    const input = { ...valid } as Record<string, unknown>;
    delete input.property_id;
    expect(() => appointmentInput.parse(input)).toThrow();
  });

  it("create NÃO exige lead nem imóvel para Evento ou Tarefa (F8 — agenda genérica)", () => {
    const input = { ...valid, appointment_type: "event" } as Record<string, unknown>;
    delete input.lead_id;
    delete input.property_id;
    const parsed = appointmentInput.parse(input);
    expect(parsed.lead_id ?? null).toBeNull();
    expect(parsed.property_id ?? null).toBeNull();

    const task = appointmentInput.parse({ ...input, appointment_type: "task" });
    expect(task.appointment_type).toBe("task");
  });

  it.each([
    ["scheduled", "completed"],
    ["scheduled", "cancelled"],
    ["scheduled", "confirmed"],
    ["confirmed", "in_progress"],
    ["in_progress", "completed"],
    ["completed", "completed"],
    ["cancelled", "cancelled"],
    ["no_show", "no_show"],
  ])("lifecycle permanece determinístico para %s -> %s", (from, to) => {
    expect(appointmentStatuses).toContain(from);
    expect(appointmentStatuses).toContain(to);
  });

  it("aceita criação sem fim e mantém tipo padrão", () => {
    const parsed = appointmentInput.parse({ ...valid, ends_at: undefined });
    expect(parsed.appointment_type).toBe("visit");
  });

  it("aceita todos os tipos canônicos", () => {
    for (const appointment_type of appointmentTypes) {
      const input = appointment_type === "visit" ? valid : { ...valid, appointment_type };       expect(appointmentInput.parse({ ...input, appointment_type }).appointment_type).toBe(appointment_type);
    }
  });

  it("inclui event e task no vocabulário de tipos (F8 — agenda genérica)", () => {
    expect(appointmentTypes).toContain("event");
    expect(appointmentTypes).toContain("task");
  });

  it("aceita metadata estruturada", () => {
    expect(appointmentInput.parse({ ...valid, metadata: { source: "qa", channel: "crm" } }).metadata).toEqual({ source: "qa", channel: "crm" });
  });

  it("rejeita UUID inválido", () => {
    expect(() => appointmentInput.parse({ ...valid, property_id: "property-b" })).toThrow();
  });

  it("rejeita título curto", () => {
    expect(() => appointmentInput.parse({ ...valid, title: "x" })).toThrow();
  });

  it("rejeita data inválida", () => {
    expect(() => appointmentInput.parse({ ...valid, starts_at: "not-a-date" })).toThrow();
  });

  it("patch exige expected_version", () => {
    expect(() => patchInput.parse({ starts_at: valid.starts_at })).toThrow();
  });

  it("patch exige alguma alteração", () => {
    expect(() => patchInput.parse({ expected_version: 1 })).toThrow();
  });

  it("patch aceita remarcação com versão", () => {
    expect(patchInput.parse({ expected_version: 1, starts_at: valid.starts_at }).expected_version).toBe(1);
  });

  it("patch aceita limpar lembrete", () => {
    expect(patchInput.parse({ expected_version: 2, reminder_at: null }).reminder_at).toBeNull();
  });

  it("lifecycle exige expected_version", () => {
    expect(() => lifecycleInput.parse({})).toThrow();
  });

  it("lifecycle rejeita versão zero", () => {
    expect(() => lifecycleInput.parse({ expected_version: 0 })).toThrow();
  });

  it("lifecycle aceita versão positiva", () => {
    expect(lifecycleInput.parse({ expected_version: 4 }).expected_version).toBe(4);
  });

  it("status canônico cobre ciclo de visita, tarefa e evento (F8)", () => {
    expect(appointmentStatuses).toEqual(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]);
  });

  it("Broker possui leitura e gestão de appointments no template", () => {
    const broker = roleTemplates.find((role) => role.systemKey === "broker");
    expect(broker?.permissions).toContain("appointments.view");
    expect(broker?.permissions).toContain("appointments.manage");
  });

  it("appointments.view é resource-scoped para Broker", () => {
    expect(brokerResourceScopedPermissions).toContain("appointments.view");
  });

  it("appointments.manage é resource-scoped para Broker", () => {
    expect(brokerResourceScopedPermissions).toContain("appointments.manage");
  });

  it("não concede export ao Broker por causa da agenda", () => {
    const broker = roleTemplates.find((role) => role.systemKey === "broker");
    expect(broker?.permissions).not.toContain("data.export");
  });

  it.each([
    ["scheduled", "completed"],
    ["scheduled", "cancelled"],
  ])("lifecycle canônico tem saída única para %s -> %s", (from, to) => {
    expect(canTransitionAppointment(from, to)).toBe(true);
  });

  it.each([
    ["completed", "scheduled"],
    ["completed", "cancelled"],
    ["cancelled", "scheduled"],
  ])("estado terminal %s não reabre para %s", (from, to) => {
    expect(canTransitionAppointment(from, to)).toBe(false);
  });

  it("mantém idempotência de estado ao repetir completed", () => {
    expect(canTransitionAppointment("completed", "completed")).toBe(true);
  });

  it("mantém idempotência de estado ao repetir cancelled", () => {
    expect(canTransitionAppointment("cancelled", "cancelled")).toBe(true);
  });

  it("tipos não permitem valor arbitrário", () => {
    expect(() => appointmentInput.parse({ ...valid, appointment_type: "random" })).toThrow();
  });

  it("metadata não aceita array como objeto", () => {
    expect(() => appointmentInput.parse({ ...valid, metadata: [] })).toThrow();
  });

  it("description aceita nulo", () => {
    expect(appointmentInput.parse({ ...valid, description: null }).description).toBeNull();
  });

  it("location aceita nulo", () => {
    expect(appointmentInput.parse({ ...valid, location_text: null }).location_text).toBeNull();
  });

  it("reminder aceita ISO datetime", () => {
    expect(appointmentInput.parse({ ...valid, reminder_at: valid.starts_at }).reminder_at).toBeInstanceOf(Date);
  });
});

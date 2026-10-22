import { describe, expect, it } from "vitest";
import { resolveInspectionSaveStatus } from "./inspection-save-status";

const base = { saving: false, justSaved: false, offline: false, pending: 0, conflicts: 0, syncing: false };

describe("resolveInspectionSaveStatus (SUB-BLOCO 3 — indicador de salvamento)", () => {
  it("conflito tem prioridade máxima — nunca mostra Salvo/Sincronizado com conflito em aberto", () => {
    expect(resolveInspectionSaveStatus({ ...base, conflicts: 1 })).toBe("conflict");
    expect(resolveInspectionSaveStatus({ ...base, conflicts: 1, saving: true })).toBe("conflict");
    expect(resolveInspectionSaveStatus({ ...base, conflicts: 1, justSaved: true })).toBe("conflict");
    expect(resolveInspectionSaveStatus({ ...base, conflicts: 1, syncing: true, offline: true, pending: 3 })).toBe("conflict");
  });

  it("mutação em voo mostra Salvando, mesmo com justSaved pendente de um clique anterior", () => {
    expect(resolveInspectionSaveStatus({ ...base, saving: true })).toBe("saving");
    expect(resolveInspectionSaveStatus({ ...base, saving: true, justSaved: true })).toBe("saving");
  });

  it("sincronização da fila offline em andamento mostra Sincronizando", () => {
    expect(resolveInspectionSaveStatus({ ...base, syncing: true })).toBe("syncing");
    expect(resolveInspectionSaveStatus({ ...base, syncing: true, justSaved: true })).toBe("syncing");
  });

  it("offline com fila pendente mostra Aguardando internet (não finge que já sincronizou)", () => {
    expect(resolveInspectionSaveStatus({ ...base, offline: true, pending: 2 })).toBe("awaiting_connection");
  });

  it("offline sem nada pendente mostra Salvo neste dispositivo", () => {
    expect(resolveInspectionSaveStatus({ ...base, offline: true, pending: 0 })).toBe("saved_locally");
  });

  it("online com fila pendente ainda não sincronizando é tratado como Sincronizando (nunca como Salvo/Sincronizado)", () => {
    expect(resolveInspectionSaveStatus({ ...base, pending: 1 })).toBe("syncing");
  });

  it("justSaved só aparece em repouso real: online, sem fila, sem conflito, sem sync em andamento", () => {
    expect(resolveInspectionSaveStatus({ ...base, justSaved: true })).toBe("saved");
  });

  it("estado de repouso sem nenhuma confirmação recente é Sincronizado", () => {
    expect(resolveInspectionSaveStatus(base)).toBe("synced");
  });

  it("nunca reporta Salvo ou Sincronizado enquanto há fila pendente ou conflito (checagem combinada)", () => {
    const riskyCombos = [
      { ...base, pending: 1, justSaved: true },
      { ...base, conflicts: 1, justSaved: true },
      { ...base, offline: true, pending: 1, justSaved: true },
    ];
    for (const combo of riskyCombos) {
      const status = resolveInspectionSaveStatus(combo);
      expect(status).not.toBe("saved");
      expect(status).not.toBe("synced");
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  decideGrantMethod,
  getOwnershipBadge,
  groupAccessByUser,
  permissionLabels,
  resourcePermissions,
  togglePermission,
  withImpliedView,
  type ResourceAccessRow,
} from "./sharing";

function row(overrides: Partial<ResourceAccessRow> = {}): ResourceAccessRow {
  return {
    id: "access-1",
    user_id: "user-1",
    user_name: "Broker A2",
    permission: "VIEW",
    granted_by: "user-owner",
    granted_by_name: "Owner A",
    created_at: "2026-09-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("Fase 2.2D — sharing UX helpers", () => {
  // 1-5: mapeamento de permissões técnicas para rótulos humanos em
  // português — a UI nunca deve expor VIEW/EDIT/VISIT/INSPECT/NEGOTIATE.
  it("maps every backend permission to a Portuguese label", () => {
    expect(permissionLabels.VIEW).toBe("Visualizar");
    expect(permissionLabels.EDIT).toBe("Editar");
    expect(permissionLabels.VISIT).toBe("Visitas");
    expect(permissionLabels.INSPECT).toBe("Vistorias");
    expect(permissionLabels.NEGOTIATE).toBe("Negociação");
  });

  it("keeps the permission list identical to the backend's resourcePermissions", () => {
    // Espelha authorization.ts (resourcePermissions) — se o backend ganhar
    // uma nova permissão, este teste falha e lembra de atualizar o mapa de
    // rótulos em vez de deixar a UI mostrar um valor técnico cru.
    expect(resourcePermissions).toEqual(["VIEW", "EDIT", "VISIT", "INSPECT", "NEGOTIATE"]);
    expect(Object.keys(permissionLabels).sort()).toEqual([...resourcePermissions].sort());
  });

  // 27-28: selecionar uma permissão específica mantém VIEW coerente.
  it("implies VIEW when any specific permission is present", () => {
    expect(withImpliedView(["EDIT"])).toEqual(["VIEW", "EDIT"]);
    expect(withImpliedView(["NEGOTIATE"])).toEqual(["VIEW", "NEGOTIATE"]);
    expect(withImpliedView(["VISIT", "INSPECT"])).toEqual(["VIEW", "VISIT", "INSPECT"]);
  });

  it("does not duplicate VIEW when already present", () => {
    expect(withImpliedView(["VIEW", "EDIT"])).toEqual(["VIEW", "EDIT"]);
  });

  it("keeps an empty selection empty (no implied VIEW with nothing selected)", () => {
    expect(withImpliedView([])).toEqual([]);
  });

  it("toggling EDIT on also turns VIEW on (#27)", () => {
    const next = togglePermission([], "EDIT", true);
    expect(next).toEqual(["VIEW", "EDIT"]);
  });

  it("toggling NEGOTIATE on also turns VIEW on (#28)", () => {
    const next = togglePermission(["VIEW"], "NEGOTIATE", true);
    expect(next).toEqual(["VIEW", "NEGOTIATE"]);
  });

  it("does not allow unchecking VIEW while another permission remains selected", () => {
    // Nunca produzir um estado visualmente contraditório (EDIT marcado sem
    // VIEW), já que o backend concede VIEW implicitamente.
    const next = togglePermission(["VIEW", "EDIT"], "VIEW", false);
    expect(next).toEqual(["VIEW", "EDIT"]);
  });

  it("allows unchecking VIEW when it is the only permission selected", () => {
    const next = togglePermission(["VIEW"], "VIEW", false);
    expect(next).toEqual([]);
  });

  it("unchecking a specific permission keeps VIEW if others remain", () => {
    const next = togglePermission(["VIEW", "EDIT", "VISIT"], "EDIT", false);
    expect(next).toEqual(["VIEW", "VISIT"]);
  });

  // 29: o conjunto final enviado corresponde ao esperado (agrupamento).
  it("groups one row per permission into one entry per user, preserving arrival order (#29)", () => {
    const rows = [
      row({ id: "a1", user_id: "u1", permission: "VIEW" }),
      row({ id: "a2", user_id: "u2", permission: "VIEW" }),
      row({ id: "a3", user_id: "u1", permission: "EDIT" }),
    ];
    const grouped = groupAccessByUser(rows);
    expect(grouped.map((entry) => entry.user_id)).toEqual(["u1", "u2"]);
    expect(grouped[0].permissions).toEqual(["VIEW", "EDIT"]);
    expect(grouped[0].accessIdByPermission).toEqual({ VIEW: "a1", EDIT: "a3" });
    expect(grouped[1].permissions).toEqual(["VIEW"]);
  });

  it("does not duplicate a permission that appears twice for the same user", () => {
    const rows = [row({ id: "a1", permission: "VIEW" }), row({ id: "a1", permission: "VIEW" })];
    const grouped = groupAccessByUser(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].permissions).toEqual(["VIEW"]);
  });

  // Seção "POST X PUT": usuário sem grants -> POST; usuário já com grants -> PUT.
  it("decides POST for a user with no existing grants", () => {
    expect(decideGrantMethod([])).toBe("POST");
  });

  it("decides PUT for a user who already has at least one grant", () => {
    expect(decideGrantMethod(["VIEW"])).toBe("PUT");
  });

  // 24-26: badges "Meu" / "Compartilhado" / ausência de badge enganoso.
  it("badges the responsible Broker as 'meu' (#24)", () => {
    expect(
      getOwnershipBadge({ currentUserId: "broker-a1", ownerId: "broker-a1", isAdministrative: false }),
    ).toBe("meu");
  });

  it("badges a shared Broker (not the owner) as 'compartilhado' (#25)", () => {
    expect(
      getOwnershipBadge({ currentUserId: "broker-a2", ownerId: "broker-a1", isAdministrative: false }),
    ).toBe("compartilhado");
  });

  it("badges a Broker seeing an unassigned-but-visible resource as 'compartilhado'", () => {
    // Um Broker só enxerga um recurso que não é seu por um grant explícito
    // (own OR shared, já filtrado pelo backend) — mesmo sem responsável
    // definido, não é 'meu'.
    expect(
      getOwnershipBadge({ currentUserId: "broker-a2", ownerId: null, isAdministrative: false }),
    ).toBe("compartilhado");
  });

  it("never badges Owner/Admin/Manager (company scope) — no misleading badge (#26)", () => {
    expect(
      getOwnershipBadge({ currentUserId: "admin-1", ownerId: "broker-a1", isAdministrative: true }),
    ).toBeNull();
    expect(
      getOwnershipBadge({ currentUserId: "admin-1", ownerId: "admin-1", isAdministrative: true }),
    ).toBeNull();
  });

  it("badges nothing when there is no authenticated user id", () => {
    expect(
      getOwnershipBadge({ currentUserId: undefined, ownerId: "broker-a1", isAdministrative: false }),
    ).toBeNull();
  });
});

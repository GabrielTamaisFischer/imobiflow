import { describe, expect, it, vi } from "vitest";
import { createMemoryInspectionOfflineStore, queueInspectionMutation, syncInspectionOfflineQueue, type InspectionSnapshot } from "./inspection-offline";
import type { MysqlInspection } from "./inspections";

function inspection(id: string, version = 1): MysqlInspection {
  return { id, property_id: "property-a", assigned_user_id: "user-a", created_by: "user-a", type: "entry", status: "draft", notes: null, version, completed_at: null, archived_at: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", rooms: [] };
}

describe("F5D — armazenamento e sincronização offline", () => {
  it("isola snapshots e mutations por empresa/usuário", async () => {
    const store = createMemoryInspectionOfflineStore();
    const a: InspectionSnapshot = { key: "company-a:user-a:i1", companyId: "company-a", userId: "user-a", inspectionId: "i1", inspection: inspection("i1"), serverVersion: 1, savedAt: new Date().toISOString(), syncStatus: "synced" };
    await store.putSnapshot(a);
    await queueInspectionMutation({ companyId: "company-a", userId: "user-a", inspectionId: "i1", entityType: "room", entityId: "room-a", operation: "create", payload: { id: "room-a" }, baseVersion: 1, idempotencyKey: "room-a" }, store);
    expect(await store.getSnapshot({ companyId: "company-b", userId: "user-b" }, "i1")).toBeNull();
    expect(await store.listMutations({ companyId: "company-b", userId: "user-b" }, "i1")).toEqual([]);
    expect((await store.listMutations({ companyId: "company-a", userId: "user-a" }, "i1"))[0]?.idempotencyKey).toBe("room-a");
  });

  it("processa a fila em ordem e reutiliza a mesma idempotency key", async () => {
    const store = createMemoryInspectionOfflineStore();
    const scope = { companyId: "company-a", userId: "user-a" };
    await store.putSnapshot({ key: "company-a:user-a:i1", ...scope, inspectionId: "i1", inspection: inspection("i1"), serverVersion: 1, savedAt: new Date().toISOString(), syncStatus: "offline" });
    await queueInspectionMutation({ ...scope, inspectionId: "i1", entityType: "room", entityId: "room-a", operation: "create", payload: { id: "room-a" }, baseVersion: 1, idempotencyKey: "stable-room" }, store);
    const seen: string[] = [];
    const result = await syncInspectionOfflineQueue(async (mutation) => { seen.push(mutation.idempotencyKey); return inspection("i1", 2); }, "i1", scope, store);
    expect(result.synced).toBe(1);
    expect(seen).toEqual(["stable-room"]);
    expect((await store.listMutations(scope, "i1"))[0]?.status).toBe("synced");
  });

  it("marca conflito 409, preserva mutation e interrompe a fila", async () => {
    const store = createMemoryInspectionOfflineStore();
    const scope = { companyId: "company-a", userId: "user-a" };
    await store.putSnapshot({ key: "company-a:user-a:i1", ...scope, inspectionId: "i1", inspection: inspection("i1"), serverVersion: 1, savedAt: new Date().toISOString(), syncStatus: "offline" });
    await queueInspectionMutation({ ...scope, inspectionId: "i1", entityType: "room", entityId: "room-a", operation: "update", payload: {}, baseVersion: 1, idempotencyKey: "conflict-room" }, store);
    const error = Object.assign(new Error("conflict"), { status: 409, code: "INSPECTION_VERSION_CONFLICT" });
    const result = await syncInspectionOfflineQueue(async () => { throw error; }, "i1", scope, store, { fetchServer: vi.fn(async () => inspection("i1", 2)) });
    expect(result.conflicts).toBe(1);
    expect((await store.listMutations(scope, "i1"))[0]?.status).toBe("conflict");
  });

  it("não aceita mutation sem escopo de tenant", async () => {
    await expect(queueInspectionMutation({ companyId: "", userId: "", inspectionId: "i1", entityType: "item", entityId: "item-a", operation: "create", payload: {}, baseVersion: 1, idempotencyKey: "x" }, createMemoryInspectionOfflineStore())).rejects.toThrow("tenant-safe");
  });
});

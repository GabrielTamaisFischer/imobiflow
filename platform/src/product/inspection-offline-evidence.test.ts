import { describe, expect, it, vi } from "vitest";
import {
  createMemoryInspectionOfflineStore,
  queueOfflineInspectionEvidence,
  recoverUploadingOfflineInspectionEvidence,
  syncOfflineInspectionEvidenceQueue,
  type OfflineInspectionEvidence,
} from "./inspection-offline";
import { validateInspectionEvidenceFile } from "./inspections";

function evidence(overrides: Partial<OfflineInspectionEvidence> = {}): OfflineInspectionEvidence {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
  return {
    localId: "evidence-a",
    companyId: "company-a",
    userId: "user-a",
    inspectionId: "inspection-a",
    roomId: "room-a",
    itemId: "item-a",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: blob.size,
    blob,
    caption: null,
    position: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    ...overrides,
  };
}

describe("GAP-01 — evidências offline persistentes", () => {
  it("persiste Blob real, metadata e isola o tenant", async () => {
    const store = createMemoryInspectionOfflineStore();
    const row = await queueOfflineInspectionEvidence(evidence(), store);
    const read = (
      await store.listEvidence({ companyId: "company-a", userId: "user-a" }, "inspection-a")
    )[0];
    expect(read?.blob).toBeInstanceOf(Blob);
    expect(await read?.blob.arrayBuffer()).toEqual(await row.blob.arrayBuffer());
    expect(read?.fileName).toBe("photo.jpg");
    expect(
      await store.listEvidence({ companyId: "company-b", userId: "user-b" }, "inspection-a"),
    ).toEqual([]);
  });

  it("mantém Blob após falha e permite retry idempotente", async () => {
    const store = createMemoryInspectionOfflineStore();
    await queueOfflineInspectionEvidence(evidence(), store);
    const first = await syncOfflineInspectionEvidenceQueue(
      async () => {
        throw new Error("network");
      },
      "inspection-a",
      { companyId: "company-a", userId: "user-a" },
      store,
    );
    expect(first.failed).toBe(1);
    expect(
      (await store.listEvidence({ companyId: "company-a", userId: "user-a" }, "inspection-a"))[0]
        ?.status,
    ).toBe("failed");
    const seen: string[] = [];
    const second = await syncOfflineInspectionEvidenceQueue(
      async (row) => {
        seen.push(row.localId);
        return { remoteEvidenceId: "remote-a" };
      },
      "inspection-a",
      { companyId: "company-a", userId: "user-a" },
      store,
    );
    expect(second.synced).toBe(1);
    expect(seen).toEqual(["evidence-a"]);
    expect(
      (await store.listEvidence({ companyId: "company-a", userId: "user-a" }, "inspection-a"))[0]
        ?.status,
    ).toBe("synced");
  });

  it("recupera item interrompido em uploading e processa múltiplas fotos", async () => {
    const store = createMemoryInspectionOfflineStore();
    const scope = { companyId: "company-a", userId: "user-a" };
    await queueOfflineInspectionEvidence(evidence({ localId: "one" }), store);
    await queueOfflineInspectionEvidence(evidence({ localId: "two", position: 1 }), store);
    await store.putEvidence(evidence({ localId: "three", position: 2, status: "uploading" }));
    expect(await recoverUploadingOfflineInspectionEvidence(scope, store)).toBe(1);
    const result = await syncOfflineInspectionEvidenceQueue(
      vi.fn(async (row) => ({ remoteEvidenceId: `remote-${row.localId}` })),
      "inspection-a",
      scope,
      store,
    );
    expect(result.synced).toBe(3);
    expect(
      (await store.listEvidence(scope, "inspection-a")).every(
        (row) => row.blob instanceof Blob && row.status === "synced",
      ),
    ).toBe(true);
  });

  it("rejeita arquivo inválido antes de criar entrada offline", async () => {
    const invalid = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }) as Blob & {
      name: string;
    };
    invalid.name = "invalid.jpg";
    await expect(validateInspectionEvidenceFile(invalid)).rejects.toMatchObject({
      code: "INVALID_UPLOAD",
    });
  });
});

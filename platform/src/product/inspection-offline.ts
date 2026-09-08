import { getStoredToken } from "./auth";
import type { MysqlInspection } from "./inspections";

export type OfflineMutationStatus = "pending" | "syncing" | "conflict" | "failed" | "synced";
export type OfflineEntity = "inspection" | "room" | "item";
export type OfflineOperation = "create" | "update" | "delete";

export type InspectionOfflineScope = { companyId: string; userId: string };
export type InspectionSnapshot = {
  key: string;
  companyId: string;
  userId: string;
  inspectionId: string;
  inspection: MysqlInspection;
  serverVersion: number;
  savedAt: string;
  syncStatus: "synced" | "offline" | "conflict";
  serverInspection?: MysqlInspection;
};
export type OfflineMutation = {
  id: string;
  companyId: string;
  userId: string;
  inspectionId: string;
  entityType: OfflineEntity;
  entityId: string;
  operation: OfflineOperation;
  payload: Record<string, unknown>;
  baseVersion: number;
  idempotencyKey: string;
  createdAt: string;
  status: OfflineMutationStatus;
  lastError?: string;
};

export type InspectionOfflineStore = {
  getSnapshot(scope: InspectionOfflineScope, inspectionId: string): Promise<InspectionSnapshot | null>;
  putSnapshot(snapshot: InspectionSnapshot): Promise<void>;
  listMutations(scope: InspectionOfflineScope, inspectionId?: string): Promise<OfflineMutation[]>;
  putMutation(mutation: OfflineMutation): Promise<void>;
};

const DB_NAME = "imobiflow-inspection-offline-v1";
const SNAPSHOTS = "snapshots";
const MUTATIONS = "mutations";
let memoryStore: InspectionOfflineStore | undefined;

function scopeKey(scope: InspectionOfflineScope, inspectionId: string) {
  return `${scope.companyId}:${scope.userId}:${inspectionId}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponível."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: "key" });
      if (!db.objectStoreNames.contains(MUTATIONS)) {
        const store = db.createObjectStore(MUTATIONS, { keyPath: "id" });
        store.createIndex("scope", ["companyId", "userId", "inspectionId"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB."));
  });
}

async function idbRequest<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento offline."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error("Falha na transação offline."));
  });
}

const indexedDbStore: InspectionOfflineStore = {
  async getSnapshot(scope, inspectionId) {
    return (await idbRequest<InspectionSnapshot | undefined>(SNAPSHOTS, "readonly", (store) => store.get(scopeKey(scope, inspectionId)))) ?? null;
  },
  async putSnapshot(snapshot) {
    await idbRequest(SNAPSHOTS, "readwrite", (store) => store.put(clone(snapshot)));
  },
  async listMutations(scope, inspectionId) {
    const all = await idbRequest<OfflineMutation[]>(MUTATIONS, "readonly", (store) => store.getAll());
    return all.filter((item) => item.companyId === scope.companyId && item.userId === scope.userId && (!inspectionId || item.inspectionId === inspectionId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async putMutation(mutation) {
    await idbRequest(MUTATIONS, "readwrite", (store) => store.put(clone(mutation)));
  },
};

export function createMemoryInspectionOfflineStore(): InspectionOfflineStore {
  const snapshots = new Map<string, InspectionSnapshot>();
  const mutations = new Map<string, OfflineMutation>();
  return {
    async getSnapshot(scope, inspectionId) { return snapshots.get(scopeKey(scope, inspectionId)) ?? null; },
    async putSnapshot(snapshot) { snapshots.set(snapshot.key, clone(snapshot)); },
    async listMutations(scope, inspectionId) { return [...mutations.values()].filter((item) => item.companyId === scope.companyId && item.userId === scope.userId && (!inspectionId || item.inspectionId === inspectionId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); },
    async putMutation(mutation) { mutations.set(mutation.id, clone(mutation)); },
  };
}

function store() {
  if (typeof indexedDB !== "undefined") return indexedDbStore;
  memoryStore ??= createMemoryInspectionOfflineStore();
  return memoryStore;
}

function decodeJwtPayload(token: string) {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return JSON.parse(atob(normalized)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getInspectionOfflineScope(): InspectionOfflineScope | null {
  const token = getStoredToken();
  if (!token) return null;
  const claims = decodeJwtPayload(token);
  const companyId = claims?.company_id;
  const userId = claims?.sub;
  return typeof companyId === "string" && typeof userId === "string" ? { companyId, userId } : null;
}

export async function readInspectionSnapshot(inspectionId: string, scope = getInspectionOfflineScope(), storage = store()) {
  return scope ? storage.getSnapshot(scope, inspectionId) : null;
}

export async function saveInspectionSnapshot(inspection: MysqlInspection, scope = getInspectionOfflineScope(), storage = store(), syncStatus: InspectionSnapshot["syncStatus"] = "synced") {
  if (!scope) return;
  await storage.putSnapshot({ key: scopeKey(scope, inspection.id), companyId: scope.companyId, userId: scope.userId, inspectionId: inspection.id, inspection: clone(inspection), serverVersion: inspection.version, savedAt: new Date().toISOString(), syncStatus });
}

export async function pendingInspectionMutationCount(inspectionId?: string, scope = getInspectionOfflineScope(), storage = store()) {
  if (!scope) return 0;
  return (await storage.listMutations(scope, inspectionId)).filter((item) => item.status === "pending" || item.status === "syncing" || item.status === "failed").length;
}

export async function inspectionOfflineConflictCount(inspectionId?: string, scope = getInspectionOfflineScope(), storage = store()) {
  if (!scope) return 0;
  return (await storage.listMutations(scope, inspectionId)).filter((item) => item.status === "conflict").length;
}

export async function queueInspectionMutation(input: Omit<OfflineMutation, "id" | "createdAt" | "status">, storage = store()) {
  if (!input.companyId || !input.userId) throw new Error("Sessão tenant-safe necessária para salvar offline.");
  const mutation: OfflineMutation = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: "pending" };
  await storage.putMutation(mutation);
  return mutation;
}

export function isOfflineRuntime() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export type OfflineSyncSender = (mutation: OfflineMutation) => Promise<MysqlInspection>;
export type OfflineSyncOptions = { fetchServer?: (inspectionId: string) => Promise<MysqlInspection> };

export async function syncInspectionOfflineQueue(sender: OfflineSyncSender, inspectionId?: string, scope = getInspectionOfflineScope(), storage = store(), options: OfflineSyncOptions = {}) {
  if (!scope || isOfflineRuntime()) return { synced: 0, conflicts: 0, pending: 0 };
  const mutations = (await storage.listMutations(scope, inspectionId)).filter((item) => item.status === "pending" || item.status === "failed");
  let synced = 0;
  let conflicts = 0;
  for (const mutation of mutations) {
    mutation.status = "syncing";
    await storage.putMutation(mutation);
    try {
      const inspection = await sender(mutation);
      mutation.status = "synced";
      mutation.lastError = undefined;
      await storage.putMutation(mutation);
      await saveInspectionSnapshot(inspection, scope, storage, "synced");
      synced += 1;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "INSPECTION_VERSION_CONFLICT" || (error as { status?: number }).status === 409) {
        mutation.status = "conflict";
        mutation.lastError = "Conflito de versão; revisão necessária.";
        const serverInspection = options.fetchServer ? await options.fetchServer(mutation.inspectionId).catch(() => undefined) : undefined;
        const snapshot = await readInspectionSnapshot(mutation.inspectionId, scope, storage);
        if (snapshot) await storage.putSnapshot({ ...snapshot, syncStatus: "conflict", serverInspection });
        await storage.putMutation(mutation);
        conflicts += 1;
        break;
      }
      mutation.status = isOfflineRuntime() ? "pending" : "failed";
      mutation.lastError = error instanceof Error ? error.message : "Falha de sincronização.";
      await storage.putMutation(mutation);
      break;
    }
  }
  return { synced, conflicts, pending: await pendingInspectionMutationCount(inspectionId, scope, storage) };
}

import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    token: "" as string,
    calls: [] as Array<{ path: string; method: string; body: Record<string, unknown> | null }>,
    handler: null as
      null | ((path: string, method: string, body: Record<string, unknown> | null) => unknown),
  },
}));

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return {
    ...original,
    apiRequest: vi.fn(async (path: string, options: RequestInit = {}) => {
      const method = options.method ?? "GET";
      const body =
        typeof options.body === "string"
          ? (JSON.parse(options.body) as Record<string, unknown>)
          : null;
      state.calls.push({ path, method, body });
      return state.handler ? state.handler(path, method, body) : {};
    }),
  };
});

vi.mock("./auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("./auth")>();
  return { ...original, getStoredToken: () => state.token || null };
});

import { NETWORK_UNAVAILABLE_CODE } from "./api";
import {
  clearInspectionOfflineScope,
  getInspectionOfflinePendingSummary,
  queueInspectionMutation,
  readInspectionSnapshot,
  saveInspectionSnapshot,
} from "./inspection-offline";
import {
  buildOfflineMutationRequest,
  canGenerateInspectionReport,
  createMysqlItem,
  createMysqlRoom,
  filterEvidenceFor,
  listMysqlOfflineInspectionEvidence,
  loadInspectionEvidenceBundle,
  patchMysqlInspection,
  syncMysqlInspectionOfflineQueue,
  uploadMysqlInspectionEvidence,
  type MysqlInspection,
} from "./inspections";
import { formatPropertySearchLabel } from "./inspection-property-search";
import { confirmLogoutWithOfflineData } from "./logout-offline-guard";

const INSPECTION_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const scopeA = { companyId: "company-a", userId: "user-a" };
const scopeB = { companyId: "company-b", userId: "user-b" };

function jwt(companyId: string, userId: string) {
  return `h.${Buffer.from(JSON.stringify({ sub: userId, company_id: companyId })).toString("base64url")}.s`;
}

function inspection(version: number, extra: Partial<MysqlInspection> = {}): MysqlInspection {
  return {
    id: INSPECTION_ID,
    property_id: "p",
    assigned_user_id: "user-a",
    created_by: "user-a",
    type: "entry",
    status: "in_progress",
    notes: null,
    version,
    completed_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    rooms: [],
    ...extra,
  };
}

function setOnline(online: boolean) {
  vi.stubGlobal("navigator", { onLine: online });
}

beforeEach(async () => {
  state.token = jwt("company-a", "user-a");
  state.calls = [];
  state.handler = null;
  setOnline(true);
  await clearInspectionOfflineScope(scopeA);
  await clearInspectionOfflineScope(scopeB);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("expected_version na fila offline", () => {
  it("criação offline de ambiente e item sincroniza com expected_version = versão conhecida", async () => {
    await saveInspectionSnapshot(inspection(3));
    setOnline(false);
    await createMysqlRoom(INSPECTION_ID, {
      id: ROOM_ID,
      expected_version: 3,
      name: "Cozinha",
      position: 0,
    });
    await createMysqlItem(INSPECTION_ID, ROOM_ID, {
      id: ITEM_ID,
      expected_version: 4,
      name: "Pia",
      condition: "good",
      position: 0,
    });
    expect(state.calls).toHaveLength(0); // nada foi à rede enquanto offline

    setOnline(true);
    let serverVersion = 3;
    state.handler = (_path, method) => {
      if (method !== "GET") serverVersion += 1;
      return method === "GET" ? { inspection: inspection(serverVersion) } : {};
    };
    const result = await syncMysqlInspectionOfflineQueue(INSPECTION_ID);
    expect(result).toMatchObject({ synced: 2, conflicts: 0, pending: 0 });
    const writes = state.calls.filter((call) => call.method !== "GET");
    expect(writes[0]).toMatchObject({
      method: "POST",
      path: `/real-estate/inspections/${INSPECTION_ID}/rooms`,
    });
    expect(writes[0].body).toMatchObject({ id: ROOM_ID, name: "Cozinha", expected_version: 3 });
    expect(writes[0].body).not.toHaveProperty("items");
    expect(writes[1]).toMatchObject({
      method: "POST",
      path: `/real-estate/inspections/${INSPECTION_ID}/rooms/${ROOM_ID}/items`,
    });
    expect(writes[1].body).toMatchObject({ id: ITEM_ID, expected_version: 4 });
    expect(writes[1].body).not.toHaveProperty("room_id");
    expect((await readInspectionSnapshot(INSPECTION_ID))?.inspection.version).toBe(5);
  });

  it("conflito 409 não vira erro genérico: marca conflito e preserva a edição local", async () => {
    await saveInspectionSnapshot(inspection(3));
    setOnline(false);
    await createMysqlRoom(INSPECTION_ID, {
      id: ROOM_ID,
      expected_version: 3,
      name: "Cozinha",
      position: 0,
    });
    await patchMysqlInspection(INSPECTION_ID, {
      expected_version: 4,
      notes: "Observação feita sem sinal",
    });

    setOnline(true);
    state.handler = (_path, method) => {
      if (method === "GET")
        return { inspection: inspection(9, { notes: "Editado em outro aparelho" }) };
      if (method === "PATCH")
        throw Object.assign(new Error("A vistoria foi alterada por outra sessão."), {
          status: 409,
          code: "INSPECTION_VERSION_CONFLICT",
        });
      return {};
    };
    const result = await syncMysqlInspectionOfflineQueue(INSPECTION_ID);
    expect(result.conflicts).toBe(1);
    const snapshot = await readInspectionSnapshot(INSPECTION_ID);
    expect(snapshot?.syncStatus).toBe("conflict");
    expect(snapshot?.inspection.notes).toBe("Observação feita sem sinal"); // versão local preservada
    expect(snapshot?.serverInspection?.notes).toBe("Editado em outro aparelho"); // versão remota guardada
    expect((await getInspectionOfflinePendingSummary(scopeA)).conflicts).toBe(1);
  });

  it("queda de rede durante a sincronização não duplica a mutation", async () => {
    await saveInspectionSnapshot(inspection(3));
    setOnline(false);
    await createMysqlRoom(INSPECTION_ID, {
      id: ROOM_ID,
      expected_version: 3,
      name: "Cozinha",
      position: 0,
    });
    setOnline(true);
    state.handler = () => {
      throw Object.assign(new Error("sem rede"), { code: NETWORK_UNAVAILABLE_CODE });
    };
    await syncMysqlInspectionOfflineQueue(INSPECTION_ID);
    expect((await getInspectionOfflinePendingSummary(scopeA)).mutations).toBe(1);
  });

  it("buildOfflineMutationRequest monta exclusões com a versão base", () => {
    const request = buildOfflineMutationRequest({
      id: "m",
      ...scopeA,
      inspectionId: INSPECTION_ID,
      entityType: "item",
      entityId: ITEM_ID,
      operation: "delete",
      payload: { room_id: ROOM_ID },
      baseVersion: 7,
      idempotencyKey: "k",
      createdAt: "",
      status: "pending",
    });
    expect(request).toEqual({
      method: "DELETE",
      path: `/real-estate/inspections/${INSPECTION_ID}/rooms/${ROOM_ID}/items/${ITEM_ID}`,
      body: { expected_version: 7 },
    });
  });
});

describe("compressão integrada ao upload", () => {
  function jpeg(sizeBytes: number) {
    const bytes = new Uint8Array(sizeBytes);
    bytes.set([0xff, 0xd8, 0xff, 0xe0]);
    return new File([bytes], "IMG_2001.JPG", { type: "image/jpeg" });
  }

  function stubBrowserImageApis() {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 4032, height: 3024, close() {} }));
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          private width: number,
          private height: number,
        ) {}
        getContext() {
          return { fillStyle: "", fillRect() {}, drawImage() {} };
        }
        async convertToBlob(options: { quality: number }) {
          return new Blob(
            [new Uint8Array(Math.round(this.width * this.height * options.quality * 0.5))],
            { type: "image/jpeg" },
          );
        }
      },
    );
  }

  it("online: envia a cópia reduzida (≤ ~3 MB, JPEG) e não o original de 6 MB", async () => {
    stubBrowserImageApis();
    state.handler = (_path, _method, body) => ({ evidence: { id: body?.id } });
    await uploadMysqlInspectionEvidence(INSPECTION_ID, { file: jpeg(6_000_000) });
    const post = state.calls.find((call) => call.method === "POST")!;
    expect(post.body!.size_bytes as number).toBeLessThanOrEqual(3_000_000);
    expect(post.body!.mime_type).toBe("image/jpeg");
    expect(post.body!.file_name).toBe("IMG_2001.jpg");
    const base64 = String(post.body!.content_base64).split(",")[1];
    expect(Buffer.from(base64, "base64").length).toBe(post.body!.size_bytes);
    // corpo JSON abaixo do limite de 4,5 MB da Vercel Function
    expect(JSON.stringify(post.body).length).toBeLessThan(4_500_000);
  });

  it("offline: a fila guarda o ORIGINAL intacto (redução só no envio)", async () => {
    setOnline(false);
    await uploadMysqlInspectionEvidence(INSPECTION_ID, { file: jpeg(6_000_000) });
    const [queued] = await listMysqlOfflineInspectionEvidence(INSPECTION_ID);
    expect(queued.file_size).toBe(6_000_000);
    expect(queued.local_blob.size).toBe(6_000_000);
    expect(state.calls).toHaveLength(0);
  });
});

describe("carregamento único de evidências", () => {
  it("uma única chamada à API traz as evidências de toda a vistoria", async () => {
    state.handler = (path) =>
      path.endsWith("/evidence")
        ? {
            evidence: [
              { id: "e1", room_id: null, item_id: null },
              { id: "e2", room_id: ROOM_ID, item_id: null },
              { id: "e3", room_id: ROOM_ID, item_id: ITEM_ID },
            ],
          }
        : {};
    const rows = await loadInspectionEvidenceBundle(INSPECTION_ID);
    expect(state.calls.filter((call) => call.path.endsWith("/evidence"))).toHaveLength(1);
    expect(filterEvidenceFor(rows).map((row) => row.id)).toEqual(["e1"]);
    expect(filterEvidenceFor(rows, ROOM_ID).map((row) => row.id)).toEqual(["e2"]);
    expect(filterEvidenceFor(rows, ROOM_ID, ITEM_ID).map((row) => row.id)).toEqual(["e3"]);
  });

  it("painéis não buscam evidências sozinhos; a página carrega uma vez", async () => {
    const panel = await readFile(
      new URL("../components/app/inspection-evidence-panel.tsx", import.meta.url),
      "utf8",
    );
    const detail = await readFile(
      new URL("../routes/app.vistorias.$inspectionId.tsx", import.meta.url),
      "utf8",
    );
    const panelBody = panel.slice(panel.indexOf("export function InspectionEvidencePanel"));
    expect(panelBody).not.toContain("loadInspectionEvidenceBundle");
    expect(panelBody).not.toContain("listMysqlInspectionEvidence");
    expect(panelBody).not.toContain('addEventListener("online"');
    expect(detail.match(/useInspectionEvidence\(/g)).toHaveLength(1);
  });
});

describe("logout com dados offline pendentes", () => {
  async function queueFor(scope: { companyId: string; userId: string }) {
    await queueInspectionMutation({
      ...scope,
      inspectionId: INSPECTION_ID,
      entityType: "room",
      entityId: ROOM_ID,
      operation: "create",
      payload: { id: ROOM_ID },
      baseVersion: 1,
      idempotencyKey: ROOM_ID,
    });
  }

  it("com pendências avisa; Cancelar mantém sessão e dados", async () => {
    await queueFor(scopeA);
    const confirmFn = vi.fn(() => false);
    expect(await confirmLogoutWithOfflineData(confirmFn)).toBe(false);
    expect(confirmFn).toHaveBeenCalledOnce();
    expect(String((confirmFn.mock.calls[0] as unknown[])[0])).toMatch(
      /1 edição\(ões\).*não poderão ser recuperados/s,
    );
    expect((await getInspectionOfflinePendingSummary(scopeA)).total).toBe(1);
  });

  it("confirmando, apaga só os dados do usuário/empresa que está saindo", async () => {
    await queueFor(scopeA);
    await queueFor(scopeB);
    expect(await confirmLogoutWithOfflineData(() => true)).toBe(true);
    expect((await getInspectionOfflinePendingSummary(scopeA)).total).toBe(0);
    // Dados de outro tenant não são apagados silenciosamente nem ficam visíveis ao escopo A.
    expect((await getInspectionOfflinePendingSummary(scopeB)).total).toBe(1);
  });

  it("sem pendências não pergunta nada e limpa snapshots do escopo", async () => {
    await saveInspectionSnapshot(inspection(3));
    const confirmFn = vi.fn(() => true);
    expect(await confirmLogoutWithOfflineData(confirmFn)).toBe(true);
    expect(confirmFn).not.toHaveBeenCalled();
    expect(await readInspectionSnapshot(INSPECTION_ID)).toBeNull();
  });
});

describe("botão de laudo e busca de imóvel", () => {
  it("laudo só habilita para vistoria concluída/arquivada e com permissão", async () => {
    expect(canGenerateInspectionReport("draft", true)).toBe(false);
    expect(canGenerateInspectionReport("in_progress", true)).toBe(false);
    expect(canGenerateInspectionReport("completed", true)).toBe(true);
    expect(canGenerateInspectionReport("archived", true)).toBe(true);
    expect(canGenerateInspectionReport("completed", false)).toBe(false);
    const detail = await readFile(
      new URL("../routes/app.vistorias.$inspectionId.tsx", import.meta.url),
      "utf8",
    );
    expect(detail).toContain("disabled={busy || !canReport}");
    // Trava síncrona contra duplo clique (o `disabled` só vale após re-render).
    expect(detail).toContain("if (inFlight.current) return;");
    expect(detail).toMatch(/async function generate\(\) \{ await exclusive\(/);
    expect(detail).toMatch(/async function sign\(\) \{[^}]*await exclusive\(/);
    expect(detail).toMatch(/async function compare\(\) \{[^}]*await exclusive\(/);
  });

  it("busca de imóvel é server-side e não carrega lista fixa de 100", async () => {
    const list = await readFile(new URL("../routes/app.vistorias.tsx", import.meta.url), "utf8");
    expect(list).toContain(
      "listProperties({ search: term.trim() || undefined, page: 1, pageSize: 20 })",
    );
    expect(list).not.toContain("pageSize: 100");
    // Erro na busca limpa resultados antigos (evita selecionar imóvel desatualizado).
    expect(list).toContain("setResults([]); setSearchError(");
    expect(
      formatPropertySearchLabel({
        code: "AP-12",
        title: "Apto Centro",
        street: "Rua A",
        number: "10",
        neighborhood: "Centro",
        city: "Curitiba",
      }),
    ).toBe("AP-12 · Apto Centro · Rua A, 10 — Centro — Curitiba");
    expect(
      formatPropertySearchLabel({
        code: null,
        title: "Casa",
        street: null,
        number: null,
        neighborhood: null,
        city: null,
      }),
    ).toBe("Sem código · Casa");
  });
});

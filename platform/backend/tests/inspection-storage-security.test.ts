import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    insertedMedia: [] as Array<Record<string, unknown>>,
    signed: [] as Array<{ bucket: string; path: string }>,
    removed: [] as Array<{ bucket: string; paths: string[] }>,
    createdReferences: [] as Array<Record<string, unknown>>,
    deletedReferences: [] as Array<{ companyId: string; storedFileId: string; entityType: string; entityId: string }>,
    storedFile: null as StoredFileFixture | null,
    media: null as Record<string, unknown> | null,
  },
}));

type StoredFileFixture = {
  id: string;
  companyId: string;
  entityType: string;
  entityId: string;
  provider: string;
  publicId: string;
  metadataJson: Record<string, unknown>;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCompany: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireActiveSubscription: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../src/services/usage-costs.js", () => ({ recordUsageEvent: vi.fn(async () => undefined) }));

vi.mock("../src/services/storage/stored-files.js", () => ({
  async createStoredFileReference(input: Record<string, unknown>) {
    state.createdReferences.push(input);
    return input;
  },
  async findStoredFileByIdForEntity(companyId: string, storedFileId: string, entityType: string, entityId: string) {
    const file = state.storedFile;
    if (!file) return null;
    return file.companyId === companyId && file.id === storedFileId && file.entityType === entityType && file.entityId === entityId
      ? file
      : null;
  },
  async deleteStoredFileByIdForEntity(companyId: string, storedFileId: string, entityType: string, entityId: string) {
    state.deletedReferences.push({ companyId, storedFileId, entityType, entityId });
    return { count: 1 };
  },
}));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: {
    from(table: string) {
      if (table === "inspections") return inspectionLookup();
      if (table === "inspection_media") return inspectionMediaTable();
      throw new Error(`Unexpected table ${table}`);
    },
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string) {
            state.signed.push({ bucket, path });
            return { data: { signedUrl: `https://storage.example.test/${path}` }, error: null };
          },
          async createSignedUploadUrl(path: string) {
            return { data: { token: "test-upload-token", signedUrl: `https://storage.example.test/upload/${path}` }, error: null };
          },
          async remove(paths: string[]) {
            state.removed.push({ bucket, paths });
            return { data: null, error: null };
          },
        };
      },
    },
  },
}));

import { inspectionsRouter } from "../src/routes/inspections.js";

const servers: Server[] = [];

beforeEach(() => {
  state.insertedMedia.length = 0;
  state.signed.length = 0;
  state.removed.length = 0;
  state.createdReferences.length = 0;
  state.deletedReferences.length = 0;
  state.storedFile = null;
  state.media = null;
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("inspection storage authorization", () => {
  it("rejects a client-controlled bucket and path before storage is reached", async () => {
    const response = await request("POST", "/inspection-a/media", {
      media_type: "document",
      storage_bucket: "other-company-private-bucket",
      storage_path: "other-company/secret-contract.pdf",
    });

    expect(response.status).toBe(400);
    expect(state.insertedMedia).toHaveLength(0);
    expect(state.signed).toHaveLength(0);
  });

  it("creates a server-side StoredFile reservation for a legitimate upload", async () => {
    const response = await request("POST", "/inspection-a/media/upload-url", {
      file_name: "vistoria.jpg",
      mime_type: "image/jpeg",
      file_size: 2048,
    });

    expect(response.status).toBe(201);
    expect(response.body.stored_file_id).toEqual(expect.any(String));
    expect(state.createdReferences).toHaveLength(1);
    expect(state.createdReferences[0]).toMatchObject({
      companyId: "company-a",
      entityType: "inspection_media",
      provider: "supabase",
      originalFilename: "vistoria.jpg",
      metadata: { inspection_id: "inspection-a" },
    });
  });

  it("returns 404 for a StoredFile owned by another company", async () => {
    state.storedFile = storedFile({ companyId: "company-b" });

    const response = await request("POST", "/inspection-a/media", {
      media_type: "photo",
      stored_file_id: state.storedFile.id,
    });

    expect(response.status).toBe(404);
    expect(state.insertedMedia).toHaveLength(0);
    expect(state.signed).toHaveLength(0);
  });

  it("returns 404 for a StoredFile reserved for another inspection", async () => {
    state.storedFile = storedFile({
      publicId: "company-a/inspections/inspection-b/file.jpg",
      metadataJson: { inspection_id: "inspection-b" },
    });

    const response = await request("POST", "/inspection-a/media", {
      media_type: "photo",
      stored_file_id: state.storedFile.id,
    });

    expect(response.status).toBe(404);
    expect(state.insertedMedia).toHaveLength(0);
    expect(state.signed).toHaveLength(0);
  });

  it("derives signing location from a legitimate tenant-bound StoredFile", async () => {
    state.storedFile = storedFile();

    const response = await request("POST", "/inspection-a/media", {
      media_type: "photo",
      stored_file_id: state.storedFile.id,
      file_name: "client-controlled.jpg",
      mime_type: "text/plain",
      file_size: 1,
    });

    expect(response.status).toBe(201);
    expect(state.insertedMedia[0]).toMatchObject({
      id: state.storedFile.id,
      company_id: "company-a",
      inspection_id: "inspection-a",
      storage_bucket: "imobiflow-inspections",
      storage_path: state.storedFile.publicId,
      file_name: "reserved.jpg",
      mime_type: "image/jpeg",
      file_size: 4096,
    });
    expect(state.signed).toEqual([{
      bucket: "imobiflow-inspections",
      path: state.storedFile.publicId,
    }]);
  });

  it("derives deletion location from StoredFile instead of the media row", async () => {
    state.storedFile = storedFile();
    state.media = mediaRow({
      id: state.storedFile.id,
      storage_bucket: "attacker-controlled-bucket",
      storage_path: "attacker-controlled/path.jpg",
    });

    const response = await request("DELETE", `/inspection-a/media/${state.storedFile.id}`);

    expect(response.status).toBe(200);
    expect(state.removed).toEqual([{
      bucket: "imobiflow-inspections",
      paths: [state.storedFile.publicId],
    }]);
    expect(state.deletedReferences).toEqual([{
      companyId: "company-a",
      storedFileId: state.storedFile.id,
      entityType: "inspection_media",
      entityId: state.storedFile.id,
    }]);
  });

  it("does not delete storage when the media StoredFile belongs to another company", async () => {
    state.storedFile = storedFile({ companyId: "company-b" });
    state.media = mediaRow({ id: state.storedFile.id });

    const response = await request("DELETE", `/inspection-a/media/${state.storedFile.id}`);

    expect(response.status).toBe(404);
    expect(state.removed).toHaveLength(0);
    expect(state.deletedReferences).toHaveLength(0);
  });
});

function storedFile(overrides: Partial<StoredFileFixture> = {}): StoredFileFixture {
  const id = "22222222-2222-4222-8222-222222222222";
  return {
    id,
    companyId: "company-a",
    entityType: "inspection_media",
    entityId: id,
    provider: "supabase",
    publicId: "company-a/inspections/inspection-a/generated-file.jpg",
    metadataJson: { inspection_id: "inspection-a" },
    originalFilename: "reserved.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 4096,
    ...overrides,
  };
}

function mediaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    company_id: "company-a",
    inspection_id: "inspection-a",
    room_id: null,
    item_id: null,
    media_type: "photo",
    file_url: null,
    storage_bucket: "imobiflow-inspections",
    storage_path: "company-a/inspections/inspection-a/generated-file.jpg",
    file_name: "reserved.jpg",
    mime_type: "image/jpeg",
    file_size: 4096,
    caption: null,
    position: 0,
    created_by: "user-a",
    created_at: "2026-08-05T12:00:00.000Z",
    ...overrides,
  };
}

function inspectionLookup() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: { id: "inspection-a" }, error: null }),
  };
  return builder;
}

function inspectionMediaTable() {
  const lookup = {
    select: () => lookup,
    eq: () => lookup,
    maybeSingle: async () => ({ data: state.media, error: null }),
    insert(input: Record<string, unknown>) {
      state.insertedMedia.push(input);
      return {
        select: () => ({
          single: async () => ({
            data: {
              id: input.id ?? "media-a",
              company_id: input.company_id,
              inspection_id: input.inspection_id,
              room_id: null,
              item_id: null,
              media_type: input.media_type,
              file_url: null,
              storage_bucket: input.storage_bucket,
              storage_path: input.storage_path,
              file_name: null,
              mime_type: null,
              file_size: null,
              caption: null,
              position: 0,
              created_by: input.created_by,
              created_at: "2026-08-05T12:00:00.000Z",
            },
            error: null,
          }),
        }),
      };
    },
    delete() {
      const deletion = {
        eq: () => deletion,
        then(resolve: (value: { error: null }) => void) {
          resolve({ error: null });
        },
      };
      return deletion;
    },
  };
  return lookup;
}

async function request(method: "POST" | "DELETE", path: string, body?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      access: {
        company: { id: "company-a" },
        appUser: { id: "user-a", role: "owner", permissions: ["inspections.manage"] },
      },
    });
    next();
  });
  app.use(inspectionsRouter);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");

  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

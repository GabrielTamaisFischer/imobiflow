import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    permissions: ["inspections.view"] as string[],
    signature: null as Record<string, unknown> | null,
    signatureUpdate: null as Record<string, unknown> | null,
    inspection: null as Record<string, unknown> | null,
    inspectionUpdate: null as Record<string, unknown> | null,
    company: { id: "company-a", name: "Imobiliária A", status: "active" } as Record<string, unknown>,
    subscription: { id: "subscription-a", company_id: "company-a", status: "active", plan_id: "plan-a", expires_at: null } as Record<string, unknown>,
  },
}));

vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCompany: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireActiveSubscription: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: (permission: string) => (_req: unknown, _res: unknown, next: (error?: unknown) => void) => {
    if (state.permissions.includes(permission)) return next();
    return next(Object.assign(new Error("Permissão insuficiente."), { statusCode: 403 }));
  },
}));

vi.mock("../src/services/usage-costs.js", () => ({ recordUsageEvent: vi.fn(async () => undefined) }));
vi.mock("../src/services/storage/stored-files.js", () => ({
  findStoredFileByIdForEntity: vi.fn(async () => null),
}));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: {
    from(table: string) {
      if (table === "inspections") return inspectionTable();
      if (table === "inspection_signatures") return signatureTable();
      if (["inspection_rooms", "inspection_items", "inspection_media"].includes(table)) return emptyCollectionTable();
      if (table === "companies") return singleRowTable(() => state.company);
      if (table === "subscriptions") return singleRowTable(() => state.subscription);
      throw new Error(`Unexpected table ${table}`);
    },
  },
}));

import { inspectionsRouter } from "../src/routes/inspections.js";
import { publicInspectionsRouter } from "../src/routes/public-inspections.js";

const servers: Server[] = [];

beforeEach(() => {
  state.permissions = ["inspections.view"];
  state.signature = signatureFixture();
  state.signatureUpdate = null;
  state.inspection = {
    id: "inspection-a",
    company_id: "company-a",
    status: "waiting_signature",
    title: "Vistoria A",
  };
  state.inspectionUpdate = null;
  state.company = { id: "company-a", name: "Imobiliária A", status: "active" };
  state.subscription = { id: "subscription-a", company_id: "company-a", status: "active", plan_id: "plan-a", expires_at: null };
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("inspection signing credential boundary", () => {
  it("does not expose a signature token to a viewer", async () => {
    const response = await request("GET", "/inspection-a/signatures");

    expect(response.status).toBe(200);
    expect(response.body.signatures).toEqual([
      expect.not.objectContaining({ signature_token: expect.anything() }),
    ]);
  });

  it("does not expose a signature token through the inspection detail bypass", async () => {
    const response = await request("GET", "/inspection-a");

    expect(response.status).toBe(200);
    expect(response.body.signatures).toEqual([
      expect.not.objectContaining({ signature_token: expect.anything() }),
    ]);
  });

  it("does not let a viewer generate a signing invitation", async () => {
    const response = await request("POST", "/inspection-a/signatures/signature-a/invite");

    expect(response.status).toBe(403);
    expect(state.signatureUpdate).toBeNull();
  });

  it("lets a signing-authorized user generate an expiring invitation without embedding the token in the signature", async () => {
    state.permissions = ["inspections.sign"];
    const response = await request("POST", "/inspection-a/signatures/signature-a/invite");

    expect(response.status).toBe(201);
    expect(response.body.signature).not.toHaveProperty("signature_token");
    expect(response.body.invite).toMatchObject({
      url_path: expect.stringMatching(/^\/assinar-vistoria\//),
      expires_at: expect.any(String),
    });
    expect(state.signatureUpdate).toMatchObject({
      signature_token: expect.any(String),
      expires_at: expect.any(String),
    });
  });
});

describe("public inspection signature lifecycle", () => {
  it("keeps a legitimate pending invitation usable without echoing its token", async () => {
    const response = await requestPublic("GET", "/signatures/public-token");

    expect(response.status).toBe(200);
    expect(response.body.signature).not.toHaveProperty("signature_token");
    expect(response.body.signature).toMatchObject({ id: "signature-a", status: "pending" });
  });

  it("preserves the legitimate public signing flow and consumes the pending invitation", async () => {
    const response = await requestPublic("POST", "/signatures/public-token/sign", {
      signature_text: "Pessoa Assinante",
      accepted_terms: true,
    });

    expect(response.status).toBe(200);
    expect(response.body.signature).toMatchObject({ status: "signed", signature_text: "Pessoa Assinante" });
    expect(response.body.signature).not.toHaveProperty("signature_token");
    expect(response.body.inspection).toMatchObject({ status: "completed" });
  });

  it("rejects an expired invitation", async () => {
    state.signature = signatureFixture({ expires_at: "2020-01-01T00:00:00.000Z" });

    const response = await requestPublic("GET", "/signatures/expired-token");

    expect(response.status).toBe(410);
  });

  it.each(["cancelled", "expired"])("rejects a %s signature", async (status) => {
    state.signature = signatureFixture({ status });

    const response = await requestPublic("GET", `/signatures/${status}-token`);

    expect(response.status).toBe(410);
  });

  it.each(["completed", "cancelled", "archived"])("rejects an invitation for a %s inspection", async (status) => {
    state.inspection = { ...state.inspection, status };

    const response = await requestPublic("GET", `/signatures/${status}-inspection-token`);

    expect(response.status).toBe(410);
  });

  it("rejects a token whose signature and inspection belong to different companies", async () => {
    state.signature = signatureFixture({ company_id: "company-b" });

    const response = await requestPublic("GET", "/signatures/cross-company-token");

    expect(response.status).toBe(404);
  });
});

function inspectionTable() {
  const filters = new Map<string, unknown>();
  const lookup = {
    select: () => lookup,
    eq(column: string, value: unknown) {
      filters.set(column, value);
      return lookup;
    },
    async maybeSingle() {
      const inspection = state.inspection;
      const matches = inspection && [...filters].every(([key, value]) => inspection[key] === value);
      return { data: matches ? inspection : null, error: null };
    },
    update(input: Record<string, unknown>) {
      state.inspectionUpdate = input;
      return lookup;
    },
    async single() {
      state.inspection = state.inspection ? { ...state.inspection, ...state.inspectionUpdate } : null;
      return { data: state.inspection, error: null };
    },
  };
  return lookup;
}

function singleRowTable(row: () => Record<string, unknown>) {
  const filters = new Map<string, unknown>();
  const query = {
    select: () => query,
    eq(column: string, value: unknown) {
      filters.set(column, value);
      return query;
    },
    async maybeSingle() {
      const value = row();
      const matches = [...filters].every(([key, expected]) => value[key] === expected);
      return { data: matches ? value : null, error: null };
    },
  };
  return query;
}

function emptyCollectionTable() {
  const query = {
    select: () => query,
    eq: () => query,
    order: async () => ({ data: [], error: null }),
  };
  return query;
}

function signatureTable() {
  let countRequested = false;
  const query = {
    select(_columns?: string, options?: { count?: string; head?: boolean }) {
      countRequested = Boolean(options?.count && options.head);
      return query;
    },
    eq: () => query,
    order: async () => ({ data: state.signature ? [state.signature] : [], error: null }),
    maybeSingle: async () => ({ data: state.signature, error: null }),
    update(input: Record<string, unknown>) {
      state.signatureUpdate = input;
      return query;
    },
    async single() {
      state.signature = state.signature ? { ...state.signature, ...state.signatureUpdate } : null;
      return { data: state.signature, error: null };
    },
    then(resolve: (value: { count?: number; error: null }) => void) {
      resolve({
        ...(countRequested ? { count: state.signature?.status === "pending" ? 1 : 0 } : {}),
        error: null,
      });
    },
  };
  return query;
}

function signatureFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "signature-a",
    company_id: "company-a",
    inspection_id: "inspection-a",
    signer_name: "Pessoa Assinante",
    signer_document: null,
    signer_email: "signer@example.test",
    signer_phone: null,
    signer_role: "tenant",
    status: "pending",
    signature_token: "viewer-must-not-see-this-token",
    signature_url: null,
    signature_text: null,
    signed_at: null,
    ip_address: null,
    signed_user_agent: null,
    signed_payload: {},
    expires_at: "2026-08-12T12:00:00.000Z",
    created_at: "2026-08-05T12:00:00.000Z",
    updated_at: "2026-08-05T12:00:00.000Z",
    ...overrides,
  };
}

async function request(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      access: {
        company: { id: "company-a" },
        appUser: { id: "user-a", role: "viewer", permissions: state.permissions },
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
  return { status: response.status, body: await response.json() as Record<string, any> };
}

async function requestPublic(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use(publicInspectionsRouter);
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
  return { status: response.status, body: await response.json() as Record<string, any> };
}

import type { User } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userRow: null as null | {
    id: string;
    company_id: string;
    name: string;
    email: string;
    status: string;
    companies: { id: string; name: string; status: string } | null;
    roles: { id: string; system_key: string | null; name: string } | null;
  },
}));

const authUser = {
  id: "supabase-user-a",
  email: "usuario@example.test",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date(0).toISOString(),
} as User;

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: authUser }, error: null })),
    },
    from(table: string) {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.userRow, error: null }),
            }),
          }),
        };
      }

      if (table === "role_permissions") {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }

      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  },
  supabaseAuth: {},
}));

import { requireAuth } from "../src/middleware/auth.js";
import { env } from "../src/config/env.js";
import { buildAccessContext } from "../src/services/access-context.js";
import type { RequestWithAccess } from "../src/types/access.js";

const originalAuthConfiguration = {
  provider: env.IMOBIFLOW_AUTH_PROVIDER,
  mysql: env.IMOBIFLOW_MYSQL_AUTH,
  local: env.IMOBIFLOW_LOCAL_DEV_AUTH,
};

beforeEach(() => {
  state.userRow = activeUserRow();
  env.IMOBIFLOW_AUTH_PROVIDER = "supabase";
  env.IMOBIFLOW_MYSQL_AUTH = "false";
  env.IMOBIFLOW_LOCAL_DEV_AUTH = "false";
});

afterEach(() => {
  env.IMOBIFLOW_AUTH_PROVIDER = originalAuthConfiguration.provider;
  env.IMOBIFLOW_MYSQL_AUTH = originalAuthConfiguration.mysql;
  env.IMOBIFLOW_LOCAL_DEV_AUTH = originalAuthConfiguration.local;
});

describe("Supabase authenticated user internal access boundary", () => {
  it("allows only an active internal user linked to an active company", async () => {
    await expect(buildAccessContext(authUser)).resolves.toMatchObject({
      appUser: { id: "supabase-user-a", status: "active" },
      company: { id: "company-a", status: "active" },
    });
  });

  it("rejects a Supabase user that does not exist internally", async () => {
    state.userRow = null;
    await expect(buildAccessContext(authUser)).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(["inactive", "blocked", "deleted"])(
    "rejects an internally %s Supabase user",
    async (status) => {
      state.userRow = { ...activeUserRow(), status };
      await expect(buildAccessContext(authUser)).rejects.toMatchObject({ statusCode: 403 });
    },
  );

  it.each(["inactive", "suspended", "deleted"])(
    "rejects a user linked to a %s company",
    async (status) => {
      state.userRow = {
        ...activeUserRow(),
        companies: { ...activeUserRow().companies!, status },
      };
      await expect(buildAccessContext(authUser)).rejects.toMatchObject({ statusCode: 403 });
    },
  );

  it("rejects a mismatched internal company relationship", async () => {
    state.userRow = {
      ...activeUserRow(),
      companies: { id: "company-b", name: "Empresa B", status: "active" },
    };
    await expect(buildAccessContext(authUser)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects a still-valid Supabase session after the internal user is disabled", async () => {
    state.userRow = { ...activeUserRow(), status: "inactive" };
    const request = {
      headers: { authorization: "Bearer still-valid-supabase-token" },
      hostname: "app.example.test",
      socket: { remoteAddress: "203.0.113.10" },
      get: () => undefined,
    } as unknown as RequestWithAccess;
    const response = {} as Parameters<typeof requireAuth>[1];
    const next = vi.fn();

    await requireAuth(request, response, next);

    expect(request.access).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 403 });
  });
});

function activeUserRow() {
  return {
    id: "supabase-user-a",
    company_id: "company-a",
    name: "Usuário A",
    email: "usuario@example.test",
    status: "active",
    companies: { id: "company-a", name: "Empresa A", status: "active" },
    roles: { id: "role-a", system_key: "broker", name: "Corretor" },
  };
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NETWORK_UNAVAILABLE_CODE } from "./api";
import type { AccessResponse } from "./auth";
import {
  OFFLINE_SESSION_MAX_AGE_MS,
  clearOfflineSessionCache,
  readOfflineSessionCache,
  resolveSessionFailure,
  saveOfflineSessionCache,
} from "./offline-session";

function token(companyId: string, userId: string) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, company_id: companyId })).toString(
    "base64url",
  );
  return `header.${payload}.signature`;
}

function session(companyId: string, userId: string): AccessResponse {
  return {
    session: { access_token: "segredo-que-nao-pode-ser-salvo", refresh_token: "refresh-secreto" },
    access: {
      company: { id: companyId, name: "Empresa", status: "active" },
      appUser: {
        id: userId,
        name: "Ana",
        email: "ana@example.test",
        role: "admin",
        permissions: ["inspections.view"],
      },
      billing: { enforcement: "ENABLED", entitlement: "PAID" },
    },
  };
}

const networkError = Object.assign(new Error("sem rede"), { code: NETWORK_UNAVAILABLE_CODE });
const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    },
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("session guard tolerante a offline", () => {
  it("sem rede, reabre com a sessão em cache do MESMO usuário e empresa, sem apagar o token", () => {
    const tokenA = token("company-a", "user-a");
    saveOfflineSessionCache(session("company-a", "user-a"), tokenA);
    const decision = resolveSessionFailure(networkError, tokenA, { navigatorOnline: false });
    expect(decision.kind).toBe("offline");
    if (decision.kind === "offline") expect(decision.session.access.company?.id).toBe("company-a");
  });

  it("nunca guarda access_token/refresh_token no cache", () => {
    saveOfflineSessionCache(session("company-a", "user-a"), token("company-a", "user-a"));
    const raw = [...memory.values()].join("");
    expect(raw).not.toContain("segredo-que-nao-pode-ser-salvo");
    expect(raw).not.toContain("refresh-secreto");
  });

  it("não reaproveita cache de outra empresa/usuário (troca de tenant)", () => {
    saveOfflineSessionCache(session("company-a", "user-a"), token("company-a", "user-a"));
    expect(readOfflineSessionCache(token("company-b", "user-a"))).toBeNull();
    expect(readOfflineSessionCache(token("company-a", "user-b"))).toBeNull();
    expect(resolveSessionFailure(networkError, token("company-b", "user-b"))).toEqual({
      kind: "login",
      clearToken: false,
    });
  });

  it("não salva cache quando a sessão não corresponde ao token", () => {
    saveOfflineSessionCache(session("company-a", "user-a"), token("company-b", "user-a"));
    expect(memory.size).toBe(0);
  });

  it("sem rede e sem cache: vai ao login mas PRESERVA o token (fila offline continua acessível)", () => {
    expect(resolveSessionFailure(networkError, token("company-a", "user-a"))).toEqual({
      kind: "login",
      clearToken: false,
    });
  });

  it("servidor indisponível (5xx) também não desloga", () => {
    const tokenA = token("company-a", "user-a");
    saveOfflineSessionCache(session("company-a", "user-a"), tokenA);
    expect(
      resolveSessionFailure(Object.assign(new Error("x"), { status: 503 }), tokenA, {
        navigatorOnline: true,
      }).kind,
    ).toBe("offline");
  });

  it("erro de autorização continua limpando o token (comportamento anterior)", () => {
    const tokenA = token("company-a", "user-a");
    saveOfflineSessionCache(session("company-a", "user-a"), tokenA);
    expect(
      resolveSessionFailure(Object.assign(new Error("negado"), { status: 403 }), tokenA, {
        navigatorOnline: true,
      }),
    ).toEqual({ kind: "login", clearToken: true });
  });

  it("cache expira após o prazo máximo", () => {
    const tokenA = token("company-a", "user-a");
    saveOfflineSessionCache(session("company-a", "user-a"), tokenA);
    expect(
      readOfflineSessionCache(tokenA, Date.now() + OFFLINE_SESSION_MAX_AGE_MS + 1000),
    ).toBeNull();
  });

  it("clearOfflineSessionCache remove o cache (usado por clearToken/logout)", () => {
    const tokenA = token("company-a", "user-a");
    saveOfflineSessionCache(session("company-a", "user-a"), tokenA);
    clearOfflineSessionCache();
    expect(readOfflineSessionCache(tokenA)).toBeNull();
  });
});

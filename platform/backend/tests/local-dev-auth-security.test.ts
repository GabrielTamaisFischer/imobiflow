import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { buildLocalDevAccessContext } from "../src/services/local-dev-access.js";

const original = {
  nodeEnv: process.env.NODE_ENV,
  enabled: env.IMOBIFLOW_LOCAL_DEV_AUTH,
  token: env.IMOBIFLOW_LOCAL_DEV_TOKEN,
  companyId: env.IMOBIFLOW_LOCAL_DEV_COMPANY_ID,
  userId: env.IMOBIFLOW_LOCAL_DEV_USER_ID,
  role: env.IMOBIFLOW_LOCAL_DEV_ROLE,
};

const strongToken = "local-development-token-with-at-least-32-characters";
const loopbackSource = { hostname: "localhost", remoteAddress: "127.0.0.1" };

beforeEach(() => {
  process.env.NODE_ENV = "development";
  env.IMOBIFLOW_LOCAL_DEV_AUTH = "true";
  env.IMOBIFLOW_LOCAL_DEV_TOKEN = strongToken;
  env.IMOBIFLOW_LOCAL_DEV_COMPANY_ID = "local-company";
  env.IMOBIFLOW_LOCAL_DEV_USER_ID = "local-user";
  env.IMOBIFLOW_LOCAL_DEV_ROLE = "owner";
});

afterEach(() => {
  process.env.NODE_ENV = original.nodeEnv;
  env.IMOBIFLOW_LOCAL_DEV_AUTH = original.enabled;
  env.IMOBIFLOW_LOCAL_DEV_TOKEN = original.token;
  env.IMOBIFLOW_LOCAL_DEV_COMPANY_ID = original.companyId;
  env.IMOBIFLOW_LOCAL_DEV_USER_ID = original.userId;
  env.IMOBIFLOW_LOCAL_DEV_ROLE = original.role;
});

describe("local development authentication boundary", () => {
  it("rejects the configured local token in staging", () => {
    process.env.NODE_ENV = "staging";
    expect(buildLocalDevAccessContext(strongToken, loopbackSource)).toBeNull();
  });

  it("rejects the configured local token in production", () => {
    process.env.NODE_ENV = "production";
    expect(buildLocalDevAccessContext(strongToken, loopbackSource)).toBeNull();
  });

  it("fails closed when the explicit flag or required identity configuration is absent", () => {
    env.IMOBIFLOW_LOCAL_DEV_AUTH = undefined;
    expect(buildLocalDevAccessContext(strongToken, loopbackSource)).toBeNull();

    env.IMOBIFLOW_LOCAL_DEV_AUTH = "true";
    env.IMOBIFLOW_LOCAL_DEV_ROLE = undefined;
    expect(buildLocalDevAccessContext(strongToken, loopbackSource)).toBeNull();
  });

  it.each(["development", "test"])("allows an explicit %s loopback setup", (runtime) => {
    process.env.NODE_ENV = runtime;
    expect(buildLocalDevAccessContext(strongToken, loopbackSource)).toMatchObject({
      appUser: { id: "local-user", company_id: "local-company", role: "owner" },
      company: { id: "local-company" },
    });
  });

  it("rejects an incorrect or formerly hardcoded token", () => {
    expect(buildLocalDevAccessContext(`${strongToken}-wrong`, loopbackSource)).toBeNull();
    env.IMOBIFLOW_LOCAL_DEV_TOKEN = "imobiflow.local_dev_access";
    expect(buildLocalDevAccessContext("imobiflow.local_dev_access", loopbackSource)).toBeNull();
    env.IMOBIFLOW_LOCAL_DEV_TOKEN = "imobiflow.preview_access";
    expect(buildLocalDevAccessContext("imobiflow.preview_access", loopbackSource)).toBeNull();
  });

  it.each([
    { hostname: "staging.example.com", remoteAddress: "127.0.0.1" },
    { hostname: "localhost", remoteAddress: "10.0.0.12" },
    { hostname: "localhost", remoteAddress: "127.0.0.1", forwardedHost: "preview.example.com" },
    { hostname: "localhost", remoteAddress: "127.0.0.1", forwardedFor: "203.0.113.10" },
  ])("rejects hosted or forwarded request source %#", (source) => {
    expect(buildLocalDevAccessContext(strongToken, source)).toBeNull();
  });
});

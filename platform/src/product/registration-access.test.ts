import { describe, expect, it } from "vitest";
import { isFreeRegistrationUiEnabled } from "./registration-access";

describe("free registration UI flag", () => {
  it("never shows the free registration form in production, even with the flag set", () => {
    expect(
      isFreeRegistrationUiEnabled({ PROD: true, VITE_IMOBIFLOW_REGISTRATION_ENABLED: "true" }),
    ).toBe(false);
  });

  it("stays hidden outside production unless the flag is explicitly enabled", () => {
    expect(isFreeRegistrationUiEnabled({ PROD: false })).toBe(false);
    expect(
      isFreeRegistrationUiEnabled({ PROD: false, VITE_IMOBIFLOW_REGISTRATION_ENABLED: "false" }),
    ).toBe(false);
  });

  it("shows the form only outside production with the flag explicitly on", () => {
    expect(
      isFreeRegistrationUiEnabled({ PROD: false, VITE_IMOBIFLOW_REGISTRATION_ENABLED: "true" }),
    ).toBe(true);
    expect(
      isFreeRegistrationUiEnabled({ PROD: false, VITE_IMOBIFLOW_REGISTRATION_ENABLED: true }),
    ).toBe(true);
  });
});

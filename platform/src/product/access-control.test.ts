import { describe, expect, it } from "vitest";
import {
  isPreviewAccessAllowed,
  isStoredPreviewTokenAllowed,
  previewAccessToken,
} from "./access-control";

describe("preview access control", () => {
  it("blocks preview access in production even when the flag is present", () => {
    expect(
      isPreviewAccessAllowed({
        PROD: true,
        DEV: false,
        VITE_IMOBIFLOW_ENABLE_PREVIEW: "true",
      }),
    ).toBe(false);
  });

  it("allows preview access in local development", () => {
    expect(isPreviewAccessAllowed({ PROD: false, DEV: true })).toBe(true);
  });

  it("rejects stored preview tokens outside allowed environments", () => {
    expect(isStoredPreviewTokenAllowed(previewAccessToken, { PROD: true, DEV: false })).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getStoredToken: vi.fn(),
  isPreviewToken: vi.fn(),
}));

vi.mock("./api", () => ({
  API_URL: "https://api.imobiflow.test",
  API_SETUP_MESSAGE: "api configured for tests",
  apiRequest: mocks.apiRequest,
  getConfiguredApiUrl: vi.fn(() => "https://api.imobiflow.test"),
  isLocalApiUrl: vi.fn(() => false),
  isUnavailableProductionApi: vi.fn(() => false),
}));

vi.mock("./auth", () => ({
  getStoredToken: mocks.getStoredToken,
  isPreviewToken: mocks.isPreviewToken,
}));

import { getPublicSiteProperty } from "./sites";
import { clearBackendTestLab, runBackendTestLab } from "./test-lab";

describe("backend data consistency contracts", () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    mocks.getStoredToken.mockReturnValue("real-session-token");
    mocks.isPreviewToken.mockReturnValue(false);
  });

  it("generates and clears QA data through the authenticated backend", async () => {
    mocks.apiRequest
      .mockResolvedValueOnce({
        batch_id: "qa-company-123",
        created: { properties: 14, media: 42, owners: 6, leads: 4, site_leads: 4 },
        skipped: { properties: 0 },
        totals: { properties: 14 },
      })
      .mockResolvedValueOnce({
        removed: { properties: 14, media: 42, owners: 6, leads: 4, site_leads: 4 },
      });

    await expect(runBackendTestLab()).resolves.toMatchObject({
      batch_id: "qa-company-123",
      created: { properties: 14 },
    });
    expect(mocks.apiRequest).toHaveBeenNthCalledWith(1, "/test-lab/generate", {
      method: "POST",
      token: "real-session-token",
    });

    await expect(clearBackendTestLab()).resolves.toMatchObject({
      removed: { properties: 14 },
    });
    expect(mocks.apiRequest).toHaveBeenNthCalledWith(2, "/test-lab/clear", {
      method: "DELETE",
      token: "real-session-token",
    });
  });

  it("loads public property details by website slug and property slug from the API", async () => {
    const payload = {
      site: { id: "site-1", slug: "magnifico", title: "Magnifico Imoveis" },
      property: {
        id: "property-1",
        slug: "cobertura-alto-padrao",
        code: "QA-0001",
        title: "Cobertura alto padrao",
        price: 2500000,
        media: [{ url: "https://images.unsplash.com/photo-1" }],
      },
      similar_properties: [],
    };

    mocks.apiRequest.mockResolvedValueOnce(payload);

    await expect(getPublicSiteProperty("magnifico", "cobertura-alto-padrao")).resolves.toBe(payload);
    expect(mocks.apiRequest).toHaveBeenCalledWith(
      "/public/sites/magnifico/properties/cobertura-alto-padrao",
    );
  });
});

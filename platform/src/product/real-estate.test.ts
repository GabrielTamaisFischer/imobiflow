import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("./api", () => ({
  apiRequest,
  isUnavailableProductionApi: () => false,
}));

vi.mock("./auth", () => ({
  getStoredToken: () => "test-token",
  isPreviewToken: () => false,
}));

import { buildPropertyListQuery, listAllProperties, listProperties } from "./real-estate";

describe("paginated property client", () => {
  beforeEach(() => apiRequest.mockReset());

  it("requests the first page with the safe defaults", async () => {
    apiRequest.mockResolvedValue(page([], 0, 1, false));
    await listProperties();
    expect(apiRequest).toHaveBeenCalledWith(
      "/real-estate/properties?page=1&page_size=25&status=not_archived",
      { token: "test-token" },
    );
  });

  it("consumes the paginated envelope explicitly", async () => {
    const expected = page([{ id: "property-a" }], 1, 1, false);
    apiRequest.mockResolvedValue(expected);
    await expect(listProperties()).resolves.toEqual(expected);
  });

  it("synchronizes page and filters in the query", () => {
    const query = new URLSearchParams(buildPropertyListQuery({
      page: 3,
      pageSize: 50,
      operation: "sale",
      propertyType: "house",
      status: "available",
      search: "Centro Sul",
    }));
    expect(Object.fromEntries(query)).toMatchObject({
      page: "3",
      page_size: "50",
      operation: "sale",
      property_type: "house",
      status: "available",
      search: "Centro Sul",
    });
  });

  it("escapes code and external identifiers instead of concatenating unsafe query text", () => {
    const query = buildPropertyListQuery({ code: "A&1", importSource: "csv", importExternalId: "EXT=1" });
    expect(query).toContain("code=A%261");
    expect(query).toContain("import_external_id=EXT%3D1");
  });

  it("paginates internally for compatibility consumers without requesting an unlimited response", async () => {
    apiRequest
      .mockResolvedValueOnce(page([{ id: "property-a" }], 2, 1, true, 100))
      .mockResolvedValueOnce(page([{ id: "property-b" }], 2, 2, false, 100));
    const result = await listAllProperties({ status: "available" });
    expect(result.properties.map((property) => property.id)).toEqual(["property-a", "property-b"]);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest.mock.calls.every(([url]) => String(url).includes("page_size=100"))).toBe(true);
  });
});

function page(items: Array<{ id: string }>, total: number, currentPage: number, hasNext: boolean, pageSize = 25) {
  return {
    items,
    pagination: {
      page: currentPage,
      page_size: pageSize,
      total,
      total_pages: total ? Math.ceil(total / pageSize) : 0,
      has_next: hasNext,
      has_previous: currentPage > 1,
    },
  };
}

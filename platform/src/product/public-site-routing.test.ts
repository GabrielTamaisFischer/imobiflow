import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "../routeTree.gen";

function createPublicSiteTestRouter(path: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
    defaultPreloadStaleTime: 0,
  });
}

function activeRouteIds(router: ReturnType<typeof createPublicSiteTestRouter>) {
  return router.state.matches.map((match) => match.routeId);
}

describe("public property route regression", () => {
  it("matches the company index separately from its public layout", async () => {
    const router = createPublicSiteTestRouter("/site/site-a");

    await router.load();

    expect(activeRouteIds(router)).toEqual(["__root__", "/site/$slug", "/site/$slug/"]);
  });

  it("navigates from the company site to property A and then property B", async () => {
    const router = createPublicSiteTestRouter("/site/site-a");
    await router.load();

    await router.navigate({
      to: "/site/$slug/imoveis/$propertySlug",
      params: { slug: "site-a", propertySlug: "qa-a-property-a" },
    });

    expect(router.state.location.pathname).toBe("/site/site-a/imoveis/qa-a-property-a");
    expect(activeRouteIds(router)).toEqual([
      "__root__",
      "/site/$slug",
      "/site/$slug/imoveis/$propertySlug",
    ]);

    await router.navigate({
      to: "/site/$slug/imoveis/$propertySlug",
      params: { slug: "site-a", propertySlug: "qa-b-property-b" },
    });

    expect(router.state.location.pathname).toBe("/site/site-a/imoveis/qa-b-property-b");
    expect(activeRouteIds(router)).not.toContain("/site/$slug/");
  });

  it("matches the property route when a detail URL is loaded directly or reloaded", async () => {
    const detailPath = "/site/site-a/imoveis/qa-a-property-a";
    const firstLoad = createPublicSiteTestRouter(detailPath);
    await firstLoad.load();

    const reload = createPublicSiteTestRouter(firstLoad.state.location.pathname);
    await reload.load();

    for (const router of [firstLoad, reload]) {
      expect(router.state.location.pathname).toBe(detailPath);
      expect(activeRouteIds(router)).toEqual([
        "__root__",
        "/site/$slug",
        "/site/$slug/imoveis/$propertySlug",
      ]);
      expect(activeRouteIds(router)).not.toContain("/site/$slug/");
    }
  });
});

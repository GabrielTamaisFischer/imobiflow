import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("owner profile nested route", () => {
  it("renders the child route instead of covering it with the owner list", async () => {
    const source = await readFile(new URL("../routes/app.proprietarios.tsx", import.meta.url), "utf8");
    expect(source).toContain('routeId === "/app/proprietarios/$ownerId"');
    expect(source).toContain("if (isDetailRoute) return <Outlet />;");
  });
});

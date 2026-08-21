import { describe, expect, it } from "vitest";
import { saoPauloDayBounds } from "../src/services/crm-time.js";

describe("saoPauloDayBounds", () => {
  it("uses São Paulo midnight instead of UTC midnight", () => {
    const { start, end } = saoPauloDayBounds(new Date("2026-08-21T02:30:00.000Z"));
    expect(start.toISOString()).toBe("2026-08-20T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-21T03:00:00.000Z");
  });
});

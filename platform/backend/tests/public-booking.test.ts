import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const route = readFileSync(resolve(root, "backend/src/routes/public-booking.ts"), "utf8");
const app = readFileSync(resolve(root, "backend/src/app.ts"), "utf8");
const ui = readFileSync(resolve(root, "src/routes/site.$slug.agendar.tsx"), "utf8");

describe("Agenda public booking safety", () => {
  it("is mounted without authentication and exposes only safe page data", () => {
    expect(app).toContain('app.use("/public/booking", publicBookingRouter)');
    expect(route).toContain('publicBookingRouter.get("/:siteSlug/:pageId"');
    expect(route).toContain('status: "published"');
    expect(route).toContain('status: "active"');
    expect(route).toContain("function safePage");
    expect(route).not.toContain("email: row.owner");
  });

  it("uses rate limiting, server-side availability, tenant locks and idempotency", () => {
    expect(route).toContain("PUBLIC_BOOKING_RATE_LIMITED");
    expect(route).toContain("withIdempotency");
    expect(route).toContain("FOR UPDATE");
    expect(route).toContain("public.booking.create");
    expect(route).toContain("publicSlots(page, input.starts_at, tx)");
  });

  it("offers a public mobile-first reservation form", () => {
    expect(ui).toContain("Confirmar solicitação");
    expect(ui).toContain("getPublicBooking");
    expect(ui).toContain("createPublicBooking");
    expect(ui).toContain("type=\"email\"");
  });
});

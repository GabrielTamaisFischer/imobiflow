import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const crm = readFileSync(resolve(root, "backend/src/routes/crm.ts"), "utf8");
const notifications = readFileSync(resolve(root, "backend/src/routes/notifications.ts"), "utf8");

describe("Agenda runtime wiring", () => {
  it("keeps user search paginated, tenant scoped and CRECI-aware", () => {
    expect(crm).toContain('crmRouter.get("/users"');
    expect(crm).toContain("page_size");
    expect(crm).toContain("req.access!.company.id");
    expect(crm).toContain("creciNumber");
    expect(crm).toContain("pagination");
  });

  it("supports marking notification events read within the authenticated company", () => {
    expect(notifications).toContain('"/events/:id/read"');
    expect(notifications).toContain('requirePermission("notifications.view")');
    expect(notifications).toContain('.eq("company_id", companyId)');
    expect(notifications).toContain('status: "read"');
  });
});

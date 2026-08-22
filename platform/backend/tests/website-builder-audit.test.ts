import { describe, expect, it, vi } from "vitest";
import { createWebsiteBuilderAuditLog } from "../src/services/website-builder-audit.js";

describe("Website Builder audit logs", () => {
  it("persists audit metadata with company and actor context", async () => {
    const create = vi.fn().mockResolvedValue({});
    const req = {
      access: {
        company: { id: "company-1" },
        appUser: { id: "user-1" },
      },
      ip: "127.0.0.1",
      get: vi.fn().mockReturnValue("vitest-agent"),
    };

    await createWebsiteBuilderAuditLog(
      { websiteAuditLog: { create } } as never,
      req as never,
      {
        action: "website_created",
        entityType: "website",
        entityId: "website-1",
        websiteId: "website-1",
        summary: "Site criado",
        metadata: { slug: "site-criado" },
      },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: "company-1",
        actorUserId: "user-1",
        action: "website_created",
        entityType: "website",
        entityId: "website-1",
        websiteId: "website-1",
        summary: "Site criado",
        metadataJson: { slug: "site-criado" },
        ipAddress: "127.0.0.1",
        userAgent: "vitest-agent",
      }),
    });
  });

  it("requires company context before writing logs", async () => {
    await expect(
      createWebsiteBuilderAuditLog({ websiteAuditLog: { create: vi.fn() } } as never, { access: null } as never, {
        action: "website_updated",
        entityType: "website",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

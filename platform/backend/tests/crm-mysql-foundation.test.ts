import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { ensureDefaultCrmPipeline } from "../src/services/crm-bootstrap.js";

const existingPipeline = {
  id: "pipeline-a",
  companyId: "company-a",
  name: "Funil comercial",
  isDefault: true,
  status: "active",
  createdAt: new Date(),
};

function databaseWith(pipeline: typeof existingPipeline | null) {
  return {
    crmPipeline: {
      findFirst: vi.fn(async () => pipeline),
      create: vi.fn(async () => existingPipeline),
    },
    crmStage: {
      findMany: vi.fn(async () => [
        { id: "stage-new", name: "Novo lead", position: 1, probability: 10, color: "#8b5cf6", status: "active" },
        { id: "stage-contact", name: "Atendimento", position: 2, probability: 25, color: "#06b6d4", status: "active" },
      ]),
    },
  };
}

describe("CRM MySQL foundation", () => {
  it("creates the default company pipeline once and returns ordered stages", async () => {
    const database = databaseWith(null);
    const result = await ensureDefaultCrmPipeline("company-a", null, database as never);

    expect(database.crmPipeline.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ companyId: "company-a", isDefault: true }),
    }));
    expect(result.stages.map((stage) => stage.name)).toEqual(["Novo lead", "Atendimento"]);
    expect(result.pipeline.is_default).toBe(true);
  });

  it("does not duplicate an existing default pipeline", async () => {
    const database = databaseWith(existingPipeline);
    await ensureDefaultCrmPipeline("company-a", null, database as never);
    expect(database.crmPipeline.create).not.toHaveBeenCalled();
    expect(database.crmStage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: "company-a", pipelineId: "pipeline-a", status: "active" }),
    }));
  });

  it("keeps CRM 3.1 routes on MySQL/Prisma and scopes operations to the session company", async () => {
    const source = await readFile(new URL("../src/routes/crm.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/supabase/i);
    expect(source).toContain("requireAuth, requireCompany, requireActiveSubscription");
    expect(source).toContain('requirePermission("crm.view")');
    expect(source).toContain('requirePermission("crm.manage")');
    expect(source).toContain("where:{id:req.params.id,companyId}");
    expect(source).toContain("where:{id:stageId,companyId,status:\"active\"}");
    expect(source).toContain("where:{id:userId,companyId,status:\"active\"}");
  });
});

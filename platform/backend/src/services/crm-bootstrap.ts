import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";

const defaultStages = [
  { name: "Novo lead", position: 1, probability: 10, color: "#8b5cf6" },
  { name: "Atendimento", position: 2, probability: 25, color: "#06b6d4" },
  { name: "Visita", position: 3, probability: 45, color: "#22c55e" },
  { name: "Proposta", position: 4, probability: 70, color: "#f59e0b" },
  { name: "Fechamento", position: 5, probability: 90, color: "#ef4444" },
];

function serializePipeline(pipeline: { id: string; name: string; isDefault: boolean; status: string }) {
  return { id: pipeline.id, name: pipeline.name, is_default: pipeline.isDefault, status: pipeline.status };
}

function serializeStage(stage: { id: string; name: string; position: number; probability: number; color: string | null; status: string }) {
  return { id: stage.id, name: stage.name, position: stage.position, probability: stage.probability, color: stage.color, status: stage.status };
}

export async function ensureDefaultCrmPipeline(
  companyId: string,
  _userId?: string | null,
  prisma: Pick<PrismaClient, "crmPipeline" | "crmStage"> = getPrisma(),
) {
  let pipeline = await prisma.crmPipeline.findFirst({ where: { companyId, isDefault: true }, orderBy: { createdAt: "asc" } });
  if (!pipeline) {
    try {
      pipeline = await prisma.crmPipeline.create({
        data: {
          companyId,
          name: "Funil comercial",
          isDefault: true,
          status: "active",
          stages: { create: defaultStages.map((stage) => ({ companyId, ...stage, status: "active" })) },
        },
      });
    } catch (error) {
      pipeline = await prisma.crmPipeline.findFirst({ where: { companyId, isDefault: true }, orderBy: { createdAt: "asc" } });
      if (!pipeline) throw error;
    }
  }
  const stages = await prisma.crmStage.findMany({
    where: { companyId, pipelineId: pipeline.id, status: "active" },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  return { pipeline: serializePipeline(pipeline), stages: stages.map(serializeStage) };
}

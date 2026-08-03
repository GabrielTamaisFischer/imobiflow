import { supabaseAdmin } from "../lib/supabase.js";

export type CrmStage = {
  id: string;
  company_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  color: string | null;
  status: string;
};

export type CrmPipeline = {
  id: string;
  company_id: string;
  name: string;
  is_default: boolean;
  status: string;
};

const defaultStages = [
  { name: "Novo lead", position: 1, probability: 10, color: "#8b5cf6" },
  { name: "Atendimento", position: 2, probability: 25, color: "#06b6d4" },
  { name: "Visita", position: 3, probability: 45, color: "#22c55e" },
  { name: "Proposta", position: 4, probability: 70, color: "#f59e0b" },
  { name: "Fechamento", position: 5, probability: 90, color: "#ef4444" },
];

export async function ensureDefaultCrmPipeline(companyId: string, userId?: string | null) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("crm_pipelines")
    .select("id, company_id, name, is_default, status")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle<CrmPipeline>();

  if (existingError) throw existingError;

  const pipeline = existing ?? (await createDefaultCrmPipeline(companyId, userId));

  const { data: stages, error: stagesError } = await supabaseAdmin
    .from("crm_stages")
    .select("id, company_id, pipeline_id, name, position, probability, color, status")
    .eq("company_id", companyId)
    .eq("pipeline_id", pipeline.id)
    .eq("status", "active")
    .order("position", { ascending: true })
    .returns<CrmStage[]>();

  if (stagesError) throw stagesError;

  return {
    pipeline,
    stages: stages ?? [],
  };
}

export async function createDefaultCrmPipeline(companyId: string, userId?: string | null) {
  const { data: pipeline, error: pipelineError } = await supabaseAdmin
    .from("crm_pipelines")
    .insert({
      company_id: companyId,
      name: "Funil comercial",
      is_default: true,
      status: "active",
      created_by: userId,
    })
    .select("id, company_id, name, is_default, status")
    .single<CrmPipeline>();

  if (pipelineError) throw pipelineError;

  const { error: stagesError } = await supabaseAdmin.from("crm_stages").insert(
    defaultStages.map((stage) => ({
      company_id: companyId,
      pipeline_id: pipeline.id,
      ...stage,
      status: "active",
    })),
  );

  if (stagesError) throw stagesError;

  return pipeline;
}

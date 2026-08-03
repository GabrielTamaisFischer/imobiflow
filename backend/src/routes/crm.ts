import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { ensureDefaultCrmPipeline } from "../services/crm-bootstrap.js";
import type { RequestWithAccess } from "../types/access.js";

export const crmRouter = Router();

crmRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const leadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(3).optional().or(z.literal("")),
  source: z.string().max(80).optional().or(z.literal("")),
  interest_type: z.enum(["sale", "rent", "both", "not_defined"]).default("not_defined"),
  stage_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  budget_cents: z.number().int().nonnegative().optional(),
  property_reference: z.string().max(160).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
  next_follow_up_at: z.string().datetime().optional().or(z.literal("")),
});

const updateLeadSchema = leadSchema.partial().extend({
  status: z.enum(["open", "won", "lost", "archived"]).optional(),
  last_contact_at: z.string().datetime().optional().or(z.literal("")),
});

const noteSchema = z.object({
  body: z.string().min(1).max(4000),
  visibility: z.enum(["internal", "shared"]).default("internal"),
});

const taskSchema = z.object({
  title: z.string().min(2).max(180),
  due_at: z.string().datetime().optional().or(z.literal("")),
  assigned_to: z.string().uuid().optional(),
});

const stageMoveSchema = z.object({
  stage_id: z.string().uuid(),
});

function cleanEmpty<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? null : value]),
  );
}

async function ensureStageBelongsToCompany(stageId: string | undefined, companyId: string) {
  if (!stageId) return null;

  const { data, error } = await supabaseAdmin
    .from("crm_stages")
    .select("id")
    .eq("id", stageId)
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Etapa do funil inválida para esta empresa."), {
      statusCode: 422,
      code: "INVALID_STAGE",
    });
  }

  return data.id;
}

crmRouter.get("/pipeline", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const userId = req.access!.appUser.id;
    res.json(await ensureDefaultCrmPipeline(companyId, userId));
  } catch (error) {
    next(error);
  }
});

crmRouter.get("/leads", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const status = typeof req.query.status === "string" ? req.query.status : "open";

    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(
        "id, company_id, stage_id, assigned_to, name, email, phone, source, interest_type, status, budget_cents, property_reference, notes, last_contact_at, next_follow_up_at, created_at, updated_at",
      )
      .eq("company_id", companyId)
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ leads: data ?? [] });
  } catch (error) {
    next(error);
  }
});

crmRouter.post("/leads", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const userId = req.access!.appUser.id;
    const input = leadSchema.parse(req.body);
    const pipeline = await ensureDefaultCrmPipeline(companyId, userId);
    const defaultStage = pipeline.stages[0]?.id;
    const stageId = await ensureStageBelongsToCompany(input.stage_id ?? defaultStage, companyId);

    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .insert({
        ...cleanEmpty(input),
        company_id: companyId,
        stage_id: stageId,
        created_by: userId,
      })
      .select(
        "id, company_id, stage_id, assigned_to, name, email, phone, source, interest_type, status, budget_cents, property_reference, notes, last_contact_at, next_follow_up_at, created_at, updated_at",
      )
      .single();

    if (error) throw error;

    await supabaseAdmin.from("lead_events").insert({
      company_id: companyId,
      lead_id: lead.id,
      user_id: userId,
      event_type: "lead.created",
      payload: { source: lead.source, stage_id: lead.stage_id },
    });

    res.status(201).json({ lead });
  } catch (error) {
    next(error);
  }
});

crmRouter.patch("/leads/:id", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const userId = req.access!.appUser.id;
    const input = updateLeadSchema.parse(req.body);

    if (input.stage_id) {
      await ensureStageBelongsToCompany(input.stage_id, companyId);
    }

    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .update(cleanEmpty(input))
      .eq("id", req.params.id)
      .eq("company_id", companyId)
      .select(
        "id, company_id, stage_id, assigned_to, name, email, phone, source, interest_type, status, budget_cents, property_reference, notes, last_contact_at, next_follow_up_at, created_at, updated_at",
      )
      .single();

    if (error) throw error;

    await supabaseAdmin.from("lead_events").insert({
      company_id: companyId,
      lead_id: lead.id,
      user_id: userId,
      event_type: "lead.updated",
      payload: cleanEmpty(input),
    });

    res.json({ lead });
  } catch (error) {
    next(error);
  }
});

crmRouter.patch(
  "/leads/:id/stage",
  requirePermission("crm.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = stageMoveSchema.parse(req.body);
      const stageId = await ensureStageBelongsToCompany(input.stage_id, companyId);

      const { data: currentLead, error: currentLeadError } = await supabaseAdmin
        .from("leads")
        .select("id, stage_id")
        .eq("id", req.params.id)
        .eq("company_id", companyId)
        .single<{ id: string; stage_id: string | null }>();

      if (currentLeadError) throw currentLeadError;

      const { data: lead, error } = await supabaseAdmin
        .from("leads")
        .update({ stage_id: stageId, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .eq("company_id", companyId)
        .select(
          "id, company_id, stage_id, assigned_to, name, email, phone, source, interest_type, status, budget_cents, property_reference, notes, last_contact_at, next_follow_up_at, created_at, updated_at",
        )
        .single();

      if (error) throw error;

      await supabaseAdmin.from("lead_events").insert({
        company_id: companyId,
        lead_id: lead.id,
        user_id: userId,
        event_type: "lead.stage_changed",
        payload: {
          from_stage_id: currentLead.stage_id,
          to_stage_id: stageId,
        },
      });

      res.json({ lead });
    } catch (error) {
      next(error);
    }
  },
);

crmRouter.post(
  "/leads/:id/notes",
  requirePermission("crm.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = noteSchema.parse(req.body);

      const { data: note, error } = await supabaseAdmin
        .from("lead_notes")
        .insert({
          company_id: companyId,
          lead_id: req.params.id,
          user_id: userId,
          ...input,
        })
        .select("id, company_id, lead_id, user_id, body, visibility, created_at")
        .single();

      if (error) throw error;

      res.status(201).json({ note });
    } catch (error) {
      next(error);
    }
  },
);

crmRouter.post(
  "/leads/:id/tasks",
  requirePermission("crm.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = taskSchema.parse(req.body);

      const { data: task, error } = await supabaseAdmin
        .from("lead_tasks")
        .insert({
          ...cleanEmpty(input),
          company_id: companyId,
          lead_id: req.params.id,
          created_by: userId,
        })
        .select("id, company_id, lead_id, assigned_to, title, due_at, status, created_at, updated_at")
        .single();

      if (error) throw error;

      res.status(201).json({ task });
    } catch (error) {
      next(error);
    }
  },
);

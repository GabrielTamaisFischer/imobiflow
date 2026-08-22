import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { RequestWithAccess } from "../types/access.js";

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const appointmentSelect =
  "id, company_id, lead_id, property_id, assigned_to, created_by, appointment_type, title, description, location_text, starts_at, ends_at, reminder_at, status, result_notes, completed_at, metadata, created_at, updated_at, leads(id, name, phone, email), properties(id, title, code, street, number, neighborhood, city, state), users(id, name, email)";

const appointmentSchema = z.object({
  lead_id: z.string().uuid().optional().nullable().or(z.literal("")),
  property_id: z.string().uuid().optional().nullable().or(z.literal("")),
  assigned_to: z.string().uuid().optional().nullable().or(z.literal("")),
  appointment_type: z
    .enum(["visit", "return", "meeting", "inspection", "signature", "follow_up"])
    .default("visit"),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  location_text: z.string().trim().max(300).optional().or(z.literal("")),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().optional().nullable().or(z.literal("")),
  reminder_at: z.string().datetime().optional().nullable().or(z.literal("")),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const appointmentStatusSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "rescheduled", "no_show"]),
  result_notes: z.string().trim().max(1000).optional().or(z.literal("")),
  next_follow_up_at: z.string().datetime().optional().nullable().or(z.literal("")),
});

const appointmentUpdateSchema = appointmentSchema
  .partial()
  .extend({
    status: z
      .enum(["scheduled", "confirmed", "completed", "cancelled", "rescheduled", "no_show"])
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

appointmentsRouter.get(
  "/",
  requirePermission("appointments.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const status = readQuery(req.query.status);
      const from = readQuery(req.query.from);
      const to = readQuery(req.query.to);

      let query = supabaseAdmin
        .from("appointments")
        .select(appointmentSelect)
        .eq("company_id", companyId)
        .order("starts_at", { ascending: true });

      if (status && status !== "all") query = query.eq("status", status);
      if (from) query = query.gte("starts_at", from);
      if (to) query = query.lte("starts_at", to);

      const { data, error } = await query.limit(300);
      if (error) throw error;

      res.json({ appointments: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.post(
  "/",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = appointmentSchema.parse(req.body);

      const leadId = await ensureLinkedRecord(
        "leads",
        nullable(input.lead_id),
        companyId,
        "LEAD_NOT_FOUND",
      );
      const propertyId = await ensureLinkedRecord(
        "properties",
        nullable(input.property_id),
        companyId,
        "PROPERTY_NOT_FOUND",
      );
      const assignedTo = await ensureLinkedRecord(
        "users",
        nullable(input.assigned_to),
        companyId,
        "USER_NOT_FOUND",
      );

      const { data: appointment, error } = await supabaseAdmin
        .from("appointments")
        .insert({
          company_id: companyId,
          lead_id: leadId,
          property_id: propertyId,
          assigned_to: assignedTo,
          created_by: userId,
          appointment_type: input.appointment_type,
          title: input.title,
          description: input.description || null,
          location_text: input.location_text || null,
          starts_at: input.starts_at,
          ends_at: nullable(input.ends_at),
          reminder_at: nullable(input.reminder_at),
          metadata: input.metadata ?? {},
          status: "scheduled",
        })
        .select(appointmentSelect)
        .single();

      if (error) throw error;

      if (leadId) {
        await createLeadEvent({
          companyId,
          leadId,
          userId,
          eventType: "appointment.created",
          payload: {
            appointment_id: appointment.id,
            appointment_type: input.appointment_type,
            starts_at: input.starts_at,
            property_id: propertyId,
          },
        });
      }

      res.status(201).json({ appointment });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.patch(
  "/:id",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const appointmentId = readParam(req.params.id);
      const input = appointmentUpdateSchema.parse(req.body);
      const current = await ensureAppointment(appointmentId, companyId);

      const leadId =
        "lead_id" in input
          ? await ensureLinkedRecord("leads", nullable(input.lead_id), companyId, "LEAD_NOT_FOUND")
          : undefined;
      const propertyId =
        "property_id" in input
          ? await ensureLinkedRecord("properties", nullable(input.property_id), companyId, "PROPERTY_NOT_FOUND")
          : undefined;
      const assignedTo =
        "assigned_to" in input
          ? await ensureLinkedRecord("users", nullable(input.assigned_to), companyId, "USER_NOT_FOUND")
          : undefined;

      const updates: Record<string, unknown> = {};
      if ("lead_id" in input) updates.lead_id = leadId;
      if ("property_id" in input) updates.property_id = propertyId;
      if ("assigned_to" in input) updates.assigned_to = assignedTo;
      if (input.appointment_type) updates.appointment_type = input.appointment_type;
      if (input.title) updates.title = input.title;
      if ("description" in input) updates.description = input.description || null;
      if ("location_text" in input) updates.location_text = input.location_text || null;
      if (input.starts_at) updates.starts_at = input.starts_at;
      if ("ends_at" in input) updates.ends_at = nullable(input.ends_at);
      if ("reminder_at" in input) updates.reminder_at = nullable(input.reminder_at);
      if (input.status) updates.status = input.status;
      if (input.metadata) updates.metadata = input.metadata;

      const { data: appointment, error } = await supabaseAdmin
        .from("appointments")
        .update(updates)
        .eq("id", appointmentId)
        .eq("company_id", companyId)
        .select(appointmentSelect)
        .single();

      if (error) throw error;

      const eventLeadId = appointment.lead_id ?? current.lead_id;
      if (eventLeadId) {
        await createLeadEvent({
          companyId,
          leadId: eventLeadId,
          userId,
          eventType: "appointment.updated",
          payload: {
            appointment_id: appointmentId,
            changed_fields: Object.keys(updates),
          },
        });
      }

      res.json({ appointment });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.patch(
  "/:id/status",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const appointmentId = readParam(req.params.id);
      const input = appointmentStatusSchema.parse(req.body);
      const current = await ensureAppointment(appointmentId, companyId);
      const now = new Date().toISOString();

      const { data: appointment, error } = await supabaseAdmin
        .from("appointments")
        .update({
          status: input.status,
          result_notes: input.result_notes || current.result_notes,
          completed_at: input.status === "completed" ? now : current.completed_at,
        })
        .eq("id", appointmentId)
        .eq("company_id", companyId)
        .select(appointmentSelect)
        .single();

      if (error) throw error;

      if (current.lead_id) {
        await createLeadEvent({
          companyId,
          leadId: current.lead_id,
          userId,
          eventType: "appointment.status_changed",
          payload: {
            appointment_id: appointmentId,
            from_status: current.status,
            to_status: input.status,
            result_notes: input.result_notes || null,
          },
        });

        if (input.status === "completed") {
          await createPostVisitFollowUp({
            companyId,
            leadId: current.lead_id,
            assignedTo: current.assigned_to,
            userId,
            dueAt: nullable(input.next_follow_up_at) ?? addDaysIso(now, 1),
          });
        }
      }

      res.json({ appointment });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.delete(
  "/:id",
  requirePermission("appointments.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const appointmentId = readParam(req.params.id);
      const current = await ensureAppointment(appointmentId, companyId);

      const { error } = await supabaseAdmin
        .from("appointments")
        .delete()
        .eq("id", appointmentId)
        .eq("company_id", companyId);

      if (error) throw error;

      if (current.lead_id) {
        await createLeadEvent({
          companyId,
          leadId: current.lead_id,
          userId,
          eventType: "appointment.deleted",
          payload: { appointment_id: appointmentId },
        });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

async function ensureAppointment(id: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("id, company_id, lead_id, assigned_to, status, result_notes, completed_at")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string;
      lead_id: string | null;
      assigned_to: string | null;
      status: string;
      result_notes: string | null;
      completed_at: string | null;
    }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Compromisso nao encontrado."), {
      statusCode: 404,
      code: "APPOINTMENT_NOT_FOUND",
    });
  }

  return data;
}

async function ensureLinkedRecord(
  table: "leads" | "properties" | "users",
  id: string | null,
  companyId: string,
  code: string,
) {
  if (!id) return null;

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Registro vinculado invalido para esta empresa."), {
      statusCode: 422,
      code,
    });
  }

  return data.id;
}

async function createLeadEvent(input: {
  companyId: string;
  leadId: string;
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("lead_events").insert({
    company_id: input.companyId,
    lead_id: input.leadId,
    user_id: input.userId,
    event_type: input.eventType,
    payload: input.payload,
  });

  if (error) throw error;
}

async function createPostVisitFollowUp(input: {
  companyId: string;
  leadId: string;
  assignedTo: string | null;
  userId: string;
  dueAt: string;
}) {
  const { error } = await supabaseAdmin.from("lead_tasks").insert({
    company_id: input.companyId,
    lead_id: input.leadId,
    assigned_to: input.assignedTo,
    created_by: input.userId,
    title: "Follow-up pos-visita",
    due_at: input.dueAt,
    status: "pending",
  });

  if (error) throw error;
}

function nullable(value: string | null | undefined) {
  return value && value.length > 0 ? value : null;
}

function readParam(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    throw Object.assign(new Error("Parametro de rota invalido."), { statusCode: 400 });
  }

  return value;
}

function readQuery(value: unknown) {
  return typeof value === "string" ? value : null;
}

function addDaysIso(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

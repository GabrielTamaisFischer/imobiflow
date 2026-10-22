import { Router } from "express";
import { requireActiveSubscription, requireAuth, requireCompany, requireRole } from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import type { RequestWithAccess } from "../types/access.js";

/**
 * TEMPORARY, READ-ONLY diagnostic route.
 *
 * Purpose: investigate why two specific inspections were unexpectedly
 * archived during staging homologation (2026-10-22). Hardcoded to those two
 * inspection IDs on purpose — this route must never accept client-supplied
 * IDs, must never write anything, and must be removed once the evidence is
 * captured. See project chat history for the full investigation context.
 *
 * Safety:
 * - requireAuth + requireCompany + requireActiveSubscription (same chain as
 *   every other inspections route) + requireRole("owner","admin","manager").
 * - Scoped to the authenticated request's own companyId — never cross-tenant.
 * - Only `findMany`/`findFirst` reads. No create/update/delete/upsert.
 * - Never returns passwordHash or any credential field.
 */

export const inspectionArchiveDiagnosticRouter = Router();

inspectionArchiveDiagnosticRouter.use(
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requireRole("owner", "admin", "manager"),
);

const DIAGNOSTIC_INSPECTION_IDS = [
  "bcb6f66b-f872-475e-91ef-c760c1c12327",
  "67ce05e5-5d84-4f8c-99be-0291dfaf8a4e",
] as const;

inspectionArchiveDiagnosticRouter.get("/", async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const prisma = getPrisma();

    const inspections = await prisma.inspection.findMany({
      where: { id: { in: [...DIAGNOSTIC_INSPECTION_IDS] }, companyId },
      select: {
        id: true,
        companyId: true,
        propertyId: true,
        status: true,
        version: true,
        createdBy: true,
        assignedUserId: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        archivedAt: true,
      },
    });

    const foundIds = inspections.map((i) => i.id);

    const events = await prisma.inspectionEvent.findMany({
      where: { inspectionId: { in: foundIds }, companyId },
      orderBy: [{ inspectionId: "asc" }, { createdAt: "asc" }],
      select: {
        inspectionId: true,
        actorId: true,
        eventType: true,
        metadataJson: true,
        createdAt: true,
      },
    });

    const actorIds = events.map((e) => e.actorId).filter((v): v is string => Boolean(v));
    const createdByIds = inspections.map((i) => i.createdBy).filter((v): v is string => Boolean(v));
    const assignedIds = inspections.map((i) => i.assignedUserId).filter((v): v is string => Boolean(v));
    const userIds = [...new Set([...actorIds, ...createdByIds, ...assignedIds])];

    const users = await prisma.appUser.findMany({
      where: { id: { in: userIds }, companyId },
      select: {
        id: true,
        companyId: true,
        name: true,
        email: true,
        role: true,
        status: true,
        isSynthetic: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    const timeline = inspections.map((inspection) => ({
      inspection,
      events: events.filter((e) => e.inspectionId === inspection.id),
    }));

    return res.json({
      note: "TEMPORARY READ-ONLY diagnostic. Remove this route after the investigation closes.",
      requestedIds: DIAGNOSTIC_INSPECTION_IDS,
      foundIds,
      timeline,
      users,
    });
  } catch (error) {
    return next(error);
  }
});

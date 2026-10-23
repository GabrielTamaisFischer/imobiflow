import { describe, expect, it } from "vitest";
import {
  buildInspectionKpis,
  isContinuableInspection,
  isPendingThisWeek,
  sortByRecentUpdate,
} from "./inspection-dashboard";
import type { MysqlInspection } from "./inspections";

function makeInspection(overrides: Partial<MysqlInspection> = {}): MysqlInspection {
  return {
    id: "inspection-1",
    property_id: "property-1",
    assigned_user_id: null,
    created_by: "user-1",
    type: "entry",
    status: "draft",
    notes: null,
    version: 1,
    completed_at: null,
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rooms: [],
    ...overrides,
  };
}

describe("buildInspectionKpis", () => {
  it("maps real status counts onto the 4 home KPIs", () => {
    const kpis = buildInspectionKpis({ draft: 3, in_progress: 2, completed: 5, archived: 1 });
    expect(kpis.find((kpi) => kpi.key === "draft")?.value).toBe(3);
    expect(kpis.find((kpi) => kpi.key === "in_progress")?.value).toBe(2);
    expect(kpis.find((kpi) => kpi.key === "completed")?.value).toBe(5);
  });

  it("usa o pendingCount real (aproximação sobre dados reais, não um status novo) no KPI de pendências", () => {
    const kpis = buildInspectionKpis({ draft: 1 }, 4);
    const pendingKpi = kpis.find((kpi) => kpi.key === "pending");
    expect(pendingKpi?.value).toBe(4);
    expect(pendingKpi?.availability).toBe("real");
  });

  it("pendingCount default é 0 quando omitido", () => {
    const kpis = buildInspectionKpis({ draft: 1 });
    expect(kpis.find((kpi) => kpi.key === "pending")?.value).toBe(0);
  });

  it("defaults missing real counts to 0 instead of leaving them undefined", () => {
    const kpis = buildInspectionKpis({});
    expect(kpis.find((kpi) => kpi.key === "draft")?.value).toBe(0);
    expect(kpis.find((kpi) => kpi.key === "completed")?.value).toBe(0);
  });
});

describe("isContinuableInspection", () => {
  it("treats draft and in_progress as continuable", () => {
    expect(isContinuableInspection(makeInspection({ status: "draft" }))).toBe(true);
    expect(isContinuableInspection(makeInspection({ status: "in_progress" }))).toBe(true);
  });

  it("treats completed and archived as not continuable", () => {
    expect(isContinuableInspection(makeInspection({ status: "completed" }))).toBe(false);
    expect(isContinuableInspection(makeInspection({ status: "archived" }))).toBe(false);
  });
});

describe("isPendingThisWeek", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");

  it("flags a mutable inspection created within the last 7 days", () => {
    const inspection = makeInspection({ status: "draft", created_at: "2026-10-18T00:00:00.000Z" });
    expect(isPendingThisWeek(inspection, now)).toBe(true);
  });

  it("does not flag an inspection created more than 7 days ago", () => {
    const inspection = makeInspection({ status: "in_progress", created_at: "2026-10-01T00:00:00.000Z" });
    expect(isPendingThisWeek(inspection, now)).toBe(false);
  });

  it("does not flag a completed inspection even if created this week", () => {
    const inspection = makeInspection({ status: "completed", created_at: "2026-10-21T00:00:00.000Z" });
    expect(isPendingThisWeek(inspection, now)).toBe(false);
  });
});

describe("sortByRecentUpdate", () => {
  it("orders by updated_at descending without mutating the input array", () => {
    const older = makeInspection({ id: "a", updated_at: "2026-10-01T00:00:00.000Z" });
    const newer = makeInspection({ id: "b", updated_at: "2026-10-20T00:00:00.000Z" });
    const input = [older, newer];
    const sorted = sortByRecentUpdate(input);
    expect(sorted.map((item) => item.id)).toEqual(["b", "a"]);
    expect(input.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

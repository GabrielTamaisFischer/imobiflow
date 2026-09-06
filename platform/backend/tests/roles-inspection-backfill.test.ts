import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { brokerResourceScopedPermissions, roleTemplates } from "../src/services/roles.js";

const migrationPath = new URL(
  "../../prisma/migrations/202609060001_fase_5b_backfill_broker_inspection_permissions/migration.sql",
  import.meta.url,
);

describe("F5B Broker inspection permission backfill", () => {
  it("keeps inspection permissions in the canonical Broker resource-scoped set", () => {
    expect(brokerResourceScopedPermissions).toEqual(expect.arrayContaining(["inspections.view", "inspections.manage"]));
    const broker = roleTemplates.find((role) => role.systemKey === "broker");
    expect(broker?.permissions).toEqual(expect.arrayContaining(["inspections.view", "inspections.manage"]));
  });

  it("inserts only missing Broker assignments and preserves existing scopes", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("INSERT INTO `role_permissions`");
    expect(sql).toContain("existing.`role_id` IS NULL");
    expect(sql).toContain("r.`system_key` = 'broker'");
    expect(sql).toContain("'shared'");
    expect(sql).not.toMatch(/UPDATE\s+`role_permissions`/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+`role_permissions`/i);
  });

  it("is idempotent by checking the canonical role/permission key", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("LEFT JOIN `role_permissions` existing");
    expect(sql).toContain("existing.`permission_id` = p.`id`");
    expect(sql).toContain("existing.`role_id` IS NULL");
  });

  it("does not alter non-Broker roles", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("WHERE r.`system_key` = 'broker'");
    expect(sql).not.toContain("system_key` <> 'broker'");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { brokerResourceScopedPermissions, roleTemplates } from "../src/services/roles.js";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../prisma/migrations/202609100002_fase_7a2_reconcile_broker_appointment_permissions/migration.sql"),
  "utf8",
);

describe("F7A.2 — reconciliação RBAC de Broker", () => {
  it("mantém appointments como permissões resource-scoped do Broker", () => {
    const broker = roleTemplates.find((role) => role.systemKey === "broker");
    expect(broker?.permissions).toEqual(expect.arrayContaining(["appointments.view", "appointments.manage"]));
    expect(brokerResourceScopedPermissions).toEqual(expect.arrayContaining(["appointments.view", "appointments.manage"]));
  });

  it("insere somente permissões ausentes com scope shared", () => {
    expect(migration).toContain("INSERT IGNORE INTO role_permissions");
    expect(migration).toContain("'shared'");
    expect(migration).toContain("existing.role_id IS NULL");
    expect(migration).toContain("r.system_key = 'broker'");
    expect(migration).toContain("'appointments.view', 'appointments.manage'");
  });

  it("reconcilia apenas company para shared e não remove dados", () => {
    expect(migration).toContain("rp.scope = 'company'");
    expect(migration).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
    expect(migration).toContain("UPDATE role_permissions rp");
    expect(migration).toContain("SET rp.scope = 'shared'");
  });
});

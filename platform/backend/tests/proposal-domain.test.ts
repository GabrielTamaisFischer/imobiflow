import { describe, expect, it } from "vitest";
import { nextProposalStatus, proposalStatuses } from "../src/routes/proposals-mysql.js";
import {
  brokerResourceScopedPermissions,
  permissionCatalog,
  roleTemplates,
} from "../src/services/roles.js";
import fs from "node:fs";

const routeSource = fs.readFileSync(
  new URL("../src/routes/proposals-mysql.ts", import.meta.url),
  "utf8",
);
const migrationSource = fs.readFileSync(
  new URL(
    "../../prisma/migrations/202609140001_fase_10b_proposals_mysql/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("GAP-02 — domínio canônico de Proposal", () => {
  it("define lifecycle explícito e rejeita regressões/finais", () => {
    expect(proposalStatuses).toEqual([
      "draft",
      "submitted",
      "under_review",
      "accepted",
      "rejected",
      "withdrawn",
      "expired",
    ]);
    expect(nextProposalStatus("draft", "submitted")).toBe("submitted");
    expect(nextProposalStatus("submitted", "under_review")).toBe("under_review");
    expect(nextProposalStatus("under_review", "accepted")).toBe("accepted");
    expect(() => nextProposalStatus("accepted", "draft")).toThrow(
      "Transição de proposta inválida",
    );
    expect(() => nextProposalStatus("rejected", "submitted")).toThrow(
      "Transição de proposta inválida",
    );
  });

  it("mantém permissions canônicas e Broker resource-scoped", () => {
    expect(permissionCatalog.map(([key]) => key)).toEqual(
      expect.arrayContaining(["proposals.view", "proposals.manage"]),
    );
    expect(brokerResourceScopedPermissions).toEqual(
      expect.arrayContaining(["proposals.view", "proposals.manage"]),
    );
    const broker = roleTemplates.find((role) => role.systemKey === "broker");
    expect(broker?.permissions).toEqual(
      expect.arrayContaining(["proposals.view", "proposals.manage"]),
    );
  });

  it("aplica CAS, idempotência, auditoria e escopo tenant-safe no route canônico", () => {
    expect(routeSource).toContain("version: input.expected_version");
    expect(routeSource).toContain("resolveIdempotencyKey(req, `proposal.create:${id}`)");
    expect(routeSource).toContain('"proposal.created"');
    expect(routeSource).toContain('"proposal.updated"');
    expect(routeSource).toContain("companyId: access.company.id");
    expect(routeSource).toContain('"NEGOTIATE"');
    expect(routeSource).toContain("PROPOSAL_VERSION_CONFLICT");
  });

  it("migration é aditiva e reconcilia permissions sem apagar customizações", () => {
    expect(migrationSource).toContain("CREATE TABLE `proposals_mysql`");
    expect(migrationSource).toContain("CREATE TABLE `proposal_events_mysql`");
    expect(migrationSource).toContain("INSERT IGNORE INTO `permissions`");
    expect(migrationSource).toContain("INSERT IGNORE INTO `role_permissions`");
    expect(migrationSource).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE TABLE/i);
  });
});

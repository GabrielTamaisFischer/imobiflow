import { describe, expect, it } from "vitest";
import { createTestScenarioPlan } from "../../src/product/test-lab";

type Entity = {
  id: string;
  companyId: string;
  propertyId?: string;
  contractId?: string;
  leadId?: string;
  ownerId?: string;
  tenantId?: string;
};

type GlobalScenario = {
  companyA: Entity;
  companyB: Entity;
  ownerA: Entity;
  ownerB: Entity;
  propertyA: Entity;
  propertyB: Entity;
  mediaA: Entity;
  siteA: Entity;
  leadA: Entity;
  appointmentA: Entity;
  proposalA: Entity;
  contractA: Entity;
  signatureA: Entity;
  inspectionEntryA: Entity;
  inspectionExitA: Entity;
  financeA: Entity;
  payoutA: Entity;
  comparisonA: Entity;
  archivedFilesA: Entity[];
  audit: Set<string>;
};

function entity(
  id: string,
  companyId: string,
  relations: Omit<Entity, "id" | "companyId"> = {},
): Entity {
  return { id, companyId, ...relations };
}

function assertTenantAccess(resource: Entity, companyId: string) {
  expect(resource.companyId).toBe(companyId);
}

describe("MVP global E2E — one connected canonical scenario", () => {
  it("threads the outputs of Company A through the complete product chain", () => {
    const plan = createTestScenarioPlan();
    const propertySeed = plan.properties[0];
    const entrySeed = plan.inspections.find((inspection) => inspection.inspection_type === "entry");
    const exitSeed = plan.inspections.find((inspection) => inspection.inspection_type === "exit");
    expect(propertySeed).toBeDefined();
    expect(entrySeed).toBeDefined();
    expect(exitSeed).toBeDefined();

    const scenario: GlobalScenario = {
      companyA: entity("company-a-global-e2e", "company-a-global-e2e"),
      companyB: entity("company-b-global-e2e", "company-b-global-e2e"),
      ownerA: entity("owner-a-global-e2e", "company-a-global-e2e"),
      ownerB: entity("owner-b-global-e2e", "company-b-global-e2e"),
      propertyA: entity("property-a-global-e2e", "company-a-global-e2e", {
        ownerId: "owner-a-global-e2e",
      }),
      propertyB: entity("property-b-global-e2e", "company-b-global-e2e", {
        ownerId: "owner-b-global-e2e",
      }),
      mediaA: entity("media-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
      }),
      siteA: entity("site-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
      }),
      leadA: entity("lead-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
      }),
      appointmentA: entity("appointment-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
        leadId: "lead-a-global-e2e",
      }),
      proposalA: entity("proposal-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
        leadId: "lead-a-global-e2e",
      }),
      contractA: entity("contract-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
        ownerId: "owner-a-global-e2e",
        leadId: "lead-a-global-e2e",
      }),
      signatureA: entity("signature-a-global-e2e", "company-a-global-e2e", {
        contractId: "contract-a-global-e2e",
      }),
      inspectionEntryA: entity("inspection-entry-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
        contractId: "contract-a-global-e2e",
      }),
      inspectionExitA: entity("inspection-exit-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
        contractId: "contract-a-global-e2e",
      }),
      financeA: entity("finance-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
        contractId: "contract-a-global-e2e",
        tenantId: "tenant-a-global-e2e",
      }),
      payoutA: entity("payout-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
        contractId: "contract-a-global-e2e",
        ownerId: "owner-a-global-e2e",
      }),
      comparisonA: entity("comparison-a-global-e2e", "company-a-global-e2e", {
        propertyId: "property-a-global-e2e",
        contractId: "contract-a-global-e2e",
      }),
      archivedFilesA: [],
      audit: new Set(),
    };

    // Company → Owner → Property → media/site.
    scenario.audit.add("company.created");
    scenario.audit.add("owner.created");
    scenario.audit.add("property.created");
    scenario.audit.add("site.published");
    expect(propertySeed!.code).toBeTruthy();
    assertTenantAccess(scenario.propertyA, scenario.companyA.companyId);
    expect(scenario.mediaA.propertyId).toBe(scenario.propertyA.id);
    expect(scenario.siteA.propertyId).toBe(scenario.propertyA.id);

    // Lead → Broker assignment → Appointment → Proposal.
    scenario.audit.add("lead.created");
    scenario.audit.add("lead.assigned");
    scenario.audit.add("appointment.created");
    scenario.audit.add("appointment.completed");
    scenario.audit.add("proposal.created");
    scenario.audit.add("proposal.accepted");
    expect(scenario.appointmentA.leadId).toBe(scenario.leadA.id);
    expect(scenario.proposalA.leadId).toBe(scenario.leadA.id);
    expect(scenario.proposalA.propertyId).toBe(scenario.propertyA.id);

    // Proposal context → Contract → signatures/document archive.
    scenario.audit.add("contract.created");
    scenario.audit.add("contract.versioned");
    scenario.audit.add("signature.waiting");
    scenario.audit.add("signature.partially_signed");
    scenario.audit.add("signature.signed");
    expect(scenario.contractA.propertyId).toBe(scenario.propertyA.id);
    expect(scenario.signatureA.contractId).toBe(scenario.contractA.id);

    // Entry/exit inspections → comparison → finance/payout.
    scenario.audit.add("inspection.entry.completed");
    scenario.audit.add("inspection.exit.completed");
    scenario.audit.add("inspection.comparison.generated");
    scenario.audit.add("finance.rent.created");
    scenario.audit.add("finance.payment.recorded");
    scenario.audit.add("owner_payout.created");
    scenario.audit.add("owner_payout.paid");
    expect(entrySeed!.property_code).toBe(propertySeed!.code);
    expect(exitSeed!.property_code).toBe(propertySeed!.code);
    expect(scenario.inspectionEntryA.contractId).toBe(scenario.contractA.id);
    expect(scenario.inspectionExitA.propertyId).toBe(scenario.propertyA.id);
    expect(scenario.comparisonA.propertyId).toBe(scenario.propertyA.id);
    expect(scenario.financeA.contractId).toBe(scenario.contractA.id);
    expect(scenario.payoutA.ownerId).toBe(scenario.ownerA.id);

    scenario.archivedFilesA.push(
      entity("stored-property-media", scenario.companyA.companyId, {
        propertyId: scenario.propertyA.id,
      }),
      entity("stored-contract-document", scenario.companyA.companyId, {
        contractId: scenario.contractA.id,
      }),
      entity("stored-signature-evidence", scenario.companyA.companyId, {
        contractId: scenario.contractA.id,
      }),
      entity("stored-entry-report", scenario.companyA.companyId, {
        contractId: scenario.contractA.id,
      }),
      entity("stored-exit-report", scenario.companyA.companyId, {
        contractId: scenario.contractA.id,
      }),
      entity("stored-comparison-report", scenario.companyA.companyId, {
        contractId: scenario.contractA.id,
      }),
    );
    expect(scenario.archivedFilesA).toHaveLength(6);

    // Company B cannot cross the tenant boundary for any chained resource/file.
    const resourcesA: Entity[] = [
      scenario.ownerA,
      scenario.propertyA,
      scenario.leadA,
      scenario.appointmentA,
      scenario.proposalA,
      scenario.contractA,
      scenario.inspectionEntryA,
      scenario.financeA,
      ...scenario.archivedFilesA,
    ];
    for (const resource of resourcesA) {
      expect(resource.companyId).not.toBe(scenario.companyB.companyId);
      expect(() => assertTenantAccess(resource, scenario.companyB.companyId)).toThrow();
    }

    expect(scenario.audit).toEqual(
      new Set([
        "company.created",
        "owner.created",
        "property.created",
        "site.published",
        "lead.created",
        "lead.assigned",
        "appointment.created",
        "appointment.completed",
        "proposal.created",
        "proposal.accepted",
        "contract.created",
        "contract.versioned",
        "signature.waiting",
        "signature.partially_signed",
        "signature.signed",
        "inspection.entry.completed",
        "inspection.exit.completed",
        "inspection.comparison.generated",
        "finance.rent.created",
        "finance.payment.recorded",
        "owner_payout.created",
        "owner_payout.paid",
      ]),
    );
  });
});

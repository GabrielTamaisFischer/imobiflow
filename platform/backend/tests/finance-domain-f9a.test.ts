import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canMutateFinancialStatus,
  deriveFinancialStatus,
  financialCategories,
  financialStatuses,
  financialTypes,
  parseDate,
  parseMoney,
  serializeFinancialEntry,
} from "../src/services/mysql-finance.js";

const routeSource = readFileSync(resolve(process.cwd(), "backend/src/routes/finance-mysql.ts"), "utf8");
const serviceSource = readFileSync(resolve(process.cwd(), "backend/src/services/mysql-finance.ts"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "backend/src/app.ts"), "utf8");
const migrationSource = readFileSync(resolve(process.cwd(), "prisma/migrations/202609120001_fase_9a_financial_domain_mysql/migration.sql"), "utf8");

describe("F9A — domínio financeiro canônico", () => {
  it("1. distingue receivable e payable", () => expect(financialTypes).toEqual(["receivable", "payable"]));
  it("2. possui categorias rent", () => expect(financialCategories).toContain("rent"));
  it("3. possui categoria owner_payout", () => expect(financialCategories).toContain("owner_payout"));
  it("4. possui categoria commission", () => expect(financialCategories).toContain("commission"));
  it("5. possui categoria expense", () => expect(financialCategories).toContain("expense"));
  it("6. possui categoria revenue", () => expect(financialCategories).toContain("revenue"));
  it("7. possui status operacional explícito", () => expect(financialStatuses).toEqual(["pending", "paid", "overdue", "cancelled"]));
  it("8. normaliza moeda sem float na fonte", () => expect(parseMoney("1200.5")).toBe("1200.50"));
  it("9. aceita valor inteiro", () => expect(parseMoney(99)).toBe("99.00"));
  it("10. rejeita valor zero", () => expect(() => parseMoney("0")).toThrow());
  it("11. rejeita valor negativo", () => expect(() => parseMoney("-1.00")).toThrow());
  it("12. rejeita mais de duas casas", () => expect(() => parseMoney("10.999")).toThrow());
  it("13. rejeita formato científico", () => expect(() => parseMoney("1e3")).toThrow());
  it("14. aceita data ISO", () => expect(parseDate("2026-09-15", "due_date")?.toISOString()).toContain("2026-09-15"));
  it("15. aceita data nula", () => expect(parseDate(null, "due_date")).toBeNull());
  it("16. rejeita data inválida", () => expect(() => parseDate("15/09/2026", "due_date")).toThrow());
  it("17. deriva pending sem vencimento", () => expect(deriveFinancialStatus("pending", null)).toBe("pending"));
  it("18. deriva overdue para vencimento anterior", () => expect(deriveFinancialStatus("pending", new Date("2020-01-01T00:00:00Z"), new Date("2026-09-12T00:00:00Z"))).toBe("overdue"));
  it("19. mantém pending para vencimento futuro", () => expect(deriveFinancialStatus("pending", new Date("2030-01-01T00:00:00Z"), new Date("2026-09-12T00:00:00Z"))).toBe("pending"));
  it("20. não rebaixa paid para overdue", () => expect(deriveFinancialStatus("paid", new Date("2020-01-01T00:00:00Z"))).toBe("paid"));
  it("21. não rebaixa cancelled", () => expect(deriveFinancialStatus("cancelled", null)).toBe("cancelled"));
  it("22. pending é mutável", () => expect(canMutateFinancialStatus("pending")).toBe(true));
  it("23. overdue é mutável", () => expect(canMutateFinancialStatus("overdue")).toBe(true));
  it("24. paid é imutável", () => expect(canMutateFinancialStatus("paid")).toBe(false));
  it("25. cancelled é protegido", () => expect(canMutateFinancialStatus("cancelled")).toBe(false));
  it("26. serializa Decimal sem converter para float", () => expect(serializeFinancialEntry({ id: "e", companyId: "c", type: "receivable", category: "rent", amount: "10.20", currency: "BRL", description: "Aluguel", status: "pending", dueDate: null, competenceDate: null, paidAt: null, propertyId: null, contractId: null, ownerId: null, tenantPartyId: null, version: 1, metadataJson: {}, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") }).amount).toBe("10.20"));
  it("27. monta rota canônica real-estate/finance", () => expect(appSource).toContain('app.use("/real-estate/finance", mysqlFinanceRouter)'));
  it("28. protege a rota com autenticação e empresa", () => expect(routeSource).toContain("requireAuth, requireCompany, requireActiveSubscription"));
  it("29. exige finance.view para leitura", () => expect(routeSource).toContain('requirePermission("finance.view")'));
  it("30. exige finance.manage para mutations", () => expect(routeSource).toContain('requirePermission("finance.manage")'));
  it("31. deriva companyId da sessão", () => expect(serviceSource).toContain("req.access?.company.id"));
  it("32. valida vínculo de property por companyId", () => expect(serviceSource).toContain("property.findFirst({ where: { id: input.property_id, companyId }"));
  it("33. valida vínculo de contract por companyId", () => expect(serviceSource).toContain("contract.findFirst({ where: { id: input.contract_id, companyId }"));
  it("34. valida vínculo de owner por companyId", () => expect(serviceSource).toContain("propertyOwner.findFirst({ where: { id: input.owner_id, companyId }"));
  it("35. valida tenant como ContractParty da empresa", () => expect(serviceSource).toContain('partyType: "tenant"'));
  it("36. usa Idempotency-Key no create", () => expect(routeSource).toContain("resolveIdempotencyKey"));
  it("37. usa idempotência no pagamento", () => expect(serviceSource).toContain('finance.entries.pay'));
  it("38. usa CAS por version na atualização", () => expect(serviceSource).toContain("version: input.expected_version"));
  it("39. usa CAS para pagamento", () => expect(serviceSource).toContain("version: current.version"));
  it("40. registra evento created", () => expect(serviceSource).toContain('financial.created'));
  it("41. registra evento paid", () => expect(serviceSource).toContain('financial.paid'));
  it("42. registra evento cancelled", () => expect(serviceSource).toContain('financial.cancelled'));
  it("43. protege FK de propriedade", () => expect(migrationSource).toContain("financial_entries_mysql_property_fk"));
  it("44. protege FK de contrato", () => expect(migrationSource).toContain("financial_entries_mysql_contract_fk"));
  it("45. protege FK de proprietário", () => expect(migrationSource).toContain("financial_entries_mysql_owner_fk"));
  it("46. protege FK de inquilino", () => expect(migrationSource).toContain("financial_entries_mysql_tenant_fk"));
  it("47. usa Decimal monetário", () => expect(migrationSource).toContain("DECIMAL(15,2)"));
  it("48. não implementa gateway nesta rota", () => expect(routeSource).not.toContain("payment-gateways"));
  it("49. possui tabela de pagamentos única por entrada", () => expect(migrationSource).toContain("financial_payments_mysql_entry_id_key"));
  it("50. preserva histórico por eventos", () => expect(migrationSource).toContain("financial_entry_events_mysql"));
});

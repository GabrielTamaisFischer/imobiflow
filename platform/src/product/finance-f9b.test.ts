import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  financialDashboard,
  formatFinancialAmount,
  statusLabel,
  typeLabel,
  type CanonicalFinancialEntry,
} from "./finance-canonical";
import { readFileSync } from "node:fs";

const entry = (overrides: Partial<CanonicalFinancialEntry> = {}): CanonicalFinancialEntry => ({
  id: "entry-1",
  company_id: "company-a",
  type: "receivable",
  category: "rent",
  amount: "1000.00",
  currency: "BRL",
  description: "Aluguel QA",
  due_date: "2026-09-20",
  competence_date: "2026-09-01",
  paid_at: null,
  status: "pending",
  stored_status: "pending",
  property_id: "property-a",
  contract_id: "contract-a",
  owner_id: "owner-a",
  tenant_party_id: "tenant-a",
  version: 1,
  metadata: {},
  property: { id: "property-a", code: "QA-001", title: "Imóvel QA" },
  contract: { id: "contract-a", title: "Contrato QA", status: "active" },
  owner: { id: "owner-a", name: "Owner QA" },
  tenant: { id: "tenant-a", name: "Tenant QA" },
  payment: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("F9B — Financeiro canônico e integração de portais", () => {
  it("1. dashboard vazio é determinístico", () => {
    expect(financialDashboard([])).toEqual({
      receivable: 0,
      payable: 0,
      received: 0,
      paid: 0,
      overdue: 0,
      upcoming: 0,
    });
  });
  it("2. dashboard soma recebíveis e pagamentos", () => {
    expect(
      financialDashboard([
        entry(),
        entry({ id: "e2", status: "paid", paid_at: "2026-09-02T00:00:00Z" }),
        entry({
          id: "e3",
          type: "payable",
          category: "expense",
          amount: "200.00",
          status: "overdue",
        }),
      ]),
    ).toMatchObject({ receivable: 1000, payable: 200, received: 1000, overdue: 200 });
  });
  it("3. labels são humanas", () => {
    expect(categoryLabel("owner_payout")).toBe("Repasse");
    expect(statusLabel("overdue")).toBe("Vencido");
    expect(typeLabel("payable")).toBe("A pagar");
  });
  it("4. valores usam BRL", () => expect(formatFinancialAmount("1234.5")).toContain("1.234,50"));
  it("5. cliente lista a API Finance canônica", () =>
    expect(source("./finance-canonical.ts")).toContain("/real-estate/finance"));
  it("6. cliente não usa endpoints legados de charges/entries", () => {
    const text = source("./finance-canonical.ts");
    expect(text).not.toContain("/finance/charges");
    expect(text).not.toContain("/finance/entries");
  });
  it("7. criação envia idempotência", () =>
    expect(source("./finance-canonical.ts")).toContain('"Idempotency-Key"'));
  it("8. pagamento usa endpoint idempotente", () =>
    expect(source("./finance-canonical.ts")).toContain("/pay"));
  it("9. cancelamento usa endpoint canônico", () =>
    expect(source("./finance-canonical.ts")).toContain("/cancel"));
  it("10. atualização exige expected_version", () =>
    expect(source("./finance-canonical.ts")).toContain("expected_version"));
  it("11. UI separa finance.view e finance.manage", () => {
    const text = source("./finance-page-f9b.tsx");
    expect(text).toContain('canView(user, "finance.view")');
    expect(text).toContain('canManage(user, "finance.manage")');
  });
  it("12. UI não mostra ação de criação sem manage", () =>
    expect(source("./finance-page-f9b.tsx")).toContain("canEdit ?"));
  it("13. UI bloqueia ações em pagos/cancelados", () =>
    expect(source("./finance-page-f9b.tsx")).toContain(
      'entry.status !== "paid" && entry.status !== "cancelled"',
    ));
  it("14. formulário valida valor e descrição", () => {
    const text = source("./finance-page-f9b.tsx");
    expect(text).toContain('pattern="^\\d{1,13}(?:\\.\\d{1,2})?$"');
    expect(text).toContain("minLength={2}");
  });
  it("15. dashboard mostra vencidos", () =>
    expect(source("./finance-page-f9b.tsx")).toContain('"Vencido"'));
  it("16. UI é responsiva por cards", () =>
    expect(source("./finance-page-f9b.tsx")).toContain("sm:grid-cols-2"));
  it("17. erros são exibidos sem detalhes internos", () =>
    expect(source("./finance-page-f9b.tsx")).toContain("getSafeApiErrorMessage"));
  it("18. portal do inquilino expõe entries financeiras", () =>
    expect(source("../../backend/src/services/portal-f8a.ts")).toContain("entries:"));
  it("19. portal financeiro filtra pelo tenant token-derived", () =>
    expect(source("../../backend/src/services/portal-f8a.ts")).toContain(
      "tenantPartyId: party.id",
    ));
  it("20. portal do proprietário usa o serviço Prisma canônico", () =>
    expect(source("../../backend/src/routes/public-portals.ts")).toContain(
      "listFinancialEntriesForPortal",
    ));
  it("21. portal owner mantém company scope", () =>
    expect(source("../../backend/src/routes/public-portals.ts")).toContain(
      "loadOwnerFinancials(owner.companyId, owner.id)",
    ));
  it("22. owner payout e rent têm categorias distintas", () => {
    const text = source("../../backend/src/routes/public-portals.ts");
    expect(text).toContain('entry.category === "owner_payout"');
    expect(text).toContain('entry.category === "rent"');
  });
  it("23. portal payments não expõe metadata financeira interna", () => {
    const text = source("../../backend/src/services/portal-f8a.ts");
    expect(text).not.toContain("metadata: entry.metadata");
    expect(text).not.toContain("created_by: entry");
  });
  it("24. portal UI mantém estado vazio claro", () =>
    expect(source("./portal-dashboard.tsx")).toContain(
      "Nenhum pagamento ou vencimento disponível.",
    ));
  it("25. portal UI mostra vencimento e moeda", () => {
    const text = source("./portal-dashboard.tsx");
    expect(text).toContain("Vencimento:");
    expect(text).toContain("formatMoney(entry.amount, entry.currency)");
  });
  it("26. API usa filtro de contrato para tenant", () =>
    expect(source("../../backend/src/services/portal-f8a.ts")).toContain(
      "contractIds: contracts.map",
    ));
  it("27. no auth não é fabricado no frontend", () =>
    expect(source("./finance-canonical.ts")).toContain("getStoredToken()"));
});

import type { AccessContext } from "../types/access.js";

const moduleCatalog = [
  {
    key: "dashboard",
    name: "Dashboard",
    description: "Indicadores reais da empresa com filtros por período.",
    permission: "dashboard.view",
    feature: "dashboard",
  },
  {
    key: "crm",
    name: "CRM",
    description: "Leads, funil, tarefas, follow-ups e histórico.",
    permission: "crm.view",
    feature: "crm_basic",
  },
  {
    key: "properties",
    name: "Imóveis",
    description: "Cadastro completo de imóveis, fotos, valores e status.",
    permission: "properties.view",
    feature: "properties",
  },
  {
    key: "owners",
    name: "Proprietários",
    description: "Pessoas vinculadas aos imóveis e repasses futuros.",
    permission: "owners.view",
    feature: "properties",
  },
  {
    key: "inspections",
    name: "Vistorias",
    description: "Vistorias digitais, fotos, assinatura e PDF.",
    permission: "inspections.view",
    feature: "inspections",
  },
  {
    key: "contracts",
    name: "Contratos",
    description: "Modelos, geração, anexos e assinaturas.",
    permission: "contracts.view",
    feature: "contracts",
  },
  {
    key: "finance",
    name: "Financeiro",
    description: "Contas, comissões, repasses e fluxo de caixa.",
    permission: "finance.view",
    feature: "finance_complete",
  },
];

export function buildAppBootstrap(access: AccessContext) {
  const isOwner = access.appUser.role === "owner";
  const permissions = new Set(access.appUser.permissions);
  const planSlug = access.subscription?.plan_slug ?? null;

  return {
    access,
    plan: {
      slug: planSlug,
      subscription_status: access.subscription?.status ?? "inactive",
    },
    modules: moduleCatalog.map((module) => ({
      ...module,
      allowedByRole: isOwner || permissions.has(module.permission),
      allowedByPlan: true,
      status: "empty",
    })),
    metrics: {
      properties: 0,
      leads: 0,
      contracts: 0,
      inspections: 0,
      receivables: 0,
      visits: 0,
    },
    alerts: [],
    emptyStates: {
      dashboard: "Nenhum dado operacional cadastrado ainda.",
      properties: "Nenhum imóvel cadastrado. Cadastre seu primeiro imóvel ou importe uma base real.",
      leads: "Nenhum lead encontrado. Leads aparecerão aqui quando forem cadastrados ou capturados.",
      contracts: "Nenhum contrato criado. Crie contratos a partir de imóveis, vendas ou locações reais.",
      inspections: "Nenhuma vistoria criada. As vistorias aparecerão após cadastro real.",
      finance: "Nenhum lançamento financeiro registrado.",
    },
  };
}

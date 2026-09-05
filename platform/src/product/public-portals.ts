import { apiRequest } from "./api";

type CompanySummary = {
  id: string;
  name: string;
  status: string;
};

export type PortalPropertyLeadsSummary = {
  total_interessados: number;
  visitas_agendadas: number;
  ultimo_interesse_em: string | null;
  origem: string | null;
  estagio: string | null;
  status: "sem_interesse" | "em_andamento" | "fechado" | "perdido";
  corretor_responsavel: string | null;
};

export type PortalProperty = {
  id: string;
  code: string | null;
  title: string;
  operation?: string;
  status?: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  rent_price_cents?: number | null;
  sale_price_cents?: number | null;
  // Fase 4C — sempre presente na resposta real da API; opcional aqui só
  // para não quebrar nenhum consumidor/teste antigo que construa um
  // PortalProperty parcial sem esse campo.
  leads_summary?: PortalPropertyLeadsSummary;
};

export type PortalCharge = {
  id: string;
  contract_id: string;
  property_id: string | null;
  payment_method: string;
  gross_amount_cents: number;
  commission_amount_cents?: number;
  fee_amount_cents?: number;
  net_owner_amount_cents?: number;
  due_date: string;
  paid_at: string | null;
  status: string;
  pix_qr_code?: string | null;
  pix_copy_paste?: string | null;
  boleto_barcode?: string | null;
  boleto_digitable_line?: string | null;
  payment_url?: string | null;
  boleto_pdf_url?: string | null;
  contracts?: {
    id: string;
    title: string;
    contract_number: string | null;
  } | null;
  properties?: {
    id: string;
    code: string | null;
    title: string;
  } | null;
};

export type PortalTransfer = {
  id: string;
  charge_id?: string | null;
  contract_id: string | null;
  property_id: string | null;
  gross_amount_cents: number;
  deductions_cents: number;
  net_amount_cents: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method?: string | null;
  receipt_url?: string | null;
  receipt_reference?: string | null;
  notes: string | null;
  created_at: string;
  contracts?: {
    id: string;
    title: string;
    contract_number: string | null;
  } | null;
  properties?: {
    id: string;
    code: string | null;
    title: string;
  } | null;
};

export type OwnerPortalResponse = {
  owner: {
    id: string;
    company_id: string;
    owner_type: string;
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    status: string;
  };
  company: CompanySummary | null;
  properties: PortalProperty[];
  transfers: PortalTransfer[];
  charges: PortalCharge[];
};

export type TenantPortalResponse = {
  tenant: {
    id: string;
    company_id: string;
    contract_id: string;
    party_type: string;
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
  };
  company: CompanySummary | null;
  contract: {
    id: string;
    property_id: string | null;
    contract_number: string | null;
    title: string;
    contract_type: string;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    monthly_amount_cents: number | null;
    deposit_cents: number | null;
    properties?: PortalProperty | PortalProperty[] | null;
  };
  charges: PortalCharge[];
};

export async function getOwnerPortal(token: string) {
  if (token === "preview") return buildPreviewOwnerPortal();
  return apiRequest<OwnerPortalResponse>(`/public/portals/owners/${token}`);
}

export async function getTenantPortal(token: string) {
  if (token === "preview") return buildPreviewTenantPortal();
  return apiRequest<TenantPortalResponse>(`/public/portals/tenants/${token}`);
}

function buildPreviewOwnerPortal(): OwnerPortalResponse {
  return {
    owner: {
      id: "preview-owner",
      company_id: "preview-company",
      owner_type: "individual",
      name: "Proprietário Preview",
      document: "000.000.000-00",
      email: "proprietario@preview.com",
      phone: "(11) 99999-0000",
      whatsapp: "(11) 99999-0000",
      status: "active",
    },
    company: { id: "preview-company", name: "ImobiFlow Preview", status: "active" },
    properties: [
      {
        id: "preview-property",
        code: "AP-204",
        title: "Apartamento Jardim Europa",
        operation: "rent",
        status: "rented",
        neighborhood: "Jardim Europa",
        city: "São Paulo",
        state: "SP",
        rent_price_cents: 350000,
        sale_price_cents: null,
        leads_summary: {
          total_interessados: 3,
          visitas_agendadas: 1,
          ultimo_interesse_em: new Date().toISOString(),
          origem: "site",
          estagio: "Visita",
          status: "em_andamento",
          corretor_responsavel: "Marina Souza",
        },
      },
    ],
    transfers: [
      {
        id: "preview-transfer",
        charge_id: "preview-charge",
        contract_id: "preview-contract",
        property_id: "preview-property",
        gross_amount_cents: 350000,
        deductions_cents: 35349,
        net_amount_cents: 314651,
        status: "pending",
        due_date: new Date().toISOString().slice(0, 10),
        paid_at: null,
        payment_method: null,
        receipt_url: null,
        receipt_reference: null,
        notes: "Repasse calculado automaticamente após confirmação da cobrança.",
        created_at: new Date().toISOString(),
        contracts: { id: "preview-contract", title: "Locação Jardim Europa", contract_number: "LOC-001" },
        properties: { id: "preview-property", code: "AP-204", title: "Apartamento Jardim Europa" },
      },
    ],
    charges: [
      {
        id: "preview-charge",
        contract_id: "preview-contract",
        property_id: "preview-property",
        payment_method: "pix",
        gross_amount_cents: 350000,
        commission_amount_cents: 35000,
        fee_amount_cents: 349,
        net_owner_amount_cents: 314651,
        due_date: new Date().toISOString().slice(0, 10),
        paid_at: null,
        status: "waiting_payment",
        contracts: { id: "preview-contract", title: "Locação Jardim Europa", contract_number: "LOC-001" },
        properties: { id: "preview-property", code: "AP-204", title: "Apartamento Jardim Europa" },
      },
    ],
  };
}

function buildPreviewTenantPortal(): TenantPortalResponse {
  return {
    tenant: {
      id: "preview-tenant",
      company_id: "preview-company",
      contract_id: "preview-contract",
      party_type: "tenant",
      name: "Inquilino Preview",
      document: "000.000.000-00",
      email: "inquilino@preview.com",
      phone: "(11) 98888-0000",
    },
    company: { id: "preview-company", name: "ImobiFlow Preview", status: "active" },
    contract: {
      id: "preview-contract",
      property_id: "preview-property",
      contract_number: "LOC-001",
      title: "Locação Jardim Europa",
      contract_type: "rental",
      status: "active",
      starts_at: new Date().toISOString().slice(0, 10),
      ends_at: null,
      monthly_amount_cents: 350000,
      deposit_cents: 700000,
      properties: {
        id: "preview-property",
        code: "AP-204",
        title: "Apartamento Jardim Europa",
        neighborhood: "Jardim Europa",
        city: "São Paulo",
        state: "SP",
      },
    },
    charges: [
      {
        id: "preview-charge",
        contract_id: "preview-contract",
        property_id: "preview-property",
        payment_method: "pix",
        gross_amount_cents: 350000,
        due_date: new Date().toISOString().slice(0, 10),
        paid_at: null,
        status: "waiting_payment",
        pix_copy_paste: "00020101021226890014br.gov.bcb.pix2567preview-imobiflow-pix",
        payment_url: null,
        boleto_pdf_url: null,
        contracts: { id: "preview-contract", title: "Locação Jardim Europa", contract_number: "LOC-001" },
        properties: { id: "preview-property", code: "AP-204", title: "Apartamento Jardim Europa" },
      },
    ],
  };
}

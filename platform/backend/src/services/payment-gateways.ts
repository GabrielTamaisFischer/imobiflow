type PaymentMethod = "pix" | "boleto" | "hybrid" | "credit_card" | "bank_transfer" | "manual";

export type GatewayAccountForIssue = {
  id: string;
  provider: string;
  name: string;
  status: string;
  credentials_ref?: string | null;
  webhook_secret_ref?: string | null;
  settings: Record<string, unknown>;
};

export type ChargeForGatewayIssue = {
  id: string;
  company_id: string;
  contract_id: string;
  property_id: string | null;
  owner_id: string | null;
  tenant_party_id: string | null;
  entry_id: string | null;
  payment_method: PaymentMethod;
  gross_amount_cents: number;
  due_date: string;
  metadata: Record<string, unknown>;
};

export type GatewayCustomerParty = {
  id: string;
  company_id: string;
  contract_id: string;
  party_type: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  gateway_provider: string | null;
  gateway_customer_id: string | null;
  gateway_customer_status: string;
  gateway_metadata: Record<string, unknown>;
};

type IssueGatewayChargeInput = {
  charge: ChargeForGatewayIssue;
  gatewayAccount: GatewayAccountForIssue;
};

type SyncGatewayCustomerInput = {
  party: GatewayCustomerParty;
  gatewayAccount: GatewayAccountForIssue;
};

export type GatewayIssueResult = {
  provider: string;
  gateway_account_id: string;
  gateway_account_name: string;
  environment: string;
  status: "prepared" | "blocked" | "issued" | "failed";
  prepared_at: string;
  request_payload: Record<string, unknown>;
  real_api_call: boolean;
  connector_status:
    | "ready_for_credentials"
    | "credentials_missing"
    | "adapter_not_enabled"
    | "missing_customer_reference"
    | "real_call_disabled"
    | "provider_error"
    | "issued";
  next_step: string;
  provider_http_status?: number;
  provider_error?: string;
  charge_update?: {
    gateway_charge_id?: string | null;
    payment_url?: string | null;
    boleto_pdf_url?: string | null;
    pix_qr_code?: string | null;
    pix_copy_paste?: string | null;
    boleto_barcode?: string | null;
    boleto_digitable_line?: string | null;
  };
};

export type GatewayCustomerSyncResult = {
  provider: string;
  gateway_account_id: string;
  gateway_account_name: string;
  environment: string;
  status: "prepared" | "blocked" | "synced" | "failed";
  connector_status:
    | "credentials_missing"
    | "adapter_not_enabled"
    | "document_required"
    | "real_call_disabled"
    | "provider_error"
    | "synced";
  synced_at: string;
  request_payload: Record<string, unknown>;
  real_api_call: boolean;
  next_step: string;
  provider_http_status?: number;
  provider_error?: string;
  customer_update?: {
    gateway_provider: string;
    gateway_customer_id: string;
    gateway_customer_status: "synced";
    gateway_synced_at: string;
    gateway_metadata: Record<string, unknown>;
  };
};

const plannedProviders = ["asaas", "pjbank", "iugu", "mercado_pago", "stripe"];

export async function issueGatewayCharge(input: IssueGatewayChargeInput): Promise<GatewayIssueResult> {
  const environment = readStringSetting(input.gatewayAccount.settings, "environment") ?? "sandbox";
  const requestPayload = buildNormalizedGatewayPayload(input.charge, input.gatewayAccount);
  const credential = resolveCredentialReference(input.gatewayAccount.credentials_ref);
  const provider = input.gatewayAccount.provider;

  if (!plannedProviders.includes(provider)) {
    return buildIssueResult({
      input,
      environment,
      requestPayload,
      status: "blocked",
      connectorStatus: "adapter_not_enabled",
      nextStep: "Selecionar um provedor com adaptador suportado ou implementar um adaptador customizado.",
    });
  }

  if (!credential) {
    return buildIssueResult({
      input,
      environment,
      requestPayload,
      status: "blocked",
      connectorStatus: "credentials_missing",
      nextStep: "Configurar a referencia de credencial em ambiente seguro antes da chamada real.",
    });
  }

  if (provider === "asaas") {
    return issueAsaasCharge({
      input,
      environment,
      requestPayload,
      credential,
    });
  }

  if (provider === "iugu") {
    return issueIuguCharge({
      input,
      environment,
      requestPayload,
      credential,
    });
  }

  return buildIssueResult({
    input,
    environment,
    requestPayload,
    status: "blocked",
    connectorStatus: "adapter_not_enabled",
    nextStep: "Provedor planejado no SDD, mas ainda sem adaptador HTTP real nesta fase.",
  });
}

export async function syncGatewayCustomer(
  input: SyncGatewayCustomerInput,
): Promise<GatewayCustomerSyncResult> {
  const environment = readStringSetting(input.gatewayAccount.settings, "environment") ?? "sandbox";
  const requestPayload = buildNormalizedCustomerPayload(input.party, input.gatewayAccount);
  const credential = resolveCredentialReference(input.gatewayAccount.credentials_ref);
  const provider = input.gatewayAccount.provider;

  if (!plannedProviders.includes(provider)) {
    return buildCustomerSyncResult({
      input,
      environment,
      requestPayload,
      status: "blocked",
      connectorStatus: "adapter_not_enabled",
      nextStep: "Selecionar um provedor com adaptador de cliente suportado.",
    });
  }

  if (!credential) {
    return buildCustomerSyncResult({
      input,
      environment,
      requestPayload,
      status: "blocked",
      connectorStatus: "credentials_missing",
      nextStep: "Configurar a referencia de credencial em ambiente seguro antes da chamada real.",
    });
  }

  if (provider === "asaas") {
    return syncAsaasCustomer({
      input,
      environment,
      requestPayload,
      credential,
    });
  }

  if (provider === "iugu") {
    return syncIuguCustomer({
      input,
      environment,
      requestPayload,
      credential,
    });
  }

  return buildCustomerSyncResult({
    input,
    environment,
    requestPayload,
    status: "blocked",
    connectorStatus: "adapter_not_enabled",
    nextStep: "Provedor planejado no SDD, mas ainda sem adaptador real de cliente nesta fase.",
  });
}

function buildIssueResult(input: {
  input: IssueGatewayChargeInput;
  environment: string;
  requestPayload: Record<string, unknown>;
  status: GatewayIssueResult["status"];
  connectorStatus: GatewayIssueResult["connector_status"];
  nextStep: string;
  realApiCall?: boolean;
  providerHttpStatus?: number;
  providerError?: string;
  chargeUpdate?: GatewayIssueResult["charge_update"];
}): GatewayIssueResult {
  return {
    provider: input.input.gatewayAccount.provider,
    gateway_account_id: input.input.gatewayAccount.id,
    gateway_account_name: input.input.gatewayAccount.name,
    environment: input.environment,
    status: input.status,
    prepared_at: new Date().toISOString(),
    request_payload: input.requestPayload,
    real_api_call: input.realApiCall ?? false,
    connector_status: input.connectorStatus,
    next_step: input.nextStep,
    provider_http_status: input.providerHttpStatus,
    provider_error: input.providerError,
    charge_update: input.chargeUpdate,
  };
}

function buildNormalizedGatewayPayload(
  charge: ChargeForGatewayIssue,
  gatewayAccount: GatewayAccountForIssue,
) {
  const paymentMethods = charge.payment_method === "hybrid" ? ["pix", "boleto"] : [charge.payment_method];
  const webhookBasePath = `/webhooks/payments/${gatewayAccount.provider}`;

  return {
    external_reference: charge.id,
    amount_cents: charge.gross_amount_cents,
    amount: charge.gross_amount_cents / 100,
    due_date: charge.due_date,
    payment_methods: paymentMethods,
    webhook_reference: webhookBasePath,
    tenant_party_id: charge.tenant_party_id,
    contract_id: charge.contract_id,
    property_id: charge.property_id,
    metadata: {
      company_id: charge.company_id,
      charge_id: charge.id,
      source: "imobiflow",
    },
  };
}

function buildNormalizedCustomerPayload(
  party: GatewayCustomerParty,
  gatewayAccount: GatewayAccountForIssue,
) {
  return {
    external_reference: party.id,
    provider: gatewayAccount.provider,
    name: party.name,
    document: normalizeDigits(party.document),
    email: party.email,
    phone: normalizeDigits(party.phone),
    metadata: {
      company_id: party.company_id,
      contract_id: party.contract_id,
      party_id: party.id,
      party_type: party.party_type,
      source: "imobiflow",
    },
  };
}

function buildCustomerSyncResult(input: {
  input: SyncGatewayCustomerInput;
  environment: string;
  requestPayload: Record<string, unknown>;
  status: GatewayCustomerSyncResult["status"];
  connectorStatus: GatewayCustomerSyncResult["connector_status"];
  nextStep: string;
  realApiCall?: boolean;
  providerHttpStatus?: number;
  providerError?: string;
  customerUpdate?: GatewayCustomerSyncResult["customer_update"];
}): GatewayCustomerSyncResult {
  return {
    provider: input.input.gatewayAccount.provider,
    gateway_account_id: input.input.gatewayAccount.id,
    gateway_account_name: input.input.gatewayAccount.name,
    environment: input.environment,
    status: input.status,
    connector_status: input.connectorStatus,
    synced_at: new Date().toISOString(),
    request_payload: input.requestPayload,
    real_api_call: input.realApiCall ?? false,
    next_step: input.nextStep,
    provider_http_status: input.providerHttpStatus,
    provider_error: input.providerError,
    customer_update: input.customerUpdate,
  };
}

async function syncAsaasCustomer(input: {
  input: SyncGatewayCustomerInput;
  environment: string;
  requestPayload: Record<string, unknown>;
  credential: string;
}) {
  if (input.input.party.gateway_provider === "asaas" && input.input.party.gateway_customer_id) {
    const syncedAt = new Date().toISOString();
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: input.requestPayload,
      status: "synced",
      connectorStatus: "synced",
      nextStep: "Inquilino ja possui customer_id Asaas vinculado.",
      customerUpdate: {
        gateway_provider: "asaas",
        gateway_customer_id: input.input.party.gateway_customer_id,
        gateway_customer_status: "synced",
        gateway_synced_at: syncedAt,
        gateway_metadata: {
          ...input.input.party.gateway_metadata,
          reused_existing_customer_id: true,
          synced_at: syncedAt,
        },
      },
    });
  }

  const document = normalizeDigits(input.input.party.document);
  if (!document) {
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        asaas: buildAsaasCustomerPayload(input.input.party),
      },
      status: "blocked",
      connectorStatus: "document_required",
      nextStep: "Cadastrar CPF/CNPJ do inquilino antes de sincronizar cliente no Asaas.",
    });
  }

  const asaasPayload = buildAsaasCustomerPayload(input.input.party);
  const realApiEnabled = readBooleanSetting(input.input.gatewayAccount.settings, "enable_real_api");

  if (!realApiEnabled) {
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        asaas: asaasPayload,
      },
      status: "prepared",
      connectorStatus: "real_call_disabled",
      nextStep:
        "Adapter de cliente Asaas pronto. Defina settings.enable_real_api=true somente depois de validar credenciais e webhook.",
    });
  }

  const baseUrl = resolveAsaasBaseUrl(input.environment);
  const existingCustomer = await findExistingAsaasCustomer({
    baseUrl,
    credential: input.credential,
    externalReference: input.input.party.id,
  });

  if (existingCustomer.error) {
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        asaas: asaasPayload,
      },
      status: "failed",
      connectorStatus: "provider_error",
      realApiCall: true,
      providerHttpStatus: existingCustomer.httpStatus,
      providerError: existingCustomer.error,
      nextStep: "Corrigir erro ao consultar cliente no Asaas antes de criar novo cadastro.",
    });
  }

  if (existingCustomer.customerId) {
    const syncedAt = new Date().toISOString();
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        asaas: asaasPayload,
        asaas_lookup: {
          externalReference: input.input.party.id,
        },
      },
      status: "synced",
      connectorStatus: "synced",
      realApiCall: true,
      providerHttpStatus: existingCustomer.httpStatus,
      customerUpdate: {
        gateway_provider: "asaas",
        gateway_customer_id: existingCustomer.customerId,
        gateway_customer_status: "synced",
        gateway_synced_at: syncedAt,
        gateway_metadata: {
          provider: "asaas",
          environment: input.environment,
          synced_at: syncedAt,
          external_reference: input.input.party.id,
          reused_existing_customer_id: true,
        },
      },
      nextStep: "Cliente existente localizado no Asaas e vinculado ao inquilino.",
    });
  }

  const response = await fetch(`${baseUrl}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ImobiFlow/1.0",
      access_token: input.credential,
    },
    body: JSON.stringify(asaasPayload),
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        asaas: asaasPayload,
      },
      status: "failed",
      connectorStatus: "provider_error",
      realApiCall: true,
      providerHttpStatus: response.status,
      providerError: extractProviderError(responseBody) ?? response.statusText,
      nextStep: "Corrigir os dados do inquilino ou credenciais retornados pelo Asaas e tentar novamente.",
    });
  }

  const customerId = readString(responseBody.id);
  const syncedAt = new Date().toISOString();

  if (!customerId) {
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        asaas: asaasPayload,
      },
      status: "failed",
      connectorStatus: "provider_error",
      realApiCall: true,
      providerHttpStatus: response.status,
      providerError: "Asaas nao retornou id do cliente.",
      nextStep: "Verificar resposta do provedor antes de salvar o vinculo do cliente.",
    });
  }

  return buildCustomerSyncResult({
    input: input.input,
    environment: input.environment,
    requestPayload: {
      ...input.requestPayload,
      asaas: asaasPayload,
    },
    status: "synced",
    connectorStatus: "synced",
    realApiCall: true,
    providerHttpStatus: response.status,
    customerUpdate: {
      gateway_provider: "asaas",
      gateway_customer_id: customerId,
      gateway_customer_status: "synced",
      gateway_synced_at: syncedAt,
      gateway_metadata: {
        provider: "asaas",
        environment: input.environment,
        synced_at: syncedAt,
        external_reference: input.input.party.id,
      },
    },
    nextStep: "Cliente sincronizado no Asaas. A cobranca ja pode usar esse customer_id.",
  });
}

async function findExistingAsaasCustomer(input: {
  baseUrl: string;
  credential: string;
  externalReference: string;
}) {
  const url = new URL(`${input.baseUrl}/customers`);
  url.searchParams.set("externalReference", input.externalReference);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ImobiFlow/1.0",
      access_token: input.credential,
    },
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    return {
      customerId: null,
      httpStatus: response.status,
      error: extractProviderError(responseBody) ?? response.statusText,
    };
  }

  const data = Array.isArray(responseBody.data) ? responseBody.data : [];
  const first = data[0];
  const customerId =
    first && typeof first === "object" ? readString((first as Record<string, unknown>).id) : null;

  return {
    customerId,
    httpStatus: response.status,
    error: null,
  };
}

async function issueAsaasCharge(input: {
  input: IssueGatewayChargeInput;
  environment: string;
  requestPayload: Record<string, unknown>;
  credential: string;
}) {
  const customerId = findAsaasCustomerId(input.input.charge, input.input.gatewayAccount.settings);

  if (!customerId) {
    return buildIssueResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        asaas: buildAsaasPaymentPayload(input.input.charge, null),
      },
      status: "blocked",
      connectorStatus: "missing_customer_reference",
      nextStep:
        "Vincular o inquilino a um customer_id real do Asaas antes de emitir a cobranca.",
    });
  }

  const asaasPayload = buildAsaasPaymentPayload(input.input.charge, customerId);
  const realApiEnabled = readBooleanSetting(input.input.gatewayAccount.settings, "enable_real_api");

  if (!realApiEnabled) {
    return buildIssueResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        asaas: asaasPayload,
      },
      status: "prepared",
      connectorStatus: "real_call_disabled",
      nextStep:
        "Adapter Asaas pronto. Defina settings.enable_real_api=true somente depois de validar credenciais, customer_id e webhook.",
    });
  }

  const baseUrl = resolveAsaasBaseUrl(input.environment);
  const response = await fetch(`${baseUrl}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ImobiFlow/1.0",
      access_token: input.credential,
    },
    body: JSON.stringify(asaasPayload),
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    return buildIssueResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        asaas: asaasPayload,
      },
      status: "failed",
      connectorStatus: "provider_error",
      realApiCall: true,
      providerHttpStatus: response.status,
      providerError: extractProviderError(responseBody) ?? response.statusText,
      nextStep:
        "Corrigir o erro retornado pelo Asaas e tentar emitir novamente. A cobranca interna nao foi marcada como paga.",
    });
  }

  const chargeUpdate = await enrichAsaasPaymentDetails({
    baseUrl,
    credential: input.credential,
    paymentMethod: input.input.charge.payment_method,
    responseBody,
  });

  return buildIssueResult({
    input: input.input,
    environment: input.environment,
    requestPayload: {
      ...input.requestPayload,
      asaas: asaasPayload,
    },
    status: "issued",
    connectorStatus: "issued",
    realApiCall: true,
    providerHttpStatus: response.status,
    chargeUpdate,
    nextStep:
      "Cobranca emitida no Asaas. A liquidacao financeira continua dependente do webhook de confirmacao.",
  });
}

async function syncIuguCustomer(input: {
  input: SyncGatewayCustomerInput;
  environment: string;
  requestPayload: Record<string, unknown>;
  credential: string;
}) {
  if (input.input.party.gateway_provider === "iugu" && input.input.party.gateway_customer_id) {
    const syncedAt = new Date().toISOString();
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: input.requestPayload,
      status: "synced",
      connectorStatus: "synced",
      nextStep: "Inquilino ja possui customer_id Iugu vinculado.",
      customerUpdate: {
        gateway_provider: "iugu",
        gateway_customer_id: input.input.party.gateway_customer_id,
        gateway_customer_status: "synced",
        gateway_synced_at: syncedAt,
        gateway_metadata: {
          ...input.input.party.gateway_metadata,
          reused_existing_customer_id: true,
          synced_at: syncedAt,
        },
      },
    });
  }

  if (!input.input.party.email) {
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        iugu: buildIuguCustomerPayload(input.input.party),
      },
      status: "blocked",
      connectorStatus: "document_required",
      nextStep: "Cadastrar e-mail do inquilino antes de criar cliente na Iugu.",
    });
  }

  const iuguPayload = buildIuguCustomerPayload(input.input.party);
  const realApiEnabled = readBooleanSetting(input.input.gatewayAccount.settings, "enable_real_api");

  if (!realApiEnabled) {
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        iugu: iuguPayload,
      },
      status: "prepared",
      connectorStatus: "real_call_disabled",
      nextStep:
        "Adapter de cliente Iugu pronto. Defina settings.enable_real_api=true somente depois de validar credenciais e webhook.",
    });
  }

  const url = new URL(`${resolveIuguBaseUrl()}/customers`);
  url.searchParams.set("api_token", input.credential);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "ImobiFlow/1.0",
    },
    body: JSON.stringify(iuguPayload),
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        iugu: iuguPayload,
      },
      status: "failed",
      connectorStatus: "provider_error",
      realApiCall: true,
      providerHttpStatus: response.status,
      providerError: extractProviderError(responseBody) ?? response.statusText,
      nextStep: "Corrigir dados do inquilino ou credencial Iugu e tentar novamente.",
    });
  }

  const customerId = readString(responseBody.id);
  const syncedAt = new Date().toISOString();

  if (!customerId) {
    return buildCustomerSyncResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        iugu: iuguPayload,
      },
      status: "failed",
      connectorStatus: "provider_error",
      realApiCall: true,
      providerHttpStatus: response.status,
      providerError: "Iugu nao retornou id do cliente.",
      nextStep: "Verificar resposta do provedor antes de salvar o vinculo do cliente.",
    });
  }

  return buildCustomerSyncResult({
    input: input.input,
    environment: input.environment,
    requestPayload: {
      ...input.requestPayload,
      iugu: iuguPayload,
    },
    status: "synced",
    connectorStatus: "synced",
    realApiCall: true,
    providerHttpStatus: response.status,
    customerUpdate: {
      gateway_provider: "iugu",
      gateway_customer_id: customerId,
      gateway_customer_status: "synced",
      gateway_synced_at: syncedAt,
      gateway_metadata: {
        provider: "iugu",
        environment: input.environment,
        synced_at: syncedAt,
        external_reference: input.input.party.id,
      },
    },
    nextStep: "Cliente sincronizado na Iugu. A cobranca ja pode usar esse customer_id.",
  });
}

async function issueIuguCharge(input: {
  input: IssueGatewayChargeInput;
  environment: string;
  requestPayload: Record<string, unknown>;
  credential: string;
}) {
  const iuguPayload = buildIuguInvoicePayload(input.input.charge, input.input.gatewayAccount.settings);
  const customerId = readString(iuguPayload.customer_id);
  const email = readString(iuguPayload.email);

  if (!customerId && !email) {
    return buildIssueResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        iugu: iuguPayload,
      },
      status: "blocked",
      connectorStatus: "missing_customer_reference",
      nextStep:
        "Vincular customer_id Iugu ou e-mail do inquilino antes de emitir a fatura.",
    });
  }

  const realApiEnabled = readBooleanSetting(input.input.gatewayAccount.settings, "enable_real_api");

  if (!realApiEnabled) {
    return buildIssueResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        iugu: iuguPayload,
      },
      status: "prepared",
      connectorStatus: "real_call_disabled",
      nextStep:
        "Adapter Iugu pronto. Defina settings.enable_real_api=true somente depois de validar credenciais, customer_id/e-mail e webhook.",
    });
  }

  const url = new URL(`${resolveIuguBaseUrl()}/invoices`);
  url.searchParams.set("api_token", input.credential);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "ImobiFlow/1.0",
    },
    body: JSON.stringify(iuguPayload),
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    return buildIssueResult({
      input: input.input,
      environment: input.environment,
      requestPayload: {
        ...input.requestPayload,
        iugu: iuguPayload,
      },
      status: "failed",
      connectorStatus: "provider_error",
      realApiCall: true,
      providerHttpStatus: response.status,
      providerError: extractProviderError(responseBody) ?? response.statusText,
      nextStep:
        "Corrigir o erro retornado pela Iugu e tentar emitir novamente. A cobranca interna nao foi marcada como paga.",
    });
  }

  return buildIssueResult({
    input: input.input,
    environment: input.environment,
    requestPayload: {
      ...input.requestPayload,
      iugu: iuguPayload,
    },
    status: "issued",
    connectorStatus: "issued",
    realApiCall: true,
    providerHttpStatus: response.status,
    chargeUpdate: normalizeIuguInvoiceResponse(responseBody),
    nextStep:
      "Fatura emitida na Iugu. A liquidacao financeira continua dependente do webhook de confirmacao.",
  });
}

function buildAsaasPaymentPayload(charge: ChargeForGatewayIssue, customerId: string | null) {
  return {
    customer: customerId,
    billingType: toAsaasBillingType(charge.payment_method),
    value: charge.gross_amount_cents / 100,
    dueDate: charge.due_date,
    description: `ImobiFlow - cobranca de locacao ${charge.id}`,
    externalReference: charge.id,
  };
}

function buildAsaasCustomerPayload(party: GatewayCustomerParty) {
  return {
    name: party.name,
    cpfCnpj: normalizeDigits(party.document),
    email: party.email || undefined,
    mobilePhone: normalizeDigits(party.phone) || undefined,
    externalReference: party.id,
    notificationDisabled: false,
    observations: `ImobiFlow - inquilino do contrato ${party.contract_id}`,
  };
}

function buildIuguCustomerPayload(party: GatewayCustomerParty) {
  return {
    email: party.email,
    name: party.name,
    cpf_cnpj: normalizeDigits(party.document) || undefined,
    phone: normalizeDigits(party.phone) || undefined,
    notes: `ImobiFlow - inquilino do contrato ${party.contract_id}`,
    custom_variables: [
      { name: "imobiflow_party_id", value: party.id },
      { name: "imobiflow_company_id", value: party.company_id },
      { name: "imobiflow_contract_id", value: party.contract_id },
    ],
  };
}

function buildIuguInvoicePayload(charge: ChargeForGatewayIssue, settings: Record<string, unknown>) {
  const customerId =
    readStringSetting(settings, "iugu_customer_id") ??
    readStringSetting(settings, "default_customer_id") ??
    readNestedString(charge.metadata, ["gateway_customer_id"]) ??
    readNestedString(charge.metadata, ["tenant", "gateway_customer_id"]) ??
    readNestedString(charge.metadata, ["tenant", "iugu_customer_id"]);
  const email =
    readStringSetting(settings, "default_customer_email") ??
    readNestedString(charge.metadata, ["tenant", "email"]);
  const tenantName = readNestedString(charge.metadata, ["tenant", "name"]);
  const tenantDocument = normalizeDigits(readNestedString(charge.metadata, ["tenant", "document"]));
  const tenantPhone = normalizeDigits(readNestedString(charge.metadata, ["tenant", "phone"]));

  return {
    customer_id: customerId || undefined,
    email: customerId ? undefined : email || undefined,
    payer: buildIuguPayer({ name: tenantName, document: tenantDocument, phone: tenantPhone }),
    due_date: charge.due_date,
    payable_with: toIuguPayableWith(charge.payment_method),
    ensure_workday_due_date: false,
    ignore_due_email: false,
    items: [
      {
        description: `ImobiFlow - cobrança de locação ${charge.id}`,
        quantity: 1,
        price_cents: charge.gross_amount_cents,
      },
    ],
    custom_variables: [
      { name: "imobiflow_charge_id", value: charge.id },
      { name: "imobiflow_company_id", value: charge.company_id },
      { name: "imobiflow_contract_id", value: charge.contract_id },
      ...(charge.property_id ? [{ name: "imobiflow_property_id", value: charge.property_id }] : []),
      ...(charge.owner_id ? [{ name: "imobiflow_owner_id", value: charge.owner_id }] : []),
      ...(charge.tenant_party_id ? [{ name: "imobiflow_tenant_party_id", value: charge.tenant_party_id }] : []),
      ...(readNestedString(charge.metadata, ["rental_id"])
        ? [{ name: "imobiflow_rental_id", value: readNestedString(charge.metadata, ["rental_id"]) }]
        : []),
    ],
  };
}

function buildIuguPayer(input: { name: string | null; document: string | null; phone: string | null }) {
  if (!input.name && !input.document && !input.phone) return undefined;

  return {
    name: input.name || undefined,
    cpf_cnpj: input.document || undefined,
    phone: input.phone || undefined,
  };
}

function toIuguPayableWith(method: PaymentMethod) {
  if (method === "pix") return ["pix"];
  if (method === "boleto") return ["bank_slip"];
  if (method === "hybrid") return ["pix", "bank_slip"];
  if (method === "credit_card") return ["credit_card"];
  return ["all"];
}

function toAsaasBillingType(method: PaymentMethod) {
  if (method === "pix") return "PIX";
  if (method === "boleto") return "BOLETO";
  if (method === "credit_card") return "CREDIT_CARD";
  return "UNDEFINED";
}

function findAsaasCustomerId(charge: ChargeForGatewayIssue, settings: Record<string, unknown>) {
  return (
    readStringSetting(settings, "asaas_customer_id") ??
    readStringSetting(settings, "default_customer_id") ??
    readNestedString(charge.metadata, ["gateway_customer_id"]) ??
    readNestedString(charge.metadata, ["tenant", "gateway_customer_id"]) ??
    readNestedString(charge.metadata, ["tenant", "asaas_customer_id"])
  );
}

function resolveAsaasBaseUrl(environment: string) {
  return ["production", "prod", "live"].includes(environment.toLowerCase())
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

function resolveIuguBaseUrl() {
  return "https://api.iugu.com/v1";
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

type ChargeUpdate = NonNullable<GatewayIssueResult["charge_update"]>;

function normalizeAsaasPaymentResponse(response: Record<string, unknown>): ChargeUpdate {
  return {
    gateway_charge_id: readString(response.id),
    payment_url: readString(response.invoiceUrl),
    boleto_pdf_url: readString(response.bankSlipUrl),
    boleto_barcode: readString(response.identificationField),
    boleto_digitable_line: readString(response.identificationField),
  };
}

function normalizeIuguInvoiceResponse(response: Record<string, unknown>): ChargeUpdate {
  return {
    gateway_charge_id: readString(response.id),
    payment_url:
      readString(response.secure_url) ??
      readString(response.url) ??
      readNestedString(response, ["bank_slip", "url"]) ??
      readNestedString(response, ["pix", "url"]),
    boleto_pdf_url:
      readNestedString(response, ["bank_slip", "pdf"]) ??
      readNestedString(response, ["bank_slip", "pdf_url"]) ??
      readNestedString(response, ["bank_slip", "url"]) ??
      readString(response.bank_slip_url) ??
      readString(response.bank_slip_pdf_url) ??
      readString(response.pdf),
    boleto_barcode:
      readNestedString(response, ["bank_slip", "barcode"]) ??
      readNestedString(response, ["bank_slip", "bar_code"]) ??
      readString(response.bank_slip_barcode) ??
      readString(response.barcode),
    boleto_digitable_line:
      readNestedString(response, ["bank_slip", "digitable_line"]) ??
      readNestedString(response, ["bank_slip", "line"]) ??
      readString(response.bank_slip_digitable_line) ??
      readString(response.digitable_line),
    pix_qr_code:
      readNestedString(response, ["pix", "qrcode"]) ??
      readNestedString(response, ["pix", "qr_code"]) ??
      readNestedString(response, ["pix", "qr_code_image"]) ??
      readString(response.pix_qrcode) ??
      readString(response.pix_qr_code),
    pix_copy_paste:
      readNestedString(response, ["pix", "qrcode_text"]) ??
      readNestedString(response, ["pix", "qr_code_text"]) ??
      readNestedString(response, ["pix", "copy_paste"]) ??
      readNestedString(response, ["pix", "copy_and_paste"]) ??
      readString(response.pix_qrcode_text) ??
      readString(response.pix_copy_paste),
  };
}

async function enrichAsaasPaymentDetails(input: {
  baseUrl: string;
  credential: string;
  paymentMethod: PaymentMethod;
  responseBody: Record<string, unknown>;
}) {
  const chargeUpdate = normalizeAsaasPaymentResponse(input.responseBody);
  const paymentId = chargeUpdate.gateway_charge_id;
  if (!paymentId) return chargeUpdate;

  if (input.paymentMethod === "pix") {
    const pixDetails = await fetchAsaasPixQrCode({
      baseUrl: input.baseUrl,
      credential: input.credential,
      paymentId,
    });

    if (pixDetails.pix_qr_code || pixDetails.pix_copy_paste) {
      chargeUpdate.pix_qr_code = pixDetails.pix_qr_code;
      chargeUpdate.pix_copy_paste = pixDetails.pix_copy_paste;
    }
  }

  if (input.paymentMethod === "boleto") {
    const boletoDetails = await fetchAsaasBoletoIdentificationField({
      baseUrl: input.baseUrl,
      credential: input.credential,
      paymentId,
    });

    if (boletoDetails.boleto_digitable_line) {
      chargeUpdate.boleto_digitable_line = boletoDetails.boleto_digitable_line;
      chargeUpdate.boleto_barcode = boletoDetails.boleto_barcode;
    }
  }

  return chargeUpdate;
}

async function fetchAsaasPixQrCode(input: {
  baseUrl: string;
  credential: string;
  paymentId: string;
}) {
  const response = await fetch(`${input.baseUrl}/payments/${input.paymentId}/pixQrCode`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ImobiFlow/1.0",
      access_token: input.credential,
    },
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) return {};

  const encodedImage = readString(responseBody.encodedImage);
  return {
    pix_qr_code: encodedImage ? `data:image/png;base64,${encodedImage}` : null,
    pix_copy_paste: readString(responseBody.payload),
  };
}

async function fetchAsaasBoletoIdentificationField(input: {
  baseUrl: string;
  credential: string;
  paymentId: string;
}) {
  const response = await fetch(`${input.baseUrl}/payments/${input.paymentId}/identificationField`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "ImobiFlow/1.0",
      access_token: input.credential,
    },
  });
  const responseBody = await readJsonResponse(response);

  if (!response.ok) return {};

  const identificationField =
    readString(responseBody.identificationField) ??
    readString(responseBody.barCode) ??
    readString(responseBody.barcode);

  return {
    boleto_digitable_line: identificationField,
    boleto_barcode: identificationField,
  };
}

function extractProviderError(response: Record<string, unknown>) {
  const errors = response.errors;
  if (Array.isArray(errors)) {
    return errors
      .map((error) =>
        typeof error === "object" && error !== null
          ? readString((error as Record<string, unknown>).description) ??
            readString((error as Record<string, unknown>).message)
          : null,
      )
      .filter(Boolean)
      .join(" | ");
  }

  return readString(response.description) ?? readString(response.message) ?? readString(response.error);
}

function readStringSetting(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBooleanSetting(settings: Record<string, unknown>, key: string) {
  return settings[key] === true;
}

function readNestedString(input: Record<string, unknown>, path: string[]) {
  let current: unknown = input;

  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }

  return readString(current);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDigits(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

function resolveCredentialReference(reference?: string | null) {
  if (!reference) return null;

  const normalized = reference.trim();
  const envName = normalized.includes(":") ? normalized.split(":").at(-1) : normalized;
  if (!envName) return null;

  return process.env[envName] ?? null;
}

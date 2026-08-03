import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";

export type PaymentGatewayProvider =
  | "pjbank"
  | "asaas"
  | "iugu"
  | "mercado_pago"
  | "stripe"
  | "manual"
  | "other";

export type PaymentGatewayAccount = {
  id: string;
  company_id: string;
  provider: PaymentGatewayProvider;
  name: string;
  status: "active" | "inactive" | "testing" | "blocked" | "archived";
  credentials_ref: string | null;
  webhook_secret_ref: string | null;
  settings: {
    environment?: "sandbox" | "production";
    default_payment_method?: "pix" | "boleto" | "hybrid";
    webhook_url?: string;
    notes?: string;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
};

export type PaymentGatewayAccountInput = {
  provider: PaymentGatewayProvider;
  name: string;
  status: "active" | "inactive" | "testing";
  credentials_ref?: string;
  webhook_secret_ref?: string;
  settings: {
    environment: "sandbox" | "production";
    default_payment_method: "pix" | "boleto" | "hybrid";
    webhook_url?: string;
    notes?: string;
  };
};

function isPreviewGatewayAccounts() {
  return isPreviewToken(getStoredToken());
}

export async function listPaymentGatewayAccounts() {
  if (isPreviewGatewayAccounts()) {
    return { gateway_accounts: [] as PaymentGatewayAccount[] };
  }

  return apiRequest<{ gateway_accounts: PaymentGatewayAccount[] }>("/finance/gateway-accounts", {
    token: getStoredToken() ?? undefined,
  });
}

export async function createPaymentGatewayAccount(input: PaymentGatewayAccountInput) {
  if (isPreviewGatewayAccounts()) {
    throw new Error("A configuração real do gateway exige backend publicado e sessão autenticada.");
  }

  return apiRequest<{ gateway_account: PaymentGatewayAccount }>("/finance/gateway-accounts", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

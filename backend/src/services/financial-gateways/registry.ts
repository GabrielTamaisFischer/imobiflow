import { missingGatewayConnector } from "./errors.js";
import { manualFinancialGatewayConnector } from "./manual-gateway.js";
import type { FinancialGatewayConnector, FinancialGatewayProvider } from "./types.js";

const connectors = new Map<FinancialGatewayProvider, FinancialGatewayConnector>();

export function registerFinancialGatewayConnector(connector: FinancialGatewayConnector): void {
  connectors.set(connector.provider, connector);
}

export function getFinancialGatewayConnector(
  provider: FinancialGatewayProvider,
): FinancialGatewayConnector {
  const connector = connectors.get(provider);

  if (!connector) {
    throw missingGatewayConnector(provider);
  }

  return connector;
}

export function listFinancialGatewayProviders(): FinancialGatewayProvider[] {
  return Array.from(connectors.keys());
}

registerFinancialGatewayConnector(manualFinancialGatewayConnector);

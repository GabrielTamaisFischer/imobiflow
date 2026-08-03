import type { FinancialGatewayProvider } from "./types.js";

export class FinancialGatewayError extends Error {
  provider: FinancialGatewayProvider;
  operation: string;
  code: string;
  details?: unknown;

  constructor(input: {
    provider: FinancialGatewayProvider;
    operation: string;
    code: string;
    message: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "FinancialGatewayError";
    this.provider = input.provider;
    this.operation = input.operation;
    this.code = input.code;
    this.details = input.details;
  }
}

export function unsupportedGatewayOperation(
  provider: FinancialGatewayProvider,
  operation: string,
): FinancialGatewayError {
  return new FinancialGatewayError({
    provider,
    operation,
    code: "unsupported_operation",
    message: `O gateway ${provider} ainda nao suporta a operacao ${operation}.`,
  });
}

export function missingGatewayConnector(provider: FinancialGatewayProvider): FinancialGatewayError {
  return new FinancialGatewayError({
    provider,
    operation: "registry",
    code: "missing_connector",
    message: `Nenhum conector financeiro foi registrado para o gateway ${provider}.`,
  });
}

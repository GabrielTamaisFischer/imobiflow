export type BillingCheckoutRequest = {
  checkoutSessionId: string;
  plan: {
    slug: string;
    name: string;
    priceCents: number;
    currency: string;
    billingInterval: string;
  };
  purchaserEmail: string;
  successUrl: string;
  cancelUrl: string;
};

export type BillingCheckoutResult = {
  externalSessionId: string;
  checkoutUrl: string;
  expiresAt?: Date | null;
};

export type VerifiedPaymentEvent = {
  provider: string;
  externalEventId: string;
  externalSessionId: string;
  eventType: string;
  purchaserEmail: string;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  payloadHash: string;
  externalSubscriptionId?: string | null;
};

/**
 * Gateway-neutral boundary. An adapter may only return a checkout after it has
 * derived price and plan from the canonical MySQL Plan record. Payment events
 * must be signature-verified by the adapter before becoming VerifiedPaymentEvent.
 */
export interface BillingProvider {
  readonly name: string;
  createCheckout(input: BillingCheckoutRequest): Promise<BillingCheckoutResult>;
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<VerifiedPaymentEvent>;
}

export function getConfiguredBillingProvider(): BillingProvider | null {
  // No commercial provider has been selected. Future adapters are registered
  // here and nowhere in the authentication or activation domain.
  return null;
}

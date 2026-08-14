import { apiRequest } from "./api";

export type PublicPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  billing_interval: string;
  price_cents: number;
  currency: string;
  features: string[];
};

export async function listPlans() {
  return apiRequest<{ plans: PublicPlan[] }>("/billing/plans");
}

export async function startCheckout(planSlug: string, email: string) {
  return apiRequest<{
    checkout_session_id: string;
    checkout_url: string;
    status: string;
  }>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan_slug: planSlug, email }),
  });
}

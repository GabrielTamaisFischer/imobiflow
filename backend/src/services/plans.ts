import { supabaseAdmin } from "../lib/supabase.js";

export type PlanCatalogItem = {
  id: string;
  slug: string;
  name: string;
  billing_interval: "monthly" | "quarterly";
  price_cents: number;
  gateway: "kiwify" | "cakto" | null;
  checkout_url: string | null;
  sales_page_url: string | null;
  features_json: Record<string, unknown>;
  plan_features: Array<{
    feature_key: string;
    feature_name: string;
    limits_json: Record<string, unknown>;
  }>;
};

const defaultKiwifyPlanCatalog: Record<
  string,
  Pick<PlanCatalogItem, "gateway" | "checkout_url" | "sales_page_url">
> = {
  "start-monthly": {
    gateway: "kiwify",
    checkout_url: "https://pay.kiwify.com.br/YmVd46n",
    sales_page_url: "https://kiwify.app/FejQ33s",
  },
  "pro-monthly": {
    gateway: "kiwify",
    checkout_url: "https://pay.kiwify.com.br/zlmmvgv",
    sales_page_url: "https://kiwify.app/FejQ33s",
  },
  "enterprise-monthly": {
    gateway: "kiwify",
    checkout_url: "https://pay.kiwify.com.br/rbeAEEn",
    sales_page_url: "https://kiwify.app/FejQ33s",
  },
};

function enrichPlanCatalogItem(plan: Partial<PlanCatalogItem> & Pick<PlanCatalogItem, "slug">) {
  const defaults = defaultKiwifyPlanCatalog[plan.slug];

  return {
    ...plan,
    gateway: plan.gateway ?? defaults?.gateway ?? null,
    checkout_url: plan.checkout_url ?? defaults?.checkout_url ?? null,
    sales_page_url: plan.sales_page_url ?? defaults?.sales_page_url ?? null,
  } as PlanCatalogItem;
}

export async function listActivePlans() {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select(
      "id, slug, name, billing_interval, price_cents, gateway, checkout_url, sales_page_url, features_json, plan_features(feature_key, feature_name, limits_json)",
    )
    .eq("status", "active")
    .order("price_cents", { ascending: true });

  if (!error) {
    return (data ?? []).map(enrichPlanCatalogItem);
  }

  const isMissingCatalogColumn =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.message.toLowerCase().includes("column");

  if (!isMissingCatalogColumn) throw error;

  const fallback = await supabaseAdmin
    .from("plans")
    .select(
      "id, slug, name, billing_interval, price_cents, features_json, plan_features(feature_key, feature_name, limits_json)",
    )
    .eq("status", "active")
    .order("price_cents", { ascending: true });

  if (fallback.error) throw fallback.error;

  return (fallback.data ?? []).map(enrichPlanCatalogItem);
}

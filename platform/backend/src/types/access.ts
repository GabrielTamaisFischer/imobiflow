import type { User } from "@supabase/supabase-js";
import type { Request } from "express";

export type SubscriptionStatus =
  | "active"
  | "pending"
  | "trial"
  | "expired"
  | "cancelled"
  | "past_due"
  | "inactive";

export type UserRole = "owner" | "admin" | "broker" | "assistant" | string;

export type AccessContext = {
  authUser: User;
  appUser: {
    id: string;
    company_id: string;
    name: string;
    email: string;
    status: string;
    role: UserRole;
    permissions: string[];
  };
  company: {
    id: string;
    name: string;
    status: string;
  };
  subscription: {
    id: string;
    status: SubscriptionStatus;
    plan_slug: string | null;
    expires_at: string | null;
  } | null;
};

export type RequestWithAccess = Request & {
  access?: AccessContext;
};

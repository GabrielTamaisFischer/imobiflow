import type { Request } from "express";

export type SubscriptionStatus =
  | "ACTIVE"
  | "PENDING"
  | "PAST_DUE"
  | "SUSPENDED"
  | "CANCELLED"
  | "active"
  | "pending"
  | "trial"
  | "expired"
  | "cancelled"
  | "past_due"
  | "inactive";

export type UserRole = "owner" | "admin" | "broker" | "assistant" | string;

export type AccessContext = {
  authUser: {
    id: string;
    email: string;
    name: string;
  };
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
    grace_ends_at: string | null;
  } | null;
};

export type RequestWithAccess = Request & {
  access?: AccessContext;
  authSessionId?: string;
};

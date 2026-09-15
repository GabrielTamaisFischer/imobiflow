export type OwnerProfileRuntimeDiagnostic = {
  enabled: boolean;
  revision: string | null;
  received_started_at?: string | null;
  normalized_started_at?: string | null;
  prisma_returned_started_at?: string | null;
  reread_started_at?: string | null;
  serialized_started_at?: string | null;
};

function configuredRuntimeHosts() {
  return [
    process.env.APP_URL,
    process.env.FRONTEND_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_DOMAIN,
    process.env.VERCEL_URL,
  ].filter((value): value is string => Boolean(value));
}

export function isStagingRuntimeDiagnosticsEnabled() {
  if (process.env.NODE_ENV === "test") return true;
  if (process.env.VERCEL_ENV === "preview") return true;
  return configuredRuntimeHosts().some((value) => /(^|[./-])imobiflow-staging(?:\.vercel\.app)?(?=$|[./:-])/i.test(value));
}

export function createOwnerProfileRuntimeDiagnostic(): OwnerProfileRuntimeDiagnostic {
  const enabled = isStagingRuntimeDiagnosticsEnabled();
  return {
    enabled,
    revision: enabled ? process.env.VERCEL_GIT_COMMIT_SHA ?? null : null,
  };
}

export function isSyntheticQaOwner(owner: Record<string, unknown>) {
  const name = typeof owner.name === "string" ? owner.name : "";
  const email = typeof owner.email === "string" ? owner.email : "";
  return /\bqa\b/i.test(name) || /(?:\.test|@example\.)/i.test(email);
}

export function startedAtCheckpoint(value: unknown) {
  return typeof value === "string" ? value : value == null ? null : null;
}

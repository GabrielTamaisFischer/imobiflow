export const previewAccessToken = "imobiflow.preview_access";

export type PreviewAccessEnv = {
  DEV?: boolean;
  PROD?: boolean;
  VITE_IMOBIFLOW_ENABLE_PREVIEW?: string | boolean;
};

export function isPreviewAccessAllowed(env: PreviewAccessEnv) {
  if (env.PROD) return false;

  const explicitlyEnabled =
    env.VITE_IMOBIFLOW_ENABLE_PREVIEW === true || env.VITE_IMOBIFLOW_ENABLE_PREVIEW === "true";

  return Boolean(env.DEV) || explicitlyEnabled;
}

export function isStoredPreviewTokenAllowed(token: string | null, env: PreviewAccessEnv) {
  return token === previewAccessToken && isPreviewAccessAllowed(env);
}

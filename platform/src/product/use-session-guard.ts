import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isUnavailableProductionApi } from "./api";
import type { AccessResponse } from "./auth";
import {
  createLocalDevSession,
  createPreviewSession,
  getStoredToken,
  isLocalDevAccessEnabled,
  isPreviewAccessEnabled,
  loadSession,
  storeLocalDevAccess,
  storePreviewAccess,
} from "./auth";
import { isSubscriptionActive } from "./subscription";

export function useSessionGuard() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AccessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const token = getStoredToken();
      if (!token) {
        if (isLocalDevAccessEnabled()) {
          const localStored = storeLocalDevAccess();
          if (!localStored) {
            await navigate({ to: "/entrar" });
            return;
          }

          setSession(createLocalDevSession());
          setIsLoading(false);
          return;
        }

        if (isUnavailableProductionApi() && isPreviewAccessEnabled()) {
          const previewStored = storePreviewAccess();
          if (!previewStored) {
            await navigate({ to: "/entrar" });
            return;
          }

          setSession(createPreviewSession());
          setIsLoading(false);
          return;
        }

        await navigate({ to: "/entrar" });
        return;
      }

      try {
        const nextSession = await loadSession();
        const subscription = nextSession?.access.subscription;

        if (!isSubscriptionActive(subscription?.status, subscription?.expires_at)) {
          await navigate({ to: "/assinatura-bloqueada" });
          return;
        }

        setSession(nextSession);
      } catch {
        if (isUnavailableProductionApi() && isPreviewAccessEnabled()) {
          const previewStored = storePreviewAccess();
          if (previewStored) {
            setSession(createPreviewSession());
            setIsLoading(false);
            return;
          }
        }

        await navigate({ to: "/assinatura-bloqueada" });
      } finally {
        setIsLoading(false);
      }
    }

    void checkAccess();
  }, [navigate]);

  return { session, isLoading };
}

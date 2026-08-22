import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { AccessResponse } from "./auth";
import { clearToken, getStoredToken, loadSession } from "./auth";
import { isSubscriptionActive } from "./subscription";

export function useSessionGuard() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AccessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const token = getStoredToken();
      if (!token) {
        await navigate({ to: "/entrar" });
        setIsLoading(false);
        return;
      }

      try {
        const nextSession = await loadSession();
        if (!nextSession) {
          await navigate({ to: "/entrar" });
          return;
        }
        const subscription = nextSession.access.subscription;

        if (
          !isSubscriptionActive(
            subscription?.status,
            subscription?.expires_at,
            subscription?.grace_ends_at,
          )
        ) {
          await navigate({ to: "/assinatura-bloqueada" });
          return;
        }

        setSession(nextSession);
      } catch {
        clearToken();
        await navigate({ to: "/entrar" });
      } finally {
        setIsLoading(false);
      }
    }

    void checkAccess();
  }, [navigate]);

  return { session, isLoading };
}

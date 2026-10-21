import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  canEnterApplication,
  clearToken,
  getStoredToken,
  loadSession,
  type AccessResponse,
} from "./auth";
import { getLocalDevSession, isLocalFrontend } from "./local-dev-session";
import { resolveSessionFailure, saveOfflineSessionCache } from "./offline-session";

export function useSessionGuard() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AccessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineSession, setIsOfflineSession] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      if (isLocalFrontend()) {
        setSession(getLocalDevSession());
        setIsLoading(false);
        return;
      }

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
        if (!canEnterApplication(nextSession.access)) {
          await navigate({ to: "/assinatura-bloqueada" });
          return;
        }

        saveOfflineSessionCache(nextSession, getStoredToken());
        setIsOfflineSession(false);
        setSession(nextSession);
      } catch (error) {
        // Sem rede não é sessão inválida: antes o token era apagado aqui e a
        // vistoria offline (snapshot + fila) ficava inacessível no reload.
        const decision = resolveSessionFailure(error, token, {
          navigatorOnline: typeof navigator === "undefined" ? undefined : navigator.onLine,
        });
        if (decision.kind === "offline") {
          setIsOfflineSession(true);
          setSession(decision.session);
          return;
        }
        if (decision.clearToken) clearToken();
        await navigate({ to: "/entrar" });
      } finally {
        setIsLoading(false);
      }
    }

    void checkAccess();
  }, [navigate]);

  return { session, isLoading, isOfflineSession };
}

// Diretriz Mestre do MVP, Fase 1, Item 1: o cadastro aberto so pode aparecer
// fora de producao e com a flag explicita ligada — espelha, no frontend, o
// mesmo fail-safe do backend (isFreeRegistrationEnabled em backend/src/config/env.ts).
//
// Importante: isto controla APENAS se o formulario e exibido na UI. A regra
// que realmente protege producao e sempre imposta pelo backend em /auth/register
// (que responde 403 PAID_ACTIVATION_REQUIRED quando a flag do servidor esta
// desligada), entao mesmo que este flag do frontend seja mal configurado, o
// backend nunca cria uma conta gratuita fora de staging/dev.
export type RegistrationUiEnv = {
  PROD?: boolean;
  VITE_IMOBIFLOW_REGISTRATION_ENABLED?: string | boolean;
};

export function isFreeRegistrationUiEnabled(env: RegistrationUiEnv) {
  if (env.PROD) return false;

  return (
    env.VITE_IMOBIFLOW_REGISTRATION_ENABLED === true ||
    env.VITE_IMOBIFLOW_REGISTRATION_ENABLED === "true"
  );
}

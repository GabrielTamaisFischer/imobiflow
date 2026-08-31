import { DeepLinkWhatsAppProvider } from "./deeplink-whatsapp-provider.js";
import type { WhatsAppProvider } from "./types.js";

// Mesmo padrão de seleção usado em services/storage/index.ts. Hoje só existe
// o provider de deeplink (R$0, sem envio pelo servidor) — a função existe
// para que ativar um provider HTTP real (WhatsApp Business API paga) no
// futuro seja trocar esta função, nunca as rotas/eventos que já chamam
// getWhatsAppProvider().
export function getWhatsAppProvider(): WhatsAppProvider {
  return new DeepLinkWhatsAppProvider();
}

export type { WhatsAppDeepLink, WhatsAppDeepLinkInput, WhatsAppProvider } from "./types.js";

import { SyntheticWhatsAppProvider } from "./synthetic-whatsapp-provider.js";
import type { WhatsAppProvider } from "./types.js";

// Mesmo padrão de seleção usado em services/storage/index.ts. Hoje só existe
// o provider sintético (R$0) — a função existe para que ativar um provider
// HTTP real no futuro seja trocar esta função, nunca as rotas/eventos que
// já chamam getWhatsAppProvider().
export function getWhatsAppProvider(): WhatsAppProvider {
  return new SyntheticWhatsAppProvider();
}

export type { SentWhatsAppMessage, WhatsAppMessageInput, WhatsAppProvider } from "./types.js";

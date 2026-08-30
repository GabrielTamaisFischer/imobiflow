import { randomUUID } from "node:crypto";
import type { SentWhatsAppMessage, WhatsAppMessageInput, WhatsAppProvider } from "./types.js";

// SyntheticWhatsAppProvider — R$0, nunca envia uma mensagem de verdade.
// Usado enquanto nenhum provider real de WhatsApp Business API está
// configurado (o padrão hoje, sempre — ver services/whatsapp/index.ts).
// "Envia" a mensagem apenas registrando-a (console.log estruturado); quem
// chama este provider (property-events.ts) também grava um WebsiteAuditLog,
// então a mensagem fica auditável mesmo sem nenhum envio real acontecer.
export class SyntheticWhatsAppProvider implements WhatsAppProvider {
  readonly name = "synthetic_whatsapp" as const;

  async sendMessage(input: WhatsAppMessageInput): Promise<SentWhatsAppMessage> {
    const providerMessageId = `synthetic-${randomUUID()}`;

    console.log("[SyntheticWhatsAppProvider] Mensagem NAO enviada de verdade (R$0, apenas logada).", {
      companyId: input.companyId,
      toPhone: input.toPhone,
      toName: input.toName ?? null,
      message: input.message,
      providerMessageId,
    });

    return { provider: this.name, providerMessageId, status: "logged" };
  }
}

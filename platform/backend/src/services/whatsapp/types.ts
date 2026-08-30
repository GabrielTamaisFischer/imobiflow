// WhatsAppProvider — mesmo padrão de adapter usado em StorageProvider
// (services/storage/types.ts): uma interface estável que qualquer rota ou
// automação pode chamar, sem nunca conhecer qual implementação está ativa.
//
// Hoje só existe SyntheticWhatsAppProvider (R$0, apenas loga/registra —
// nunca envia uma mensagem real). Um provider HTTP real (WhatsApp Business
// API) pode ser adicionado depois implementando esta mesma interface, sem
// tocar em quem a chama (property-events.ts).

export type WhatsAppMessageInput = {
  companyId: string;
  toPhone: string;
  toName?: string | null;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
};

export type SentWhatsAppMessage = {
  provider: string;
  providerMessageId: string;
  status: "sent" | "logged";
};

export interface WhatsAppProvider {
  readonly name: string;
  sendMessage(input: WhatsAppMessageInput): Promise<SentWhatsAppMessage>;
}

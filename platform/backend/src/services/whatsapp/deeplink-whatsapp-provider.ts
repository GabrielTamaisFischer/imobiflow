import type { WhatsAppDeepLink, WhatsAppDeepLinkInput, WhatsAppProvider } from "./types.js";

// DeepLinkWhatsAppProvider — R$0, nunca envia uma mensagem de verdade pelo
// servidor. Monta um link https://wa.me/<telefone>?text=<mensagem>; o envio
// real só acontece se e quando o USUÁRIO clicar no botão da UI, o WhatsApp
// abrir com o texto pré-preenchido, e o usuário confirmar o envio dentro do
// próprio WhatsApp. Nada aqui afirma ou registra "mensagem enviada" — quem
// chama este provider (property-events.ts) só pode registrar, no máximo,
// que o link foi ABERTO pelo usuário (property_published_whatsapp_link_opened),
// nunca que a mensagem chegou ao destinatário.
export class DeepLinkWhatsAppProvider implements WhatsAppProvider {
  readonly name = "whatsapp_deeplink" as const;

  buildDeepLink(input: WhatsAppDeepLinkInput): WhatsAppDeepLink {
    const digits = toWhatsAppDigits(input.toPhone);
    const encodedMessage = encodeURIComponent(input.message);
    const url = digits
      ? `https://wa.me/${digits}?text=${encodedMessage}`
      : `https://wa.me/?text=${encodedMessage}`;

    return { provider: this.name, url, phone: digits ?? input.toPhone, message: input.message };
  }
}

// Telefones no Brasil chegam em formatos variados ((11) 91234-5678, +55 11
// 91234-5678, 11912345678...). wa.me exige só dígitos, com código do país.
// DDD (2 dígitos) + número (8 ou 9 dígitos) = 10 ou 11 dígitos sem código de
// país: nesse caso, assume Brasil (55) — é a origem do produto e da imensa
// maioria dos dados cadastrados. Números que já vêm com código de país
// (12-13 dígitos) são preservados como estão.
function toWhatsAppDigits(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

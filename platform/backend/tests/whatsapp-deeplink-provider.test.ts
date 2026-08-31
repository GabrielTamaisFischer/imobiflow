import { describe, expect, it } from "vitest";
import { DeepLinkWhatsAppProvider } from "../src/services/whatsapp/deeplink-whatsapp-provider.js";
import { getWhatsAppProvider } from "../src/services/whatsapp/index.js";

// Diretriz Mestre do MVP, Seção 7: o servidor NUNCA envia uma mensagem de
// WhatsApp — só monta um link https://wa.me/... Estes testes existem para
// travar essa garantia: o provider é síncrono (nenhuma chamada de rede),
// nunca retorna um status "enviado", e o link é montado corretamente a
// partir dos dados do proprietário/imóvel.
describe("DeepLinkWhatsAppProvider", () => {
  it("builds a wa.me link without ever performing network I/O (purely synchronous)", () => {
    const provider = new DeepLinkWhatsAppProvider();
    const result = provider.buildDeepLink({
      companyId: "company-a",
      toPhone: "(11) 91234-5678",
      toName: "João",
      message: "Olá, João! Seu imóvel foi publicado: https://example.test/site/a/imoveis/123",
    });

    expect(result.provider).toBe("whatsapp_deeplink");
    expect(result.url).toBe(
      "https://wa.me/5511912345678?text=" +
        encodeURIComponent(
          "Olá, João! Seu imóvel foi publicado: https://example.test/site/a/imoveis/123",
        ),
    );
    expect(result.phone).toBe("5511912345678");
    // A garantia central: o retorno nunca contém um campo/status que possa
    // ser lido como "mensagem enviada" — só o link pronto para ser aberto.
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("sent");
  });

  it("preserves a Brazilian phone number that already includes the country code (55)", () => {
    const provider = new DeepLinkWhatsAppProvider();
    const result = provider.buildDeepLink({
      companyId: "company-a",
      toPhone: "+55 (11) 91234-5678",
      message: "test",
    });
    expect(result.phone).toBe("5511912345678");
  });

  it("falls back to a link without a phone number when none is available, rather than throwing", () => {
    const provider = new DeepLinkWhatsAppProvider();
    const result = provider.buildDeepLink({ companyId: "company-a", toPhone: "", message: "oi" });
    expect(result.url).toBe(`https://wa.me/?text=${encodeURIComponent("oi")}`);
  });

  it("getWhatsAppProvider() returns the deeplink provider (never a real-send provider) in this MVP", () => {
    const provider = getWhatsAppProvider();
    expect(provider.name).toBe("whatsapp_deeplink");
    expect(typeof provider.buildDeepLink).toBe("function");
  });
});

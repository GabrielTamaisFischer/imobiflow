import { describe, expect, it } from "vitest";
import {
  getIntegrationProvider,
  integrationProviderCatalog,
} from "../src/services/external-integrations.js";

describe("external integrations catalog", () => {
  it("lista todos os provedores solicitados para a central de integracoes", () => {
    expect(integrationProviderCatalog.map((provider) => provider.provider)).toEqual(
      expect.arrayContaining([
        "whatsapp_business",
        "zap_imoveis",
        "olx",
        "viva_real",
        "stripe",
        "google",
        "asaas",
        "receita_federal",
      ]),
    );
  });

  it("mantem pagamentos, portais e comunicacao separados por categoria", () => {
    expect(getIntegrationProvider("asaas")?.category).toBe("payment");
    expect(getIntegrationProvider("stripe")?.category).toBe("payment");
    expect(getIntegrationProvider("zap_imoveis")?.category).toBe("real_estate_portal");
    expect(getIntegrationProvider("olx")?.category).toBe("real_estate_portal");
    expect(getIntegrationProvider("viva_real")?.category).toBe("real_estate_portal");
    expect(getIntegrationProvider("whatsapp_business")?.category).toBe("communication");
    expect(getIntegrationProvider("google")?.category).toBe("productivity");
    expect(getIntegrationProvider("receita_federal")?.category).toBe("identity");
  });

  it("define credenciais, configuracoes e capacidades para cada provedor", () => {
    for (const provider of integrationProviderCatalog) {
      expect(provider.label.length).toBeGreaterThan(2);
      expect(provider.capabilities.length).toBeGreaterThan(0);
      expect(provider.requiredCredentialRefs.length).toBeGreaterThan(0);
      expect(provider.requiredSettings.length).toBeGreaterThan(0);
      expect(provider.notes.length).toBeGreaterThan(10);
    }
  });
});

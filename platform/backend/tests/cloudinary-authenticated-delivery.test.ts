import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fast-follow de privacidade (F4E, 2026-09-05): o blocker que impedia o
// fechamento da Fase 4 era que `owner_document` (contratos, RG/CPF,
// comprovantes) era enviado ao Cloudinary com delivery padrão ("upload"),
// que serve o arquivo para qualquer um que obtenha a `secureUrl`, sem passar
// pela camada de autorização do ImobiFlow. Este arquivo cobre a mecânica
// central da correção, isolada do resto da rota HTTP:
//
//   1. upload de owner_document chama o SDK com type: "authenticated";
//   2. upload de outros propósitos (ex.: property_image) continua "upload"
//      (undefined) — delivery público inalterado;
//   3. deliveryAccessForPurpose só retorna "authenticated" para
//      owner_document — todos os outros propósitos hoje existentes
//      permanecem "public" sem exigir mudança de código;
//   4/8. getAuthenticatedDownloadUrl usa o método oficial da SDK
//      (cloudinary.utils.private_download_url) com type "authenticated" e
//      expires_at definido (acesso de curta duração, não uma URL
//      permanente);
//   7. delete usa o mesmo `type` do upload (authenticated vs. undefined) —
//      nunca um valor fixo/hardcoded.
//
// O SDK do Cloudinary é sempre mockado — nenhum destes testes toca a rede
// real nem usa credenciais reais.

const uploadStreamMock = vi.fn((_options: unknown) => _options);
const destroyMock = vi.fn().mockResolvedValue({ result: "ok" });
const privateDownloadUrlMock = vi.fn(
  (publicId: string, _format: string, options: Record<string, unknown>) =>
    `https://res.cloudinary.example/authenticated/${publicId}?type=${options.type}&expires_at=${options.expires_at}`,
);

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: (options: unknown, callback: (error: unknown, result: unknown) => void) => {
        uploadStreamMock(options);
        return {
          end: () => {
            callback(null, {
              public_id: "imobiflow/company-1/owners/owner-1/documents/mock",
              resource_type: "raw",
              secure_url: "https://res.cloudinary.example/mock.pdf",
              bytes: 1024,
              width: null,
              height: null,
              format: "pdf",
            });
          },
        };
      },
      destroy: destroyMock,
    },
    url: vi.fn(() => "https://res.cloudinary.example/mock"),
    utils: { private_download_url: privateDownloadUrlMock },
  },
}));

const { CloudinaryStorageProvider } = await import("../src/services/storage/cloudinary-storage.js");
const { deliveryAccessForPurpose, STORED_FILE_PURPOSES } =
  await import("../src/services/storage/purposes.js");

function buildProvider() {
  return new CloudinaryStorageProvider({
    CLOUDINARY_CLOUD_NAME: "fake-cloud-for-tests",
    CLOUDINARY_API_KEY: "fake-key-for-tests",
    CLOUDINARY_API_SECRET: "fake-secret-for-tests",
  });
}

const body = Buffer.from([0x25, 0x50, 0x44, 0x46]);

function uploadInput(overrides: Record<string, unknown> = {}) {
  return {
    companyId: "company-1",
    entityType: "property_owner",
    entityId: "owner-1",
    purpose: "document" as const,
    fileName: "contrato.pdf",
    mimeType: "application/pdf",
    sizeBytes: body.byteLength,
    body,
    folder: "imobiflow/company-1/owners/owner-1/documents",
    ...overrides,
  };
}

describe("[F4E fast-follow] delivery access para owner_document no Cloudinary", () => {
  beforeEach(() => {
    uploadStreamMock.mockClear();
    destroyMock.mockClear();
    privateDownloadUrlMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("#1 upload de owner_document (deliveryAccess=authenticated) chama o SDK com type=authenticated", async () => {
    const provider = buildProvider();
    await provider.uploadFile(uploadInput({ deliveryAccess: "authenticated" }));

    expect(uploadStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "authenticated" }),
    );
  });

  it("#2 upload sem deliveryAccess (ex.: property_image) continua delivery público — type undefined", async () => {
    const provider = buildProvider();
    await provider.uploadFile(
      uploadInput({
        purpose: "property_image",
        folder: "imobiflow/company-1/properties/p1/images",
      }),
    );

    const receivedOptions = uploadStreamMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(receivedOptions.type).toBeUndefined();
  });

  it("#3 purposes privados exigem delivery authenticated e os públicos permanecem public", () => {
    const expectedDelivery: Record<
      (typeof STORED_FILE_PURPOSES)[number],
      "public" | "authenticated"
    > = {
      property_media: "public",
      contract_document: "authenticated",
      signed_contract: "authenticated",
      inspection_evidence: "authenticated",
      inspection_report: "authenticated",
      inspection_comparison: "authenticated",
      owner_document: "authenticated",
      tenant_document: "public",
      buyer_document: "public",
      financial_document: "public",
      signature_evidence: "authenticated",
      inspection_signature: "authenticated",
      contract_attachment: "authenticated",
      contract_signature: "authenticated",
      company_logo: "public",
    };

    for (const purpose of STORED_FILE_PURPOSES) {
      expect(deliveryAccessForPurpose(purpose)).toBe(expectedDelivery[purpose]);
    }
  });

  it("deliveryAccessForPurpose trata purpose ausente/desconhecido como public (nunca assume authenticated às cegas)", () => {
    expect(deliveryAccessForPurpose(null)).toBe("public");
    expect(deliveryAccessForPurpose(undefined)).toBe("public");
    expect(deliveryAccessForPurpose("algo-nao-mapeado")).toBe("public");
  });

  it("#4/#8 getAuthenticatedDownloadUrl usa o método oficial da SDK com type=authenticated e expires_at (acesso de curta duração)", () => {
    const provider = buildProvider();
    const before = Math.floor(Date.now() / 1000);

    const url = provider.getAuthenticatedDownloadUrl({
      publicId: "imobiflow/company-1/owners/owner-1/documents/mock",
      resourceType: "raw",
      format: "pdf",
    });

    expect(privateDownloadUrlMock).toHaveBeenCalledWith(
      "imobiflow/company-1/owners/owner-1/documents/mock",
      "pdf",
      expect.objectContaining({ resource_type: "raw", type: "authenticated" }),
    );
    const receivedOptions = privateDownloadUrlMock.mock.calls[0]?.[2] as { expires_at: number };
    // expires_at é um timestamp curto (poucos segundos a partir de agora),
    // nunca ausente/undefined (o que produziria uma URL sem expiração) nem
    // um valor distante no futuro (que equivaleria, na prática, a permanente).
    expect(receivedOptions.expires_at).toBeGreaterThanOrEqual(before);
    expect(receivedOptions.expires_at).toBeLessThanOrEqual(before + 120);
    expect(url).toContain("type=authenticated");
  });

  it("#7 delete de owner_document (deliveryAccess=authenticated) chama destroy com type=authenticated", async () => {
    const provider = buildProvider();
    await provider.deleteFile({
      publicId: "imobiflow/company-1/owners/owner-1/documents/mock",
      resourceType: "raw",
      deliveryAccess: "authenticated",
    });

    expect(destroyMock).toHaveBeenCalledWith(
      "imobiflow/company-1/owners/owner-1/documents/mock",
      expect.objectContaining({ type: "authenticated" }),
    );
  });

  it("#7 delete sem deliveryAccess (outros propósitos) continua com type undefined — nunca hardcoded", async () => {
    const provider = buildProvider();
    await provider.deleteFile({
      publicId: "imobiflow/company-1/properties/p1/images/mock",
      resourceType: "image",
    });

    const receivedOptions = destroyMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(receivedOptions.type).toBeUndefined();
  });
});

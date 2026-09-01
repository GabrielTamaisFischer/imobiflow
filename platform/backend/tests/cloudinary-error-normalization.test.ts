import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bug 4: o SDK do Cloudinary, quando a propria chamada a API falha, lanca um
// erro no formato { message, http_code, name } — SEM `statusCode`. Como
// error-handler.ts so reconhece `statusCode`, esse formato sempre caia no
// branch padrao (500 INTERNAL_ERROR generico), mascarando completamente o
// motivo real da falha. Estes testes cobrem a instrumentacao diagnostica
// (CloudinaryStorageProvider.uploadFile) que normaliza esse formato para o
// mesmo padrao ja usado no resto do storage (statusCode + code + mensagem
// sanitizada), sem jamais expor credenciais/segredos.
//
// A chamada real de rede do Cloudinary e mockada — nenhum destes testes
// toca a API real do Cloudinary nem qualquer credencial real.

type CloudinarySdkError = { message: string; http_code: number; name: string };
type NextUploadResult = { error: unknown; result: unknown };

const uploadStreamMock = vi.fn((_options: unknown) => _options);
const nextResultHolder: { current: NextUploadResult } = { current: { error: null, result: null } };

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: (options: unknown, callback: (error: unknown, result: unknown) => void) => {
        uploadStreamMock(options);
        return {
          end: () => {
            const { error, result } = nextResultHolder.current;
            callback(error, result);
          },
        };
      },
      destroy: vi.fn(),
    },
    url: vi.fn(() => "https://res.cloudinary.example/mock"),
  },
}));

// Import depois do mock (ESM hoisting do vi.mock cobre isso automaticamente).
const { CloudinaryStorageProvider } = await import("../src/services/storage/cloudinary-storage.js");

function fakeCloudinaryError(httpCode: number, message = "mensagem crua do Cloudinary com detalhe interno"): CloudinarySdkError {
  return { message, http_code: httpCode, name: "UnexpectedResponse" };
}

function setNextUploadResult(next: NextUploadResult) {
  nextResultHolder.current = next;
}

const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function buildProvider() {
  // Credenciais obviamente falsas, apenas para satisfazer o guard de
  // configuracao (configure()) e chegar ate a chamada de upload mockada.
  // Nunca sao usadas para uma chamada de rede real.
  return new CloudinaryStorageProvider({
    CLOUDINARY_CLOUD_NAME: "fake-cloud-for-tests",
    CLOUDINARY_API_KEY: "fake-key-for-tests",
    CLOUDINARY_API_SECRET: "fake-secret-for-tests",
  });
}

function uploadInput() {
  return {
    companyId: "company-1",
    entityType: "property_media",
    entityId: null,
    purpose: "property_image" as const,
    fileName: "fachada.jpg",
    mimeType: "image/jpeg",
    sizeBytes: body.byteLength,
    body,
    folder: "imobiflow/company-1/properties/property-1/images",
  };
}

describe("normalizacao de erro do provider Cloudinary (Bug 4)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    uploadStreamMock.mockClear();
  });

  it("http_code=403 sem statusCode vira erro reconhecido de auth do provider (nao 500 generico)", async () => {
    setNextUploadResult({ error: fakeCloudinaryError(403), result: null });
    const provider = buildProvider();

    await expect(provider.uploadFile(uploadInput())).rejects.toMatchObject({
      statusCode: 502,
      code: "STORAGE_PROVIDER_AUTH_ERROR",
    });
  });

  it("http_code=401 sem statusCode tambem vira erro de auth do provider", async () => {
    setNextUploadResult({ error: fakeCloudinaryError(401), result: null });
    const provider = buildProvider();

    await expect(provider.uploadFile(uploadInput())).rejects.toMatchObject({
      statusCode: 502,
      code: "STORAGE_PROVIDER_AUTH_ERROR",
    });
  });

  it("http_code=429 vira erro de rate limit do provider", async () => {
    setNextUploadResult({ error: fakeCloudinaryError(429), result: null });
    const provider = buildProvider();

    await expect(provider.uploadFile(uploadInput())).rejects.toMatchObject({
      statusCode: 503,
      code: "STORAGE_PROVIDER_RATE_LIMITED",
    });
  });

  it("http_code=500 (5xx) vira erro de indisponibilidade do provider", async () => {
    setNextUploadResult({ error: fakeCloudinaryError(500), result: null });
    const provider = buildProvider();

    await expect(provider.uploadFile(uploadInput())).rejects.toMatchObject({
      statusCode: 502,
      code: "STORAGE_PROVIDER_UNAVAILABLE",
    });
  });

  it("erro ja tipado com statusCode (ex.: guard existente STORAGE_NOT_CONFIGURED) nao e re-processado", async () => {
    // Simula um provider sem nenhuma credencial configurada — o guard
    // configure() (ja existente, nao alterado por esta instrumentacao) deve
    // continuar lancando 503/STORAGE_NOT_CONFIGURED, sem passar pela
    // normalizacao de erro do Cloudinary (que nunca chega a ser chamada).
    const provider = new CloudinaryStorageProvider({});

    await expect(provider.uploadFile(uploadInput())).rejects.toMatchObject({
      statusCode: 503,
      code: "STORAGE_NOT_CONFIGURED",
    });
    expect(uploadStreamMock).not.toHaveBeenCalled();
  });

  it("erro em formato inesperado (sem http_code) e repassado sem alteracao — sem regressao no caminho generico", async () => {
    const genericError = new Error("falha generica inesperada, sem http_code");
    setNextUploadResult({ error: genericError, result: null });
    const provider = buildProvider();

    await expect(provider.uploadFile(uploadInput())).rejects.toBe(genericError);
  });

  it("nao vaza segredo/mensagem sensivel: mensagem do erro exposto nao contem a mensagem crua do Cloudinary nem credenciais", async () => {
    const rawMessage = "cloud_name fake-cloud-for-tests invalid api_key fake-key-for-tests";
    setNextUploadResult({ error: fakeCloudinaryError(401, rawMessage), result: null });
    const provider = buildProvider();

    let caught: unknown;
    try {
      await provider.uploadFile(uploadInput());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const exposedMessage = (caught as Error).message;
    expect(exposedMessage).not.toContain(rawMessage);
    expect(exposedMessage).not.toContain("fake-key-for-tests");
    expect(exposedMessage).not.toContain("fake-secret-for-tests");
    expect(exposedMessage).not.toContain("cloud_name");
  });

  it("log server-side sanitizado contem apenas provider/operacao/http_code/name/companyId/folder — nunca message nem credenciais", async () => {
    const rawMessage = "mensagem crua com api_secret=fake-secret-for-tests embutido";
    setNextUploadResult({ error: fakeCloudinaryError(403, rawMessage), result: null });
    const provider = buildProvider();

    await expect(provider.uploadFile(uploadInput())).rejects.toBeDefined();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const loggedPayload = consoleErrorSpy.mock.calls[0]?.[0];
    expect(loggedPayload).toMatchObject({
      provider: "cloudinary",
      operation: "upload",
      http_code: 403,
      companyId: "company-1",
      folder: "imobiflow/company-1/properties/property-1/images",
    });
    expect(Object.keys(loggedPayload as Record<string, unknown>).sort()).toEqual(
      ["companyId", "folder", "http_code", "name", "operation", "provider"].sort(),
    );
    const serializedLog = JSON.stringify(loggedPayload);
    expect(serializedLog).not.toContain("fake-secret-for-tests");
    expect(serializedLog).not.toContain(rawMessage);
    expect(serializedLog).not.toContain("api_secret");
  });
});

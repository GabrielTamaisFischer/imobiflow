import { randomUUID } from "node:crypto";
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { env } from "../../config/env.js";
import { resourceTypeForMime } from "./file-policy.js";
import type { DeleteFileInput, PublicUrlOptions, StorageProvider, StoredFile, UploadFileInput } from "./types.js";

type CloudinaryConfig = {
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_UPLOAD_FOLDER?: string;
  CLOUDINARY_UPLOAD_PRESET?: string;
};

export function getMissingCloudinaryConfig(config: CloudinaryConfig = env): string[] {
  const entries: Array<[string, string | undefined]> = [
    ["CLOUDINARY_CLOUD_NAME", config.CLOUDINARY_CLOUD_NAME],
    ["CLOUDINARY_API_KEY", config.CLOUDINARY_API_KEY],
    ["CLOUDINARY_API_SECRET", config.CLOUDINARY_API_SECRET],
  ];
  return entries.filter(([, value]) => !value).map(([key]) => key);
}

export class CloudinaryStorageProvider implements StorageProvider {
  readonly name = "cloudinary" as const;

  constructor(private readonly config: CloudinaryConfig = env) {}

  async uploadFile(input: UploadFileInput): Promise<StoredFile> {
    this.configure();

    const resourceType = resourceTypeForMime(input.mimeType);
    let result: UploadApiResponse;
    try {
      result = await uploadBuffer(input.body, {
        resource_type: resourceType,
        folder: input.folder,
        public_id: `${randomUUID()}-${safeBaseName(input.fileName)}`,
        overwrite: false,
        use_filename: false,
        unique_filename: false,
        upload_preset: this.config.CLOUDINARY_UPLOAD_PRESET || undefined,
        context: cleanContext({
          company_id: input.companyId,
          entity_type: input.entityType,
          entity_id: input.entityId ?? "",
          purpose: input.purpose,
          original_filename: input.fileName,
          is_test_data: input.isTestData ? "true" : "false",
          test_batch_id: input.testBatchId ?? "",
          ...input.metadata,
        }),
        tags: ["imobiflow", input.companyId, input.purpose, input.isTestData ? "qa" : "production"].filter(Boolean),
      });
    } catch (error) {
      throw normalizeCloudinaryError(error, {
        operation: "upload",
        companyId: input.companyId,
        // input.folder ja e o mesmo valor enviado ao Cloudinary (contem
        // companyId/propertyId como segmentos de path) — nao e segredo,
        // e por isso seguro para log server-side sanitizado.
        folder: input.folder,
      });
    }

    return {
      provider: this.name,
      publicId: result.public_id,
      resourceType: (result.resource_type as StoredFile["resourceType"]) ?? resourceType,
      secureUrl: result.secure_url,
      originalFilename: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: result.bytes ?? input.body.byteLength,
      width: result.width ?? null,
      height: result.height ?? null,
      format: result.format ?? null,
    };
  }

  async deleteFile(input: DeleteFileInput): Promise<void> {
    this.configure();
    await cloudinary.uploader.destroy(input.publicId, {
      resource_type: input.resourceType ?? "image",
      invalidate: true,
    });
  }

  getPublicUrl(publicId: string, options: PublicUrlOptions = {}) {
    this.configure();
    return cloudinary.url(publicId, {
      secure: true,
      resource_type: options.resourceType ?? "image",
      transformation: imageTransformation(options.variant, options.watermark),
    });
  }

  private configure() {
    const missing = getMissingCloudinaryConfig(this.config);
    if (missing.length) {
      throw Object.assign(
        new Error(`Cloudinary nao configurado. Variaveis ausentes: ${missing.join(", ")}.`),
        { statusCode: 503, code: "STORAGE_NOT_CONFIGURED" },
      );
    }

    cloudinary.config({
      cloud_name: this.config.CLOUDINARY_CLOUD_NAME,
      api_key: this.config.CLOUDINARY_API_KEY,
      api_secret: this.config.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

// Erro real de rede/API do SDK do Cloudinary (nao lancado pelo nosso codigo):
// tipicamente { message, http_code, name }, SEM `statusCode`. Como
// error-handler.ts so reconhece `statusCode`, esse formato caia sempre no
// branch padrao (500 INTERNAL_ERROR generico) e mascarava completamente o
// motivo real da falha (Bug 4). Esta funcao reconhece esse formato e o
// normaliza para o mesmo padrao ja usado no resto do storage
// (Object.assign(new Error(...), { statusCode, code })), com uma mensagem
// SANITIZADA nossa — nunca a mensagem crua do Cloudinary — e nunca inclui
// api_key/api_secret/cloud_name/headers/tokens/payload.
function isCloudinaryApiError(error: unknown): error is { http_code: number; name?: string; message?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { http_code?: unknown }).http_code === "number" &&
    typeof (error as { statusCode?: unknown }).statusCode !== "number"
  );
}

function normalizeCloudinaryError(
  error: unknown,
  context: { operation: string; companyId: string; folder: string },
): unknown {
  if (!isCloudinaryApiError(error)) {
    // Formato inesperado (nao e um erro de API do Cloudinary reconhecido) —
    // repassa sem alterar; o error-handler generico continua cobrindo esse
    // caso (500 + log existente), sem regressao.
    return error;
  }

  const httpCode = error.http_code;

  // Log server-side sanitizado: apenas provider, operacao, http_code, name
  // e o contexto ja não-sensível (companyId, folder — o mesmo valor enviado
  // ao Cloudinary). NUNCA loga error.message (pode, em tese, ecoar detalhes
  // de configuracao) nem qualquer credencial/segredo/token/URL assinada.
  console.error({
    provider: "cloudinary",
    operation: context.operation,
    http_code: httpCode,
    name: error.name ?? "CloudinaryApiError",
    companyId: context.companyId,
    folder: context.folder,
  });

  if (httpCode === 401 || httpCode === 403) {
    return Object.assign(
      new Error("Falha de autenticacao com o provedor de armazenamento de midia. Verifique a configuracao do provedor."),
      { statusCode: 502, code: "STORAGE_PROVIDER_AUTH_ERROR" },
    );
  }

  if (httpCode === 420 || httpCode === 429) {
    return Object.assign(
      new Error("O provedor de armazenamento de midia limitou as requisicoes no momento. Tente novamente em instantes."),
      { statusCode: 503, code: "STORAGE_PROVIDER_RATE_LIMITED" },
    );
  }

  if (httpCode >= 500) {
    return Object.assign(
      new Error("O provedor de armazenamento de midia esta indisponivel no momento. Tente novamente em instantes."),
      { statusCode: 502, code: "STORAGE_PROVIDER_UNAVAILABLE" },
    );
  }

  return Object.assign(
    new Error("Nao foi possivel concluir o upload no provedor de armazenamento de midia."),
    { statusCode: 502, code: "STORAGE_PROVIDER_ERROR" },
  );
}

function uploadBuffer(body: Buffer | Uint8Array, options: UploadApiOptions) {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      if (!result) {
        reject(new Error("Cloudinary nao retornou metadados do upload."));
        return;
      }
      resolve(result);
    });

    upload.end(Buffer.from(body));
  });
}

function imageTransformation(variant?: PublicUrlOptions["variant"], watermark?: PublicUrlOptions["watermark"]) {
  if (!variant) return undefined;
  const variants: Record<NonNullable<PublicUrlOptions["variant"]>, UploadApiOptions["transformation"]> = {
    thumbnail: [{ width: 240, height: 180, crop: "fill", gravity: "auto", fetch_format: "auto", quality: "auto" }],
    card: [{ width: 720, height: 480, crop: "fill", gravity: "auto", fetch_format: "auto", quality: "auto" }],
    gallery: [{ width: 1200, height: 800, crop: "limit", fetch_format: "auto", quality: "auto" }],
    full: [{ width: 1920, height: 1280, crop: "limit", fetch_format: "auto", quality: "auto" }],
  };
  const base = variants[variant];
  if (!watermark || !Array.isArray(base)) return base;

  // F3C: overlay aplicado como um SEGUNDO passo encadeado da transformação
  // (chain, separado por "/" na URL final) — nunca sobre o public_id
  // original, nunca gravado em disco/Cloudinary como um novo asset. Opera
  // sobre o resultado do passo anterior (a variante já redimensionada/
  // otimizada), por isso a logo escala de forma proporcional ao tamanho
  // final da imagem em vez de a um tamanho fixo em pixels.
  return [...base, watermarkOverlayStep(watermark)];
}

function watermarkOverlayStep(watermark: NonNullable<PublicUrlOptions["watermark"]>): Record<string, unknown> {
  const gravityByPosition: Record<string, string> = {
    "bottom-right": "south_east",
    "bottom-left": "south_west",
    "top-right": "north_east",
    "top-left": "north_west",
    center: "center",
  };
  const gravity = gravityByPosition[watermark.position] ?? "south_east";
  const step: Record<string, unknown> = {
    // Cloudinary usa ":" como separador de pasta no parametro de overlay
    // (l_...), em vez de "/". O public_id em si nunca vem do cliente (ver
    // WatermarkOverlay em types.ts).
    overlay: watermark.publicId.replace(/\//g, ":"),
    gravity,
    opacity: Math.min(100, Math.max(1, Math.round(watermark.opacity))),
    // Logo dimensionada como fracao relativa da imagem base (18% da
    // largura), preservando proporcao — nunca um tamanho fixo que ficaria
    // desproporcional entre a variante "gallery" (1200x800) e outras.
    width: 0.18,
    crop: "scale",
    flags: "relative",
  };
  if (gravity !== "center") {
    step.x = 24;
    step.y = 24;
  }
  return step;
}

function safeBaseName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return (
    baseName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "arquivo"
  );
}

function cleanContext(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
}

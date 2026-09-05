import { env, type Env } from "../../config/env.js";
import { CloudinaryStorageProvider, getMissingCloudinaryConfig } from "./cloudinary-storage.js";
import { getMissingR2Config, R2StorageProvider } from "./r2-storage-provider.js";
import { LocalStorageProvider } from "./local-storage-provider.js";
import type { StorageProvider, StorageProviderName, StoragePurpose } from "./types.js";

type StorageStatusConfig = Pick<
  Partial<Env>,
  | "NODE_ENV"
  | "STORAGE_PROVIDER"
  | "CLOUDINARY_CLOUD_NAME"
  | "CLOUDINARY_API_KEY"
  | "CLOUDINARY_API_SECRET"
  | "R2_ACCOUNT_ID"
  | "R2_ACCESS_KEY_ID"
  | "R2_SECRET_ACCESS_KEY"
  | "R2_BUCKET"
  | "R2_PUBLIC_BASE_URL"
>;

export function getStorageProviderName(config: StorageStatusConfig = env): StorageProviderName {
  const configured = (config.STORAGE_PROVIDER ?? "cloudinary").toLowerCase();
  if (configured === "cloudinary" || configured === "cloudflare_r2" || configured === "s3" || configured === "local") {
    return configured;
  }
  return "cloudinary";
}

export function getStorageProvider(): StorageProvider {
  return getStorageProviderForName(getStorageProviderName());
}

export function getStorageProviderForName(provider: StorageProviderName): StorageProvider {
  if (provider === "cloudinary") return new CloudinaryStorageProvider();
  if (provider === "cloudflare_r2") return new R2StorageProvider();
  if (provider === "local") return new LocalStorageProvider();
  throw Object.assign(new Error("Provedor S3 ainda nao configurado nesta etapa."), {
    statusCode: 503,
    code: "STORAGE_NOT_CONFIGURED",
  });
}

export function getStorageStatus(config: StorageStatusConfig = env) {
  const provider = getStorageProviderName(config);
  const isProduction = (config.NODE_ENV ?? env.NODE_ENV) === "production";
  const missing =
    provider === "cloudinary"
      ? getMissingCloudinaryConfig(config)
      : provider === "cloudflare_r2"
        ? getMissingR2Config(config)
        : provider === "local"
          ? (isProduction ? ["LOCAL_STORAGE_DISABLED_IN_PRODUCTION"] : [])
          : ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"];

  return {
    provider,
    configured: missing.length === 0,
    missing,
    message:
      missing.length === 0
        ? `${storageProviderLabel(provider)} configurado para uploads reais.`
        : provider === "local" && isProduction
          ? "Provider local de storage nao pode ser usado em producao."
          : `${storageProviderLabel(provider)} ainda incompleto. Uploads retornarao erro controlado.`,
  };
}

export function buildStorageFolder(input: {
  companyId: string;
  purpose: StoragePurpose;
  propertyId?: string | null;
  websiteId?: string | null;
  // Fase 4D: quando presente, documentos "document" ficam em uma pasta por
  // proprietário (nunca misturados com a pasta genérica de empresa) — só
  // organização de storage, não afeta autorização (quem controla acesso é o
  // StoredFile.purpose + as rotas, não o path do provider).
  ownerId?: string | null;
}) {
  const root = sanitizeSegment(env.CLOUDINARY_UPLOAD_FOLDER || "imobiflow");
  const companyId = sanitizeSegment(input.companyId);

  switch (input.purpose) {
    case "property_image":
      return `${root}/${companyId}/properties/${sanitizeSegment(input.propertyId ?? "shared")}/images`;
    case "property_video":
      return `${root}/${companyId}/properties/${sanitizeSegment(input.propertyId ?? "shared")}/videos`;
    case "property_tour":
      return `${root}/${companyId}/properties/${sanitizeSegment(input.propertyId ?? "shared")}/tours`;
    case "property_floor_plan":
      return `${root}/${companyId}/properties/${sanitizeSegment(input.propertyId ?? "shared")}/documents`;
    case "website_logo":
      return `${root}/${companyId}/logos`;
    case "document":
      return input.ownerId
        ? `${root}/${companyId}/owners/${sanitizeSegment(input.ownerId)}/documents`
        : `${root}/${companyId}/documents`;
    case "website_asset":
    default:
      return `${root}/${companyId}/websites/${sanitizeSegment(input.websiteId ?? "shared")}/assets`;
  }
}

export function storagePurposeFromPropertyMedia(mediaType: string): StoragePurpose {
  if (mediaType === "video") return "property_video";
  if (mediaType === "tour") return "property_tour";
  if (mediaType === "floor_plan") return "property_floor_plan";
  return "property_image";
}

function sanitizeSegment(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "default"
  );
}

function storageProviderLabel(provider: StorageProviderName) {
  if (provider === "cloudinary") return "Cloudinary";
  if (provider === "cloudflare_r2") return "Cloudflare R2";
  return "S3";
}

export type StorageProviderName = "cloudinary" | "cloudflare_r2" | "s3" | "local";

export type StorageResourceType = "image" | "video" | "raw";

export type StoragePurpose =
  | "property_image"
  | "property_video"
  | "property_tour"
  | "property_floor_plan"
  | "website_asset"
  | "website_logo"
  | "document";

export type UploadFileInput = {
  companyId: string;
  entityType: string;
  entityId?: string | null;
  purpose: StoragePurpose;
  fileName: string;
  mimeType: string;
  sizeBytes?: number | null;
  body: Buffer | Uint8Array;
  folder: string;
  isTestData?: boolean;
  testBatchId?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type StoredFile = {
  provider: StorageProviderName;
  publicId: string;
  resourceType: StorageResourceType;
  secureUrl: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
};

export type DeleteFileInput = {
  publicId: string;
  resourceType?: StorageResourceType;
};

// F3C (2026-09-04): marca d'água configurável por empresa, aplicada só na
// entrega pública (nunca no original). `publicId` aqui SEMPRE vem de um
// StoredFile resolvido no backend a partir do companyId autenticado — nunca
// de um valor enviado pelo cliente (ver resolveWatermarkOverlayForSite em
// mysql-real-estate.ts) — por isso não há necessidade de "validar" o
// public_id aqui: ele já nasceu confiável.
export const WATERMARK_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
  "center",
] as const;
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export type WatermarkOverlay = {
  publicId: string;
  position: WatermarkPosition;
  /** 1-100. */
  opacity: number;
};

export type PublicUrlOptions = {
  resourceType?: StorageResourceType;
  variant?: "thumbnail" | "card" | "gallery" | "full";
  /** Só tem efeito no provider Cloudinary (overlay via transformação). */
  watermark?: WatermarkOverlay | null;
};

export interface StorageProvider {
  readonly name: StorageProviderName;
  uploadFile(input: UploadFileInput): Promise<StoredFile>;
  deleteFile(input: DeleteFileInput): Promise<void>;
  getPublicUrl(publicId: string, options?: PublicUrlOptions): string;
}

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

export type PublicUrlOptions = {
  resourceType?: StorageResourceType;
  variant?: "thumbnail" | "card" | "gallery" | "full";
};

export interface StorageProvider {
  readonly name: StorageProviderName;
  uploadFile(input: UploadFileInput): Promise<StoredFile>;
  deleteFile(input: DeleteFileInput): Promise<void>;
  getPublicUrl(publicId: string, options?: PublicUrlOptions): string;
}

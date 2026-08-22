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
    const result = await uploadBuffer(input.body, {
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
      transformation: imageTransformation(options.variant),
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

function imageTransformation(variant?: PublicUrlOptions["variant"]) {
  if (!variant) return undefined;
  const variants: Record<NonNullable<PublicUrlOptions["variant"]>, UploadApiOptions["transformation"]> = {
    thumbnail: [{ width: 240, height: 180, crop: "fill", gravity: "auto", fetch_format: "auto", quality: "auto" }],
    card: [{ width: 720, height: 480, crop: "fill", gravity: "auto", fetch_format: "auto", quality: "auto" }],
    gallery: [{ width: 1200, height: 800, crop: "limit", fetch_format: "auto", quality: "auto" }],
    full: [{ width: 1920, height: 1280, crop: "limit", fetch_format: "auto", quality: "auto" }],
  };
  return variants[variant];
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

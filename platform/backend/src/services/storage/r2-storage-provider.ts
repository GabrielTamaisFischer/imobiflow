import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env.js";
import type { DeleteFileInput, PublicUrlOptions, StorageProvider, StoredFile, UploadFileInput } from "./types.js";

type R2Config = {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_PUBLIC_BASE_URL?: string;
};

export function getMissingR2Config(config: R2Config = env): string[] {
  const entries: Array<[string, string | undefined]> = [
    ["R2_ACCOUNT_ID", config.R2_ACCOUNT_ID],
    ["R2_ACCESS_KEY_ID", config.R2_ACCESS_KEY_ID],
    ["R2_SECRET_ACCESS_KEY", config.R2_SECRET_ACCESS_KEY],
    ["R2_BUCKET", config.R2_BUCKET],
    ["R2_PUBLIC_BASE_URL", config.R2_PUBLIC_BASE_URL],
  ];
  return entries.filter(([, value]) => !value).map(([key]) => key);
}

export class R2StorageProvider implements StorageProvider {
  readonly name = "cloudflare_r2" as const;

  constructor(private readonly config: R2Config = env) {}

  async uploadFile(input: UploadFileInput): Promise<StoredFile> {
    const storageKey = `${input.folder}/${safeFileName(input.fileName)}`;
    await this.client().send(
      new PutObjectCommand({
        Bucket: this.config.R2_BUCKET!,
        Key: storageKey,
        ContentType: input.mimeType,
        Body: Buffer.from(input.body),
      }),
    );

    return {
      provider: this.name,
      publicId: storageKey,
      resourceType: input.mimeType.startsWith("video/") ? "video" : input.mimeType.startsWith("image/") ? "image" : "raw",
      secureUrl: this.getPublicUrl(storageKey),
      originalFilename: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.body.byteLength,
      width: null,
      height: null,
      format: null,
    };
  }

  async deleteFile(input: DeleteFileInput): Promise<void> {
    await this.client().send(
      new DeleteObjectCommand({
        Bucket: this.config.R2_BUCKET!,
        Key: input.publicId,
      }),
    );
  }

  getPublicUrl(publicId: string, _options: PublicUrlOptions = {}) {
    this.requireConfig();
    return `${this.config.R2_PUBLIC_BASE_URL!.replace(/\/$/, "")}/${publicId}`;
  }

  private client() {
    this.requireConfig();
    return new S3Client({
      region: "auto",
      endpoint: `https://${this.config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.config.R2_ACCESS_KEY_ID!,
        secretAccessKey: this.config.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  private requireConfig() {
    const missing = getMissingR2Config(this.config);
    if (missing.length) {
      throw Object.assign(
        new Error(`Cloudflare R2 nao configurado. Variaveis ausentes: ${missing.join(", ")}.`),
        { statusCode: 503, code: "STORAGE_NOT_CONFIGURED" },
      );
    }
  }
}

function safeFileName(fileName: string) {
  return (
    fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._/-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 220) || "asset"
  );
}

import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { env } from "../../config/env.js";
import { resourceTypeForMime } from "./file-policy.js";
import type { DeleteFileInput, PublicUrlOptions, StorageProvider, StoredFile, UploadFileInput } from "./types.js";

// LocalStorageProvider — SOMENTE para desenvolvimento local (R$0), quando
// nenhum provider real (Cloudinary/R2/S3) esta configurado neste ambiente.
//
// Implementa exatamente a mesma interface StorageProvider usada pelos
// providers de producao, para que nenhuma rota precise saber qual provider
// esta ativo. Os arquivos sao salvos em uma pasta gitignored
// (platform/backend/uploads/) e servidos via uma rota estatica dedicada
// (ver server.ts), habilitada apenas quando este provider esta ativo.
//
// Bloqueado explicitamente em produção — ver getStorageProviderForName().

const UPLOADS_ROOT = join(process.cwd(), "uploads");

export function localUploadsRoot() {
  return UPLOADS_ROOT;
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local" as const;

  constructor() {
    if (env.NODE_ENV === "production") {
      throw Object.assign(
        new Error("LocalStorageProvider nao pode ser usado em producao (NODE_ENV=production)."),
        { statusCode: 503, code: "STORAGE_NOT_CONFIGURED" },
      );
    }
  }

  async uploadFile(input: UploadFileInput): Promise<StoredFile> {
    const resourceType = resourceTypeForMime(input.mimeType);
    const publicId = `${input.folder}/${randomUUID()}-${safeBaseName(input.fileName)}${extensionFor(input.mimeType, input.fileName)}`;
    const absolutePath = join(UPLOADS_ROOT, publicId);

    await mkdir(dirname(absolutePath), { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(absolutePath, Buffer.from(input.body));

    return {
      provider: this.name,
      publicId,
      resourceType,
      secureUrl: this.getPublicUrl(publicId),
      originalFilename: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.body.byteLength,
      width: null,
      height: null,
      format: null,
    };
  }

  async deleteFile(input: DeleteFileInput): Promise<void> {
    const absolutePath = join(UPLOADS_ROOT, input.publicId);
    if (existsSync(absolutePath)) {
      await unlink(absolutePath).catch(() => undefined);
    }
  }

  getPublicUrl(publicId: string, _options: PublicUrlOptions = {}) {
    const base = (env.LOCAL_STORAGE_PUBLIC_URL || `http://localhost:${env.PORT}`).replace(/\/$/, "");
    return `${base}/uploads/${publicId}`;
  }
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

function extensionFor(mimeType: string, fileName: string) {
  const fromName = fileName.match(/\.[a-zA-Z0-9]+$/)?.[0];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "application/pdf": ".pdf",
  };
  return map[mimeType] ?? "";
}

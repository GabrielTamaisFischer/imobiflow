import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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

  // F5B: leitura de bytes direto do disco local, para o backend embutir a
  // foto em um PDF ou servir um download autenticado sem depender de URL
  // assinada (que este provider nao gera). publicId sempre vem de um
  // StoredFile resolvido no backend (nunca do cliente), mas ainda validamos
  // que o caminho resolvido continua dentro de UPLOADS_ROOT antes de ler.
  async getFileBuffer(input: { publicId: string }): Promise<Buffer> {
    const absolutePath = resolve(UPLOADS_ROOT, input.publicId);
    const rel = relative(UPLOADS_ROOT, absolutePath);
    if (rel.startsWith("..") || resolve(rel) === rel) {
      throw Object.assign(new Error("Caminho de arquivo invalido."), { statusCode: 404, code: "FILE_NOT_FOUND" });
    }
    if (!existsSync(absolutePath)) {
      throw Object.assign(new Error("Arquivo nao encontrado no storage local."), { statusCode: 404, code: "FILE_NOT_FOUND" });
    }
    return readFile(absolutePath);
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

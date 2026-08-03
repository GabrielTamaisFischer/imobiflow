import { describe, expect, it } from "vitest";
import { validateUploadFile } from "../src/services/storage/file-policy.js";
import type {
  DeleteFileInput,
  PublicUrlOptions,
  StorageProvider,
  StoredFile,
  UploadFileInput,
} from "../src/services/storage/types.js";

class MemoryStorageProvider implements StorageProvider {
  readonly name = "cloudinary" as const;
  readonly files = new Map<string, StoredFile>();
  readonly deleted: string[] = [];

  async uploadFile(input: UploadFileInput): Promise<StoredFile> {
    const file: StoredFile = {
      provider: this.name,
      publicId: `${input.folder}/mock-file`,
      resourceType: input.mimeType.startsWith("image/") ? "image" : input.mimeType.startsWith("video/") ? "video" : "raw",
      secureUrl: `https://res.cloudinary.example/${input.folder}/mock-file`,
      originalFilename: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.body.byteLength,
      width: input.mimeType.startsWith("image/") ? 100 : null,
      height: input.mimeType.startsWith("image/") ? 80 : null,
      format: input.fileName.split(".").pop() ?? null,
    };
    this.files.set(file.publicId, file);
    return file;
  }

  async deleteFile(input: DeleteFileInput): Promise<void> {
    this.deleted.push(input.publicId);
    this.files.delete(input.publicId);
  }

  getPublicUrl(publicId: string, options: PublicUrlOptions = {}) {
    return `https://res.cloudinary.example/${publicId}${options.variant ? `?variant=${options.variant}` : ""}`;
  }
}

describe("storage provider contract", () => {
  it("envia, publica e remove arquivo usando a interface comum", async () => {
    const provider = new MemoryStorageProvider();
    const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const policy = validateUploadFile({
      purpose: "property_image",
      fileName: "fachada.jpg",
      mimeType: "image/jpeg",
      declaredSizeBytes: body.byteLength,
      body,
    });

    const file = await provider.uploadFile({
      companyId: "company-1",
      entityType: "property_media",
      entityId: "media-1",
      purpose: "property_image",
      fileName: "fachada.jpg",
      mimeType: policy.normalizedMimeType,
      sizeBytes: policy.measuredSizeBytes,
      body,
      folder: "imobiflow/company-1/properties/property-1/images",
    });

    expect(file.provider).toBe("cloudinary");
    expect(file.secureUrl).toContain("https://res.cloudinary.example/");
    expect(provider.getPublicUrl(file.publicId, { variant: "card" })).toContain("variant=card");

    await provider.deleteFile({ publicId: file.publicId, resourceType: file.resourceType });
    expect(provider.deleted).toEqual([file.publicId]);
    expect(provider.files.has(file.publicId)).toBe(false);
  });

  it("bloqueia arquivo perigoso mesmo quando o MIME informado tenta parecer inofensivo", () => {
    expect(() =>
      validateUploadFile({
        purpose: "website_asset",
        fileName: "payload.html",
        mimeType: "text/html",
        declaredSizeBytes: 32,
        body: Buffer.from("<script>alert(1)</script>", "utf8"),
      }),
    ).toThrow(/bloqueado/i);
  });
});

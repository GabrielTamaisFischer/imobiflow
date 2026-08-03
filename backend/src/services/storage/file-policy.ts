import { extname } from "node:path";
import type { StoragePurpose, StorageResourceType } from "./types.js";

type UploadRule = {
  mimeTypes: string[];
  extensions: string[];
  maxBytes: number;
  resourceType: StorageResourceType;
};

const MiB = 1024 * 1024;

const rules: Record<StoragePurpose, UploadRule> = {
  property_image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif"],
    maxBytes: 8 * MiB,
    resourceType: "image",
  },
  property_video: {
    mimeTypes: ["video/mp4"],
    extensions: [".mp4"],
    maxBytes: 8 * MiB,
    resourceType: "video",
  },
  property_tour: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif"],
    maxBytes: 8 * MiB,
    resourceType: "image",
  },
  property_floor_plan: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif", ".pdf"],
    maxBytes: 10 * MiB,
    resourceType: "raw",
  },
  website_asset: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf", "video/mp4"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif", ".pdf", ".mp4"],
    maxBytes: 10 * MiB,
    resourceType: "image",
  },
  website_logo: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif"],
    maxBytes: 4 * MiB,
    resourceType: "image",
  },
  document: {
    mimeTypes: ["application/pdf"],
    extensions: [".pdf"],
    maxBytes: 10 * MiB,
    resourceType: "raw",
  },
};

const blockedExtensions = new Set([".exe", ".bat", ".cmd", ".js", ".mjs", ".cjs", ".html", ".htm", ".svg"]);
const blockedMimeTypes = new Set([
  "application/javascript",
  "text/javascript",
  "text/html",
  "application/x-msdownload",
  "application/x-msdos-program",
]);

export function validateUploadFile(input: {
  purpose: StoragePurpose;
  fileName: string;
  mimeType: string;
  declaredSizeBytes?: number | null;
  body: Buffer | Uint8Array;
}) {
  const mimeType = input.mimeType.toLowerCase().trim();
  const extension = extname(input.fileName).toLowerCase();
  const rule = rules[input.purpose];
  const measuredSize = input.body.byteLength;
  const declaredSize = input.declaredSizeBytes ?? measuredSize;
  const largestSize = Math.max(measuredSize, declaredSize);

  if (blockedExtensions.has(extension) || blockedMimeTypes.has(mimeType)) {
    throw badUpload(`Arquivo bloqueado por seguranca: ${extension || mimeType}.`, 415);
  }

  if (!rule.mimeTypes.includes(mimeType)) {
    throw badUpload(`Tipo MIME nao permitido para ${input.purpose}: ${input.mimeType}.`, 415);
  }

  if (!rule.extensions.includes(extension)) {
    throw badUpload(`Extensao nao permitida para ${input.purpose}: ${extension || "sem extensao"}.`, 415);
  }

  if (largestSize > rule.maxBytes) {
    throw badUpload(`Arquivo acima do limite de ${Math.round(rule.maxBytes / MiB)}MB.`, 413);
  }

  if (!matchesMagicBytes(input.body, mimeType)) {
    throw badUpload("Conteudo do arquivo nao corresponde ao MIME type informado.", 415);
  }

  return {
    ...rule,
    normalizedMimeType: mimeType,
    measuredSizeBytes: measuredSize,
  };
}

export function resourceTypeForMime(mimeType: string): StorageResourceType {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  return "raw";
}

function matchesMagicBytes(body: Buffer | Uint8Array, mimeType: string) {
  const bytes = Buffer.from(body);
  if (bytes.length < 4) return false;

  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (mimeType === "image/avif") return bytes.subarray(4, 12).toString("ascii").includes("ftyp") && bytes.subarray(8, 16).toString("ascii").includes("avif");
  if (mimeType === "application/pdf") return bytes.subarray(0, 4).toString("ascii") === "%PDF";
  if (mimeType === "video/mp4") return bytes.subarray(4, 8).toString("ascii") === "ftyp";
  return false;
}

function badUpload(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode, code: "INVALID_UPLOAD" });
}

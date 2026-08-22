import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { buildStorageFolder, getStorageProvider } from "./storage/index.js";
import { createStoredFileRecord } from "./storage/stored-files.js";
import type { StorageProvider } from "./storage/types.js";
import { recordImportMetric, type ImportMetricBag } from "./import-metrics.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_DOWNLOAD_RETRIES = 2;
const RETRY_BACKOFF_MS = 250;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImportMediaDependencies = {
  fetchImpl?: typeof fetch;
  provider?: StorageProvider;
  assertPublicHost?: (hostname: string) => Promise<void>;
};

export async function importRemotePropertyImage(input: {
  companyId: string;
  userId: string;
  propertyId: string;
  importJobId: string;
  importSource: string;
  sourceUrl: string;
  position: number;
  metrics?: ImportMetricBag;
}, dependencies: ImportMediaDependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const provider = dependencies.provider ?? getStorageProvider();
  const downloadStarted = performance.now();
  let response!: Response;
  let bytes!: Uint8Array;
  try {
    response = await fetchImageWithRetry(input.sourceUrl, fetchImpl, dependencies.assertPublicHost ?? assertPublicHost);
    const mimeType = normalizeMime(response.headers.get("content-type"));
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (!ALLOWED_MIME.has(mimeType)) throw mediaError("IMPORT_IMAGE_MIME", "Tipo de imagem nao permitido.");
    if (declaredLength > MAX_IMAGE_BYTES) throw mediaError("IMPORT_IMAGE_TOO_LARGE", "Imagem excede 10 MB.");
    bytes = await readBodyWithLimit(response, MAX_IMAGE_BYTES);
  } finally {
    recordImportMetric(input.metrics ?? {}, "media_download", downloadStarted);
  }
  const mimeType = normalizeMime(response.headers.get("content-type"));
  const validationStarted = performance.now();
  try {
    validateImageBytes(bytes, mimeType);
  } finally {
    recordImportMetric(input.metrics ?? {}, "media_validate", validationStarted);
  }

  const fileName = safeImageName(new URL(input.sourceUrl).pathname, mimeType);
  const uploadStarted = performance.now();
  let uploaded!: Awaited<ReturnType<StorageProvider["uploadFile"]>>;
  try {
    uploaded = await provider.uploadFile({
      companyId: input.companyId,
      entityType: "property",
      entityId: input.propertyId,
      purpose: "property_image",
      fileName,
      mimeType,
      sizeBytes: bytes.length,
      body: bytes,
      folder: buildStorageFolder({ companyId: input.companyId, purpose: "property_image", propertyId: input.propertyId }),
      metadata: { importJobId: input.importJobId, importSource: input.importSource, sourceUrl: input.sourceUrl },
    });
  } finally {
    recordImportMetric(input.metrics ?? {}, "storage_upload", uploadStarted);
  }

  const storedFileStarted = performance.now();
  let stored!: Awaited<ReturnType<typeof createStoredFileRecord>>;
  try {
    stored = await createStoredFileRecord({
      companyId: input.companyId,
      entityType: "property",
      entityId: input.propertyId,
      file: uploaded,
      uploadedBy: input.userId,
      sourceUrl: input.sourceUrl,
      importJobId: input.importJobId,
      importSource: input.importSource,
      metadata: { position: input.position },
    });
  } finally {
    recordImportMetric(input.metrics ?? {}, "stored_file_create", storedFileStarted);
  }
  return { uploaded, stored };
}

async function fetchImageWithRetry(source: string, fetchImpl: typeof fetch, assertHost: (hostname: string) => Promise<void>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_DOWNLOAD_RETRIES; attempt += 1) {
    try {
      return await fetchImage(source, fetchImpl, assertHost);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_DOWNLOAD_RETRIES || !isRetryableDownloadError(error)) throw error;
      await delay(RETRY_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

async function fetchImage(source: string, fetchImpl: typeof fetch, assertHost: (hostname: string) => Promise<void>) {
  let current = new URL(source);
  if (current.protocol !== "https:" && current.protocol !== "http:") throw mediaError("IMPORT_IMAGE_PROTOCOL", "Protocolo nao permitido.");

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertHost(current.hostname);
    const response = await fetchImpl(current, { redirect: "manual", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw mediaError("IMPORT_IMAGE_REDIRECT", "Redirecionamentos demais.");
      current = new URL(location, current);
      if (current.protocol !== "https:" && current.protocol !== "http:") throw mediaError("IMPORT_IMAGE_PROTOCOL", "Protocolo nao permitido.");
      continue;
    }
    if (!response.ok) {
      throw Object.assign(mediaError("IMPORT_IMAGE_HTTP", `Download da imagem retornou HTTP ${response.status}.`), {
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    return response;
  }
  throw mediaError("IMPORT_IMAGE_REDIRECT", "Redirecionamentos demais.");
}

export async function assertPublicHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) throw mediaError("IMPORT_IMAGE_PRIVATE_URL", "Host local bloqueado.");
  const addresses = isIP(normalized) ? [{ address: normalized }] : await lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw mediaError("IMPORT_IMAGE_PRIVATE_URL", "Endereco local ou privado bloqueado.");
  }
}

export function isPrivateAddress(address: string) {
  const value = address.toLowerCase();
  if (value === "::1" || value === "::" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(value) === 4 ? value : null);
  if (!ipv4) return false;
  const [a, b] = ipv4.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function normalizeMime(value: string | null) {
  return (value ?? "").split(";", 1)[0]!.trim().toLowerCase();
}

export function validateImageBytes(bytes: Uint8Array, mime: string) {
  if (!bytes.length) throw mediaError("IMPORT_IMAGE_EMPTY", "Imagem vazia.");
  if (bytes.length > MAX_IMAGE_BYTES) throw mediaError("IMPORT_IMAGE_TOO_LARGE", "Imagem excede 10 MB.");
  if (!matchesMagicBytes(bytes, mime)) throw mediaError("IMPORT_IMAGE_SIGNATURE", "Assinatura do arquivo nao corresponde ao MIME.");
}

function matchesMagicBytes(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  return bytes.length >= 12 && text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 12) === "WEBP";
}

function text(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function safeImageName(pathname: string, mime: string) {
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  const base = decodeURIComponent(pathname.split("/").at(-1) || "imagem")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
  return base && /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base || "imagem"}.${extension}`;
}

function mediaError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function isRetryableDownloadError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if ((error as Error & { retryable?: boolean }).retryable) return true;
  return ["AbortError", "TimeoutError", "TypeError"].includes(error.name);
}

function delay(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function readBodyWithLimit(response: Response, limit: number) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) throw mediaError("IMPORT_IMAGE_TOO_LARGE", "Imagem excede 10 MB.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

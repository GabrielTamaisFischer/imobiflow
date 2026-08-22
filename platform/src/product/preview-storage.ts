export function safeSetPreviewItem(key: string, value: string, compact?: () => string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, value);
    return;
  } catch (error) {
    if (!isQuotaExceededError(error)) throw normalizePreviewStorageError(error);

    if (!compact) {
      try {
        clearAutomaticQaPreviewData();
        compactPreviewLocalStorage(true);
        freeHeavyPreviewMedia();
        replacePreviewItem(key, value);
        return;
      } catch (retryError) {
        throw normalizePreviewStorageError(retryError);
      }
    }
  }

  try {
    compactPreviewLocalStorage();
  } catch {
    clearAutomaticQaPreviewData();
  }

  try {
    replacePreviewItem(key, compact());
    return;
  } catch (error) {
    if (!isQuotaExceededError(error)) throw normalizePreviewStorageError(error);
  }

  try {
    clearAutomaticQaPreviewData();
    compactPreviewLocalStorage(true);
  } catch {
    freeHeavyPreviewMedia();
  }

  try {
    replacePreviewItem(key, compact());
    return;
  } catch (error) {
    if (!isQuotaExceededError(error)) throw normalizePreviewStorageError(error);
  }

  freeHeavyPreviewMedia();

  try {
    replacePreviewItem(key, compact());
  } catch (error) {
    throw normalizePreviewStorageError(error);
  }
}

export function compactPreviewMediaUrl(url: string | null | undefined) {
  if (!url) return url ?? null;
  if (url.startsWith("data:") || url.startsWith("blob:")) return "/site-templates/imoveis-logo.png";
  return url;
}

export function compactPreviewLocalStorage(aggressive = false) {
  if (typeof window === "undefined") return;

  compactProperties(aggressive);
  compactInspectionMedia(aggressive);
  trimPreviewArray("imobiflow.preview.site_leads", aggressive ? 30 : 100);
  trimPreviewArray("imobiflow.preview.crm.leads", aggressive ? 80 : 250);

  for (const key of getPreviewKeys()) {
    const value = window.localStorage.getItem(key);
    if (!value || (!value.includes("data:") && !value.includes("blob:"))) continue;

    try {
      replacePreviewItem(key, JSON.stringify(compactUnknownPayload(JSON.parse(value))));
    } catch {
      window.localStorage.removeItem(key);
    }
  }
}

export function clearAutomaticQaPreviewData() {
  if (typeof window === "undefined") return;

  const properties = readPreviewJson<Array<Record<string, unknown>>>("imobiflow.preview.properties", []);
  const qaPropertyIds = new Set(
    properties
      .filter((property) => String(property.code ?? "").startsWith("QA-") || String(property.title ?? "").startsWith("QA "))
      .map((property) => String(property.id)),
  );

  if (properties.length > 0) {
    replacePreviewItem(
      "imobiflow.preview.properties",
      JSON.stringify(properties.filter((property) => !qaPropertyIds.has(String(property.id)))),
    );
  }

  filterPreviewArray("imobiflow.preview.property_owners", (owner) => {
    return !String(owner.name ?? "").startsWith("Proprietário QA") && !String(owner.email ?? "").endsWith("@imobiflow.test");
  });

  filterPreviewArray("imobiflow.preview.appointments", (appointment) => {
    return !String(appointment.title ?? "").startsWith("QA ") && !String(appointment.metadata?.test_lab_key ?? "").startsWith("appointment:QA-");
  });

  const inspections = readPreviewJson<Array<Record<string, unknown>>>("imobiflow.preview.inspections", []);
  const qaInspectionIds = new Set(
    inspections
      .filter((inspection) => String(inspection.title ?? "").startsWith("QA ") || qaPropertyIds.has(String(inspection.property_id)))
      .map((inspection) => String(inspection.id)),
  );

  if (inspections.length > 0) {
    replacePreviewItem(
      "imobiflow.preview.inspections",
      JSON.stringify(inspections.filter((inspection) => !qaInspectionIds.has(String(inspection.id)))),
    );
  }

  for (const key of [
    "imobiflow.preview.inspection_rooms",
    "imobiflow.preview.inspection_items",
    "imobiflow.preview.inspection_media",
    "imobiflow.preview.inspection_signatures",
  ]) {
    filterPreviewArray(key, (item) => !qaInspectionIds.has(String(item.inspection_id)));
  }
}

export function isQuotaExceededError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "QuotaExceededError" || error.message.toLowerCase().includes("quota");
}

export function normalizePreviewStorageError(error: unknown) {
  if (isQuotaExceededError(error)) {
    return new Error(
      "O armazenamento local do navegador ficou cheio. O ImobiFlow limpou dados QA antigos e compactou mídias pesadas automaticamente; recarregue a página e tente novamente.",
    );
  }

  return error instanceof Error ? error : new Error("Não foi possível salvar os dados locais do preview.");
}

function compactProperties(aggressive: boolean) {
  const properties = readPreviewJson<Array<Record<string, unknown>>>("imobiflow.preview.properties", []);
  if (properties.length === 0) return;

  const mediaLimit = aggressive ? 6 : 12;
  const compacted = properties.map((property) => ({
    ...property,
    property_media: Array.isArray(property.property_media)
      ? property.property_media.slice(0, mediaLimit).map((media) => compactUnknownPayload(media))
      : property.property_media,
  }));

  replacePreviewItem("imobiflow.preview.properties", JSON.stringify(compacted));
}

function compactInspectionMedia(aggressive: boolean) {
  const media = readPreviewJson<Array<Record<string, unknown>>>("imobiflow.preview.inspection_media", []);
  if (media.length === 0) return;

  const limit = aggressive ? 150 : 500;
  replacePreviewItem("imobiflow.preview.inspection_media", JSON.stringify(media.slice(0, limit).map((item) => compactUnknownPayload(item))));
}

function freeHeavyPreviewMedia() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("imobiflow.preview.inspection_media");
  compactProperties(true);
}

function compactUnknownPayload(value: unknown): unknown {
  if (typeof value === "string") return compactPreviewMediaUrl(value);
  if (Array.isArray(value)) return value.map((item) => compactUnknownPayload(item));
  if (!value || typeof value !== "object") return value;

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    next[key] = compactUnknownPayload(item);
  }
  return next;
}

function trimPreviewArray(key: string, limit: number) {
  const value = readPreviewJson<unknown[]>(key, []);
  if (value.length <= limit) return;
  replacePreviewItem(key, JSON.stringify(value.slice(0, limit)));
}

function filterPreviewArray(key: string, predicate: (item: Record<string, unknown>) => boolean) {
  const value = readPreviewJson<Array<Record<string, unknown>>>(key, []);
  if (value.length === 0) return;
  replacePreviewItem(key, JSON.stringify(value.filter(predicate)));
}

function readPreviewJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getPreviewKeys() {
  return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith("imobiflow.preview.")));
}

function replacePreviewItem(key: string, value: string) {
  window.localStorage.removeItem(key);
  window.localStorage.setItem(key, value);
}

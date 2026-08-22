export type ImportMetricName =
  | "file_parse"
  | "import_job_create"
  | "import_rows_create"
  | "duplicate_lookup"
  | "property_create"
  | "owner_create"
  | "media_download"
  | "media_validate"
  | "media_dedup_lookup"
  | "storage_upload"
  | "stored_file_create"
  | "property_media_create"
  | "counter_refresh"
  | "batch_total";

export type ImportMetricBag = Partial<Record<ImportMetricName, { count: number; total_ms: number; max_ms: number }>>;

export function importMetricsEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return environment.IMPORT_METRICS_ENABLED === "true" && ["staging", "test"].includes(environment.NODE_ENV ?? "");
}

export function recordImportMetric(bag: ImportMetricBag, name: ImportMetricName, startedAt: number) {
  if (!importMetricsEnabled()) return;
  const duration = Math.round((performance.now() - startedAt) * 100) / 100;
  const current = bag[name] ?? { count: 0, total_ms: 0, max_ms: 0 };
  bag[name] = {
    count: current.count + 1,
    total_ms: Math.round((current.total_ms + duration) * 100) / 100,
    max_ms: Math.max(current.max_ms, duration),
  };
}

export function mergeImportMetrics(...bags: ImportMetricBag[]): ImportMetricBag {
  const merged: ImportMetricBag = {};
  for (const bag of bags) {
    for (const [name, value] of Object.entries(bag) as Array<[ImportMetricName, NonNullable<ImportMetricBag[ImportMetricName]>]>) {
      const current = merged[name] ?? { count: 0, total_ms: 0, max_ms: 0 };
      merged[name] = {
        count: current.count + value.count,
        total_ms: Math.round((current.total_ms + value.total_ms) * 100) / 100,
        max_ms: Math.max(current.max_ms, value.max_ms),
      };
    }
  }
  return merged;
}

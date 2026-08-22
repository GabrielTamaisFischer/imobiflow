import { apiRequest } from "./api";
import { getStoredToken } from "./auth";

export type ImportType = "properties" | "owners" | "owners_properties";
export type ImportSourceType = "csv" | "json" | "excel" | "xml" | "zip";

export type ImportPreviewRow = {
  row_number: number;
  raw_data: Record<string, string>;
  mapped_data: {
    owner: Record<string, unknown>;
    property: Record<string, unknown>;
  };
  errors: string[];
  status: "valid" | "invalid";
};

export type ImportPreview = {
  file_name: string;
  import_type: ImportType;
  source_type: ImportSourceType;
  delimiter: string | null;
  headers: string[];
  mapping: Record<string, string>;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  preview_rows: ImportPreviewRow[];
};

export type ImportJob = {
  id: string;
  import_type: ImportType;
  source_type: string;
  source_name: string;
  mode: "test" | "full";
  status: string;
  total_rows: number;
  processed_rows: number;
  imported_rows: number;
  updated_rows: number;
  duplicate_rows: number;
  failed_rows: number;
  imported_photos: number;
  failed_photos: number;
  skipped_rows: number;
  batch_size: number;
  next_cursor: number;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
};

export async function previewImport(input: {
  file_name: string;
  content_base64: string;
  import_type: ImportType;
  source_type?: ImportSourceType;
  mapping_json?: Record<string, string>;
}) {
  return apiRequest<{ preview: ImportPreview }>("/imports/preview", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function startImport(input: {
  file_name: string;
  content_base64: string;
  import_type: ImportType;
  source_type?: ImportSourceType;
  mapping_json?: Record<string, string>;
  allow_partial: boolean;
  mode: "test" | "full";
  confirm_full_import: boolean;
  batch_size?: number;
}) {
  return apiRequest<ImportReport>("/imports/start", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export type ImportReport = {
  import: ImportJob;
  failures: Array<{ row_number: number; external_id: string | null; error_code: string | null; error_message: string | null }>;
  has_pending_batches: boolean;
};

export function processNextImportBatch(id: string) {
  return apiRequest<ImportReport>(`/imports/${id}/process-next-batch`, { method: "POST", token: getStoredToken() ?? undefined });
}

export function retryFailedImport(id: string) {
  return apiRequest<ImportReport>(`/imports/${id}/retry-failed`, { method: "POST", token: getStoredToken() ?? undefined });
}

export function rollbackImport(id: string) {
  return apiRequest<{ import: ImportJob; rollback: Record<string, number> }>(`/imports/${id}/rollback`, {
    method: "POST", token: getStoredToken() ?? undefined, body: JSON.stringify({ confirm_rollback: true }),
  });
}

export async function listImports() {
  return apiRequest<{ imports: ImportJob[] }>("/imports", {
    token: getStoredToken() ?? undefined,
  });
}

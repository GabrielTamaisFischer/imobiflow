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
  file_name: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  imported_owners: number;
  imported_properties: number;
  skipped_rows: number;
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
}) {
  return apiRequest<{
    import: ImportJob;
    result: {
      imported_owners: number;
      imported_properties: number;
      imported_media: number;
      skipped_rows: number;
      failed_rows: number;
      errors: Array<{ row_number: number; errors: string[] }>;
    };
  }>("/imports/start", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function listImports() {
  return apiRequest<{ imports: ImportJob[] }>("/imports", {
    token: getStoredToken() ?? undefined,
  });
}

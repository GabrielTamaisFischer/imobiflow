import { getStorageStatus } from "./storage/index.js";
import type { StorageProviderName } from "./storage/types.js";

export type WebsiteBuilderStatusConfig = {
  DATABASE_URL?: string;
  STORAGE_PROVIDER?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_PUBLIC_BASE_URL?: string;
};

export type WebsiteBuilderFoundationStatus = {
  database: {
    provider: "mysql";
    configured: boolean;
    message: string;
  };
  storage: {
    provider: StorageProviderName;
    configured: boolean;
    missing: string[];
    message: string;
  };
};

export function buildWebsiteBuilderFoundationStatus(config: WebsiteBuilderStatusConfig): WebsiteBuilderFoundationStatus {
  const databaseConfigured = Boolean(config.DATABASE_URL);
  const storage = getStorageStatus(config);

  return {
    database: {
      provider: "mysql",
      configured: databaseConfigured,
      message: databaseConfigured
        ? "DATABASE_URL configurada para o modulo Website Builder."
        : "DATABASE_URL ainda nao configurada. Configure o MySQL antes de criar sites reais.",
    },
    storage: {
      provider: storage.provider,
      configured: storage.configured,
      missing: storage.missing,
      message: storage.message,
    },
  };
}

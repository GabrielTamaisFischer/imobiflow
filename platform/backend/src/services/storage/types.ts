export type StorageProviderName = "cloudinary" | "cloudflare_r2" | "s3" | "local";

export type StorageResourceType = "image" | "video" | "raw";

export type StoragePurpose =
  | "property_image"
  | "property_video"
  | "property_tour"
  | "property_floor_plan"
  | "website_asset"
  | "website_logo"
  | "profile_photo"
  | "document"
  | "contract_document"
  | "signed_contract"
  | "inspection_evidence"
  | "inspection_report"
  | "inspection_comparison"
  | "inspection_signature"
  // Assinatura Online (Bloco 5 — domínio novo, separado da assinatura
  // interna simples acima). "artifact" é a imagem da assinatura (desenhada
  // ou o texto digitado renderizado em canvas pelo cliente — a imagem é
  // sempre uma representação derivada; os dados estruturados typedText/
  // typedFontId continuam a fonte de verdade, ver InspectionSigningParty).
  // "report" é o PDF final com certificado de assinatura anexado.
  | "inspection_signing_artifact"
  | "inspection_signing_report"
  | "contract_attachment"
  | "contract_signature"
  | "signature_evidence";

// Fast-follow de privacidade (F4E): decisão explícita de delivery no
// provider, passada pelo chamador — nunca inferida implicitamente dentro do
// provider a partir de string de purpose/filename/folder (frágil). Omitido
// (undefined) preserva 100% do comportamento anterior ("public", delivery
// padrão do Cloudinary) para todo upload existente. Hoje só o upload de
// documento do proprietário (F4D) passa "authenticated" explicitamente — ver
// services/storage/purposes.ts (deliveryAccessForPurpose) para a política
// que decide isso por StoredFilePurpose já persistido.
export type StorageDeliveryAccess = "public" | "authenticated";

export type UploadFileInput = {
  companyId: string;
  entityType: string;
  entityId?: string | null;
  purpose: StoragePurpose;
  fileName: string;
  mimeType: string;
  sizeBytes?: number | null;
  body: Buffer | Uint8Array;
  folder: string;
  isTestData?: boolean;
  testBatchId?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  /** Ver StorageDeliveryAccess acima. Default: "public" (comportamento atual). */
  deliveryAccess?: StorageDeliveryAccess;
};

export type StoredFile = {
  provider: StorageProviderName;
  publicId: string;
  resourceType: StorageResourceType;
  secureUrl: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
};

export type DeleteFileInput = {
  publicId: string;
  resourceType?: StorageResourceType;
  /**
   * Precisa ser o MESMO delivery access usado no upload original — o
   * Cloudinary identifica um asset por (public_id, resource_type, type)
   * juntos; passar o valor errado faz o destroy não encontrar o arquivo
   * (falha silenciosa, sem erro), deixando-o esquecido no provider. Ver
   * StorageDeliveryAccess acima. Default: "public" (comportamento atual).
   */
  deliveryAccess?: StorageDeliveryAccess;
};

// F3C (2026-09-04): marca d'água configurável por empresa, aplicada só na
// entrega pública (nunca no original). `publicId` aqui SEMPRE vem de um
// StoredFile resolvido no backend a partir do companyId autenticado — nunca
// de um valor enviado pelo cliente (ver resolveWatermarkOverlayForSite em
// mysql-real-estate.ts) — por isso não há necessidade de "validar" o
// public_id aqui: ele já nasceu confiável.
export const WATERMARK_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
  "center",
] as const;
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export type WatermarkOverlay = {
  publicId: string;
  position: WatermarkPosition;
  /** 1-100. */
  opacity: number;
};

export type PublicUrlOptions = {
  resourceType?: StorageResourceType;
  variant?: "thumbnail" | "card" | "gallery" | "full";
  /** Só tem efeito no provider Cloudinary (overlay via transformação). */
  watermark?: WatermarkOverlay | null;
};

export interface StorageProvider {
  readonly name: StorageProviderName;
  uploadFile(input: UploadFileInput): Promise<StoredFile>;
  deleteFile(input: DeleteFileInput): Promise<void>;
  getPublicUrl(publicId: string, options?: PublicUrlOptions): string;
  /**
   * Gera, no momento da chamada (nunca persistida), uma URL de download
   * curta e assinada para um asset protegido (`deliveryAccess:
   * "authenticated"`). Opcional porque só o provider Cloudinary sabe gerar
   * isso hoje — chamar isso para outro provider/asset público é erro de
   * uso do chamador, não algo a silenciar. Nunca aceita a `secureUrl`
   * persistida como entrada: sempre reconstrói a URL a partir de
   * publicId/resourceType/format confiáveis (nunca vindos do cliente).
   */
  getAuthenticatedDownloadUrl?(input: {
    publicId: string;
    resourceType: StorageResourceType;
    format?: string | null;
  }): string;
  /**
   * F5B (Sub-bloco 5B) - leitura dos BYTES reais do arquivo, feita pelo
   * proprio backend (nunca via `secureUrl`/`getAuthenticatedDownloadUrl`
   * repassada para outro processo). Necessario para dois casos que nao
   * podem depender de uma URL assinada de vida curta: (1) embutir fotos de
   * evidencia dentro do laudo PDF gerado no servidor; (2) servir o download
   * autenticado do proprio laudo quando o provider ativo nao implementa
   * `getAuthenticatedDownloadUrl` (hoje: Local e R2).
   *
   * Cada provider implementa com o mecanismo que ja tem: Local le do disco
   * local; R2 usa `GetObjectCommand` do SDK S3 ja presente; Cloudinary busca
   * a URL autenticada de 60s ja existente e baixa o conteudo imediatamente
   * (nunca expoe essa URL para fora do backend). Nao opcional: as 3
   * implementacoes reais do projeto (Local/R2/Cloudinary) agora implementam
   * este metodo.
   */
  getFileBuffer(input: {
    publicId: string;
    resourceType: StorageResourceType;
    format?: string | null;
  }): Promise<Buffer>;
}

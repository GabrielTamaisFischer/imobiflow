import { getStorageProviderForName } from "./index.js";
import type { StorageResourceType } from "./types.js";

/**
 * F5B - ponto unico de leitura de bytes a partir de uma linha StoredFile ja
 * carregada do banco (companyId ja validado pelo chamador). Usado pelo
 * gerador de laudo PDF (para embutir fotos de evidencia) e pelo endpoint de
 * download autenticado do laudo - nunca repassa uma URL assinada para fora
 * do backend, nunca confia em path/URL vindo do cliente.
 */
export async function readStoredFileBuffer(file: {
  provider: string;
  publicId: string;
  resourceType: string;
  format?: string | null;
}): Promise<Buffer> {
  const provider = getStorageProviderForName(file.provider as any);
  return provider.getFileBuffer({
    publicId: file.publicId,
    resourceType: file.resourceType as StorageResourceType,
    format: file.format ?? null,
  });
}

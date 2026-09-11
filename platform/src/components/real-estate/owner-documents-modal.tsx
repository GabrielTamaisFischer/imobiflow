import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type * as React from "react";
import {
  deleteOwnerDocument,
  listOwnerDocuments,
  uploadOwnerDocument,
  type OwnerDocument,
  type PropertyOwner,
  type PropertySummary,
} from "@/product/real-estate";

// AJUSTE-FUNCIONAL-03 (2026-09-11): extraído de app.proprietarios.tsx (Fase
// 4D) para um componente compartilhado não vinculado a uma rota, para que a
// Ficha do proprietário (/app/proprietarios/$ownerId) também possa abrir o
// mesmo uploader sem duplicar StoredFile nem importar um arquivo de rota de
// outro arquivo de rota.

// Fase 4D — gestão interna dos documentos do proprietário (owners.view para
// listar, owners.manage para enviar/remover — enforced no backend; um
// corretor sem essas permissões recebe 403 aqui e vê a mensagem de erro,
// mesmo padrão de erro já usado em togglePortal/regeneratePortalToken acima
// nesta mesma tela).
const ownerDocumentAcceptedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/avif"];
const ownerDocumentMaxBytes = 10 * 1024 * 1024;

export function OwnerDocumentsModal({
  owner,
  linkedProperties,
  onClose,
}: {
  owner: PropertyOwner;
  linkedProperties: PropertySummary[];
  onClose: () => void;
}) {
  const [documents, setDocuments] = useState<OwnerDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState("");

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listOwnerDocuments(owner.id);
      setDocuments(response.documents);
    } catch (documentsError) {
      setError(
        documentsError instanceof Error ? documentsError.message : "Não foi possível carregar os documentos.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ownerDocumentAcceptedMimeTypes.includes(file.type)) {
      setError("Formato não suportado. Envie PDF, JPEG, PNG, WEBP ou AVIF.");
      return;
    }
    if (file.size > ownerDocumentMaxBytes) {
      setError("Arquivo acima do limite de 10MB.");
      return;
    }

    setError(null);
    setIsUploading(true);
    try {
      const contentBase64 = await readFileAsBase64(file);
      const { document } = await uploadOwnerDocument(owner.id, {
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        content_base64: contentBase64,
        property_id: propertyId || undefined,
      });
      setDocuments((current) => [document, ...current]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar o documento.");
    } finally {
      setIsUploading(false);
    }
  }

  async function removeDocument(documentId: string) {
    if (!window.confirm("Remover este documento? Ele deixará de aparecer no portal do proprietário.")) return;
    setRemovingId(documentId);
    setError(null);
    try {
      await deleteOwnerDocument(owner.id, documentId);
      setDocuments((current) => current.filter((document) => document.id !== documentId));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Não foi possível remover o documento.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Documentos do proprietário</p>
            <h2 className="text-lg font-semibold">{owner.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1 text-sm">
            Fechar
          </button>
        </div>

        <div className="rounded-md border border-dashed border-border p-4">
          <label className="block text-xs font-medium text-muted-foreground">
            Vincular a um imóvel (opcional)
            <select
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Nenhum imóvel específico</option>
              {linkedProperties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.code || "Sem código"} - {property.title}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90">
            {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Enviar documento
            <input
              type="file"
              accept={ownerDocumentAcceptedMimeTypes.join(",")}
              className="hidden"
              disabled={isUploading}
              onChange={(event) => void handleFileSelected(event)}
            />
          </label>
          <p className="mt-2 text-[11px] text-muted-foreground">PDF ou imagem (JPEG/PNG/WEBP/AVIF), até 10MB.</p>
        </div>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <div className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando documentos...
            </div>
          ) : documents.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum documento enviado ainda para este proprietário.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{document.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {document.category === "pdf" ? "PDF" : document.category === "image" ? "Imagem" : "Arquivo"} ·{" "}
                        {new Intl.DateTimeFormat("pt-BR").format(new Date(document.created_at))}
                        {document.property_id
                          ? ` · ${linkedProperties.find((property) => property.id === document.property_id)?.title ?? "Imóvel vinculado"}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeDocument(document.id)}
                    disabled={removingId === document.id}
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-destructive/30 px-2.5 text-xs font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
                  >
                    {removingId === document.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

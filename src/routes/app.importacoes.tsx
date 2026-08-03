import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import {
  listImports,
  previewImport,
  startImport,
  type ImportJob,
  type ImportPreview,
  type ImportSourceType,
  type ImportType,
} from "@/product/imports";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/importacoes")({
  component: ImportsPage,
});

function ImportsPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("imports");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [fileName, setFileName] = useState("");
  const [contentBase64, setContentBase64] = useState("");
  const [sourceType, setSourceType] = useState<ImportSourceType>("csv");
  const [importType, setImportType] = useState<ImportType>("owners_properties");
  const [allowPartial, setAllowPartial] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refreshImports() {
    try {
      setJobs((await listImports()).imports);
    } catch {
      setJobs([]);
    }
  }

  useEffect(() => {
    if (!isLoading && session) void refreshImports();
  }, [isLoading, session]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setMapping({});
    setSuccess(null);
    setError(null);

    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (
      !lowerName.endsWith(".csv") &&
      !lowerName.endsWith(".json") &&
      !lowerName.endsWith(".xml") &&
      !lowerName.endsWith(".zip") &&
      !lowerName.endsWith(".xlsx") &&
      !lowerName.endsWith(".xls")
    ) {
      setError("Nesta etapa, a importação aceita CSV, JSON, XML, Excel ou ZIP.");
      return;
    }

    setFileName(file.name);
    setSourceType(detectSourceType(lowerName));
    setContentBase64(await fileToBase64(file));
  }

  async function handlePreview() {
    if (!fileName || !contentBase64) {
      setError("Selecione um arquivo CSV real para gerar a prévia.");
      return;
    }

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await previewImport({
        file_name: fileName,
        content_base64: contentBase64,
        import_type: importType,
        source_type: sourceType,
        mapping_json: Object.keys(mapping).length ? mapping : undefined,
      });
      setPreview(response.preview);
      setMapping(response.preview.mapping);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Não foi possível gerar a prévia.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStart() {
    if (!fileName || !contentBase64) return;

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await startImport({
        file_name: fileName,
        content_base64: contentBase64,
        import_type: importType,
        source_type: sourceType,
        mapping_json: mapping,
        allow_partial: allowPartial,
      });
      setSuccess(
        `Importação concluída: ${response.result.imported_properties} imóveis, ${response.result.imported_owners} proprietários e ${response.result.imported_media} fotos por URL processados.`,
      );
      setPreview(null);
      await refreshImports();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Não foi possível iniciar a importação.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ModulePage session={session} module={module}>
      <section className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Importar base real</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Faça upload de CSV, JSON, XML, Excel ou ZIP com fotos, revise a prévia e só depois grave imóveis e proprietários no banco da empresa.
            </p>
          </div>
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent">
            <Upload className="size-4" />
            Selecionar arquivo
            <input
              className="hidden"
              type="file"
              accept=".csv,.json,.xml,.zip,.xlsx,.xls,text/csv,application/json,application/xml,text/xml,application/zip,application/x-zip-compressed,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={handleFile}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_180px] md:items-end">
          <div className="rounded-md border border-dashed border-border p-3 text-sm">
            <p className="font-medium">{fileName || "Nenhum arquivo selecionado"}</p>
            <p className="mt-1 text-muted-foreground">
              O sistema não cria exemplos. Apenas dados do arquivo selecionado serão avaliados.
              {fileName ? ` Formato detectado: ${sourceType.toUpperCase()}.` : ""}
            </p>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Tipo</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              value={importType}
              onChange={(event) => setImportType(event.target.value as ImportType)}
            >
              <option value="owners_properties">Imóveis + proprietários</option>
              <option value="properties">Somente imóveis</option>
              <option value="owners">Somente proprietários</option>
            </select>
          </label>
          <Button type="button" onClick={handlePreview} disabled={isBusy || !contentBase64}>
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            Gerar prévia
          </Button>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {preview ? (
        <section className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Prévia da importação</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {preview.total_rows} linhas encontradas, {preview.valid_rows} válidas e {preview.invalid_rows} com pendência.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowPartial}
                onChange={(event) => setAllowPartial(event.target.checked)}
              />
              Importar válidas mesmo com erros
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Mapeamento de campos</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Revise quais colunas do arquivo alimentam cada campo do ImobiFlow antes de importar.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={handlePreview} disabled={isBusy}>
                Aplicar mapeamento
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {importFieldOptions.map((field) => (
                <label key={field.key} className="text-sm">
                  <span className="mb-1 block font-medium">{field.label}</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-card px-3"
                    value={mapping[field.key] ?? ""}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Não mapear</option>
                    {preview.headers.map((header) => (
                      <option key={`${field.key}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Imóvel</th>
                  <th className="px-3 py-2">Proprietário</th>
                  <th className="px-3 py-2">Pendências</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview_rows.map((row) => (
                  <tr key={row.row_number} className="border-t border-border">
                    <td className="px-3 py-2">{row.row_number}</td>
                    <td className="px-3 py-2">
                      {row.status === "valid" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="size-4" /> Válida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="size-4" /> Revisar
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{String(row.mapped_data.property.title ?? row.mapped_data.property.code ?? "-")}</td>
                    <td className="px-3 py-2">{String(row.mapped_data.owner.name ?? "-")}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.errors.join(", ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={handleStart} disabled={isBusy || preview.valid_rows === 0}>
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Confirmar importação
            </Button>
          </div>
        </section>
      ) : null}

      {jobs.length ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Histórico de importações</h2>
          <div className="mt-3 space-y-2">
            {jobs.map((job) => (
              <div key={job.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{job.file_name}</p>
                  <p className="text-muted-foreground">
                    {job.total_rows} linhas, {job.imported_properties} imóveis, {job.imported_owners} proprietários.
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{job.status}</span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={module.icon}
          title={module.emptyTitle}
          description={module.emptyDescription}
          actionLabel={module.actionLabel}
        />
      )}
    </ModulePage>
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function detectSourceType(lowerFileName: string): ImportSourceType {
  if (lowerFileName.endsWith(".json")) return "json";
  if (lowerFileName.endsWith(".xml")) return "xml";
  if (lowerFileName.endsWith(".zip")) return "zip";
  if (lowerFileName.endsWith(".xlsx") || lowerFileName.endsWith(".xls")) return "excel";
  return "csv";
}

const importFieldOptions = [
  { key: "title", label: "Título do imóvel" },
  { key: "code", label: "Código/referência" },
  { key: "owner_name", label: "Nome do proprietário" },
  { key: "owner_document", label: "CPF/CNPJ proprietário" },
  { key: "owner_email", label: "E-mail proprietário" },
  { key: "owner_phone", label: "Telefone proprietário" },
  { key: "description", label: "Descrição" },
  { key: "property_type", label: "Tipo de imóvel" },
  { key: "operation", label: "Finalidade" },
  { key: "status", label: "Status" },
  { key: "street", label: "Rua" },
  { key: "number", label: "Número" },
  { key: "neighborhood", label: "Bairro" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "UF" },
  { key: "zip_code", label: "CEP" },
  { key: "bedrooms", label: "Dormitórios" },
  { key: "bathrooms", label: "Banheiros" },
  { key: "parking_spaces", label: "Vagas" },
  { key: "private_area", label: "Área útil" },
  { key: "sale_price_cents", label: "Valor de venda" },
  { key: "rent_price_cents", label: "Valor de aluguel" },
  { key: "media_urls", label: "URLs de fotos" },
];

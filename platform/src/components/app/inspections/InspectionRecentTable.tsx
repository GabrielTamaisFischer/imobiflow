import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileDown, Loader2, MoreHorizontal } from "lucide-react";
import {
  canGenerateInspectionReport,
  generateMysqlInspectionReport,
  type MysqlInspection,
} from "@/product/inspections";
import { getSafeApiErrorMessage } from "@/product/app-access";
import { inspectionStatusLabels, inspectionTypeLabels } from "@/product/inspection-dashboard";

type InspectionRecentTableProps = {
  items: MysqlInspection[];
  canEdit: boolean;
  loading: boolean;
};

/**
 * Tabela de vistorias recentes. O menu de ações só mostra o que o backend
 * realmente suporta hoje: abrir a vistoria (sempre) e gerar/abrir o laudo
 * PDF (só quando `canGenerateInspectionReport` permite — vistoria concluída
 * ou arquivada, com permissão de gestão). Arquivar continua apenas na tela
 * de detalhe, onde o fluxo completo já existe e é testado.
 */
export function InspectionRecentTable({ items, canEdit, loading }: InspectionRecentTableProps) {
  return (
    <section aria-labelledby="inspection-recent-title" className="rounded-lg border border-border bg-card p-4">
      <h2 id="inspection-recent-title" className="text-sm font-semibold text-muted-foreground">
        Vistorias recentes
      </h2>
      {loading ? (
        <div className="mt-3 flex min-h-[160px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando vistorias recentes...
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma vistoria encontrada.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3">Código</th>
                <th scope="col" className="py-2 pr-3">Imóvel</th>
                <th scope="col" className="py-2 pr-3">Tipo</th>
                <th scope="col" className="py-2 pr-3">Responsável</th>
                <th scope="col" className="py-2 pr-3">Data</th>
                <th scope="col" className="py-2 pr-3">Status</th>
                <th scope="col" className="py-2 pr-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((inspection) => (
                <InspectionRecentRow key={inspection.id} inspection={inspection} canEdit={canEdit} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InspectionRecentRow({ inspection, canEdit }: { inspection: MysqlInspection; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canReport = canGenerateInspectionReport(inspection.status, canEdit);

  async function handleGenerateReport() {
    setGenerating(true);
    setError(null);
    try {
      const { report } = await generateMysqlInspectionReport(inspection.id);
      if (report.signed_url) window.open(report.signed_url, "_blank", "noopener,noreferrer");
    } catch (reportError) {
      setError(getSafeApiErrorMessage(reportError, "Não foi possível gerar o laudo."));
    } finally {
      setGenerating(false);
      setOpen(false);
    }
  }

  return (
    <tr>
      <td className="py-2 pr-3 font-medium">{inspection.property?.code || "—"}</td>
      <td className="py-2 pr-3 text-muted-foreground">{inspection.property?.title || "Imóvel vinculado"}</td>
      <td className="py-2 pr-3">{inspectionTypeLabels[inspection.type]}</td>
      <td className="py-2 pr-3">{inspection.assigned_user?.name || "Não definido"}</td>
      <td className="py-2 pr-3">{new Date(inspection.updated_at).toLocaleDateString("pt-BR")}</td>
      <td className="py-2 pr-3">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{inspectionStatusLabels[inspection.status]}</span>
      </td>
      <td className="py-2 pr-0 text-right">
        <div className="relative inline-block text-left">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`Ações da vistoria ${inspection.property?.code || ""}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
          {open ? (
            <div role="menu" className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-border bg-card p-1 text-left shadow-md">
              <Link
                to="/app/vistorias/$inspectionId"
                params={{ inspectionId: inspection.id }}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-sm px-3 py-2 text-sm hover:bg-muted"
              >
                Abrir vistoria
              </Link>
              <button
                type="button"
                role="menuitem"
                disabled={!canReport || generating}
                onClick={() => void handleGenerateReport()}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
                Gerar/abrir laudo PDF
              </button>
              {!canReport ? (
                <p className="px-3 pb-1 text-xs text-muted-foreground">
                  {canEdit ? "Disponível após concluir a vistoria." : "Requer permissão de gestão."}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {error ? <p role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}
      </td>
    </tr>
  );
}

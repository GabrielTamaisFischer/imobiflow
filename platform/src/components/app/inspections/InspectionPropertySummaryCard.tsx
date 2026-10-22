import { CheckCircle2, ImageOff, Loader2 } from "lucide-react";
import type { Property } from "@/product/real-estate";
import {
  formatPropertyAddress,
  getUtilityAvailability,
  propertyStatusLabels,
  propertyTypeLabels,
} from "@/product/inspection-property-brief";

type InspectionPropertySummaryCardProps = {
  property: Property | null;
  loading: boolean;
  error: string | null;
};

const notInformed = "Não informado";

function formatArea(value: number | null, unit = "m²") {
  return value != null ? `${value} ${unit}` : notInformed;
}

function formatCount(value: number | null) {
  return value != null ? String(value) : notInformed;
}

/**
 * Card rico do imóvel selecionado. Só mostra dados reais — campo ausente
 * aparece como "Não informado", nunca omitido silenciosamente nem
 * inventado. "Contrato ativo" e "locatário/comprador" ficam de fora por
 * ora: não existe hoje uma busca eficiente de contrato por imóvel (ver
 * nota de entrega do Sub-bloco 2) — mostrar isso exigiria buscar todos os
 * contratos da empresa e filtrar no cliente, o que não é um dado "real e já
 * suportado" barato o suficiente para esta etapa.
 */
export function InspectionPropertySummaryCard({ property, loading, error }: InspectionPropertySummaryCardProps) {
  if (loading) {
    return (
      <section aria-live="polite" className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando dados do imóvel...
      </section>
    );
  }

  if (error) {
    return (
      <section role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </section>
    );
  }

  if (!property) return null;

  const cover = property.property_media?.find((media) => media.is_cover) ?? property.property_media?.[0] ?? null;
  const utilities = getUtilityAvailability(property);

  return (
    <section aria-labelledby="inspection-selected-property-title" className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 bg-primary/5 px-4 py-2 text-xs font-medium text-primary">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Dados carregados automaticamente
      </div>
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        <div className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/60 sm:w-40">
          {cover ? (
            <img src={cover.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1">
          <h2 id="inspection-selected-property-title" className="text-base font-semibold">
            {property.code || "Sem código"} — {property.title}
          </h2>
          <p className="text-sm text-muted-foreground">{formatPropertyAddress(property) || notInformed}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{propertyTypeLabels[property.property_type] ?? property.property_type}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{propertyStatusLabels[property.status] ?? property.status}</span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Área útil</dt><dd>{formatArea(property.private_area)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Área total</dt><dd>{formatArea(property.total_area)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Dormitórios</dt><dd>{formatCount(property.bedrooms)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Suítes</dt><dd>{formatCount(property.suites)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Banheiros</dt><dd>{formatCount(property.bathrooms)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Vagas</dt><dd>{formatCount(property.parking_spaces)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Proprietário</dt><dd>{property.property_owners?.name || notInformed}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Responsável</dt><dd>{property.responsible_user?.name || notInformed}</dd></div>
          </dl>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Energia: {utilities.energia === "available" ? "Disponível" : notInformed}</span>
            <span>Água: {utilities.agua === "available" ? "Disponível" : notInformed}</span>
            <span>Gás: {notInformed}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

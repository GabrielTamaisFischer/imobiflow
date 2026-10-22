import { displayStatusKeyFor, domainValueForStatusKey, INSPECTION_ITEM_STATUSES, type InspectionItemStatusKey } from "@/product/inspection-item-status";
import type { MysqlInspectionCondition } from "@/product/inspections";

type Props = {
  condition: MysqlInspectionCondition;
  onChange: (next: MysqlInspectionCondition) => void;
  disabled?: boolean;
};

const STYLES: Record<InspectionItemStatusKey, string> = {
  good: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700",
  attention: "border-amber-600/40 bg-amber-600/10 text-amber-700",
  damaged: "border-destructive/40 bg-destructive/10 text-destructive",
  not_applicable: "border-border bg-muted text-muted-foreground",
};

/** 4 botões (Bom/Atenção/Avaria/Não se aplica) — camada de apresentação sobre o enum real de 7 valores (ver inspection-item-status.ts). */
export function InspectionItemStatusPicker({ condition, onChange, disabled }: Props) {
  const active = displayStatusKeyFor(condition);
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Status do item">
      {INSPECTION_ITEM_STATUSES.map((status) => {
        const selected = active === status.key;
        return (
          <button
            key={status.key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(domainValueForStatusKey(status.key))}
            className={`h-9 rounded-md border px-3 text-sm font-medium disabled:opacity-50 ${selected ? STYLES[status.key] : "border-border bg-background text-foreground"}`}
          >
            {status.label}
          </button>
        );
      })}
    </div>
  );
}

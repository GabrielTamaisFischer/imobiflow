type Props = { reviewed: number; total: number; label?: string };

/** Barra de progresso compacta reaproveitada na sidebar e no resumo lateral. */
export function InspectionProgress({ reviewed, total, label }: Props) {
  const percent = total <= 0 ? 0 : Math.round((reviewed / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label ?? `${reviewed} de ${total} itens`}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

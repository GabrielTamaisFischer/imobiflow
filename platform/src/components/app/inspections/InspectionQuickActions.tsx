import { FileDown, GitCompareArrows, PenLine, Plus } from "lucide-react";

type InspectionQuickActionsProps = {
  canCreate: boolean;
  onNewInspection: () => void;
};

type QuickAction = {
  key: string;
  label: string;
  icon: typeof Plus;
  enabled: boolean;
  helper?: string;
  onClick?: () => void;
};

/**
 * Atalhos do Home. Só "Nova vistoria" age com contexto real aqui. Os outros
 * três dependem de uma vistoria específica já selecionada (comparação,
 * exportação) ou de uma integração que ainda não existe (assinatura online
 * canônica) — por isso ficam visíveis e desabilitados, com o motivo escrito,
 * em vez de simular uma ação que não faz nada de verdade.
 */
export function InspectionQuickActions({ canCreate, onNewInspection }: InspectionQuickActionsProps) {
  const actions: QuickAction[] = [
    { key: "new", label: "Nova vistoria", icon: Plus, enabled: canCreate, onClick: onNewInspection, helper: canCreate ? undefined : "Requer permissão de gestão de vistorias." },
    { key: "compare", label: "Comparar entrada×saída", icon: GitCompareArrows, enabled: false, helper: "Disponível em breve — a seleção por imóvel/contrato ainda está em desenvolvimento; a comparação já existe por ID dentro de cada vistoria." },
    { key: "signature", label: "Gerar link de assinatura", icon: PenLine, enabled: false, helper: "Assinatura online será habilitada após a conclusão da integração." },
    { key: "export", label: "Exportar laudo PDF", icon: FileDown, enabled: false, helper: "Selecione uma vistoria concluída na tabela abaixo para gerar o laudo." },
  ];

  return (
    <section aria-labelledby="inspection-quick-actions-title" className="rounded-lg border border-border bg-card p-4">
      <h2 id="inspection-quick-actions-title" className="text-sm font-semibold text-muted-foreground">
        Atalhos rápidos
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <div key={action.key}>
            <button
              type="button"
              disabled={!action.enabled}
              onClick={action.onClick}
              aria-describedby={action.helper ? `inspection-quick-action-${action.key}-helper` : undefined}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              <action.icon className="h-4 w-4" aria-hidden="true" />
              {action.label}
            </button>
            {action.helper ? (
              <p id={`inspection-quick-action-${action.key}-helper`} className="mt-1 text-xs text-muted-foreground">
                {action.helper}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

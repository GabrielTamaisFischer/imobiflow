import { Check } from "lucide-react";

const steps = [
  { key: "initial", label: "Dados iniciais" },
  { key: "rooms", label: "Ambientes e itens" },
  { key: "evidence", label: "Evidências" },
  { key: "signatures", label: "Assinaturas e laudo" },
] as const;

export type InspectionStepKey = (typeof steps)[number]["key"];

type InspectionStepperProps = {
  current: InspectionStepKey;
  /** Passos já alcançáveis de verdade (ex.: "rooms" só depois de a vistoria
   * existir). Passos não alcançáveis aparecem esmaecidos, nunca escondidos —
   * orientam sem fingir que já dá para entrar neles. */
  reachable?: InspectionStepKey[];
};

/**
 * Indicador visual dos 4 passos do fluxo de vistoria (Seção 11). Hoje a
 * "Nova vistoria" só cobre o passo 1 — os demais (ambientes/itens,
 * evidências, assinaturas/laudo) entram nos próximos sub-blocos. Puramente
 * de orientação: não navega nem troca de tela por si só.
 */
export function InspectionStepper({ current, reachable = ["initial"] }: InspectionStepperProps) {
  const currentIndex = steps.findIndex((step) => step.key === current);
  return (
    <ol aria-label="Etapas da vistoria" className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((step, index) => {
        const isCurrent = step.key === current;
        const isDone = index < currentIndex;
        const isReachable = reachable.includes(step.key);
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${
                isCurrent
                  ? "border-primary bg-primary/10 text-primary"
                  : isDone
                    ? "border-border bg-muted text-foreground"
                    : "border-border/60 text-muted-foreground"
              } ${isReachable ? "" : "opacity-60"}`}
            >
              {isDone ? <Check className="h-3 w-3" aria-hidden="true" /> : <span>{index + 1}.</span>}
              {step.label}
            </span>
            {index < steps.length - 1 ? <span aria-hidden="true" className="text-muted-foreground">—</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

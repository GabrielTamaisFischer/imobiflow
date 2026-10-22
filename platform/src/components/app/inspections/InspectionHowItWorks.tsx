import { Camera, ClipboardCheck, FileSignature, Search } from "lucide-react";

const steps = [
  { icon: Search, title: "1. Escolha o imóvel", description: "Busque por código, endereço ou título." },
  { icon: ClipboardCheck, title: "2. Percorra os ambientes", description: "Ambientes e itens sugeridos a partir do cadastro do imóvel." },
  { icon: Camera, title: "3. Registre evidências", description: "Fotos e observações por item, com salvamento automático." },
  { icon: FileSignature, title: "4. Conclua e gere o laudo", description: "Finalize a vistoria e exporte o laudo em PDF." },
];

/** Explicador visual e compacto de 4 passos — conteúdo estático, sem estado. */
export function InspectionHowItWorks() {
  return (
    <section aria-labelledby="inspection-how-it-works-title" className="rounded-lg border border-border bg-card p-4">
      <h2 id="inspection-how-it-works-title" className="text-sm font-semibold text-muted-foreground">
        Como funciona
      </h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <li key={step.title} className="flex items-start gap-3 rounded-md border border-border/60 bg-background p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <step.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">{step.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

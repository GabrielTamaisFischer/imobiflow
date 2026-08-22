import { AnimatedNumber } from "./AnimatedNumber";

const stats = [
  {
    target: 12_400_000,
    prefix: "+",
    suffix: "",
    decimals: 1,
    compact: "million" as const,
    decimalSeparator: "." as const,
    label: "em negociações mapeadas",
  },
  {
    target: 48_000,
    prefix: "+",
    suffix: "",
    decimals: 0,
    compact: "thousand" as const,
    decimalSeparator: "," as const,
    label: "leads processados",
  },
  {
    target: 3,
    prefix: "",
    suffix: "x",
    decimals: 0,
    compact: "none" as const,
    decimalSeparator: "," as const,
    label: "mais velocidade operacional",
  },
  {
    target: 187_000,
    prefix: "+ R$ ",
    suffix: "",
    decimals: 0,
    compact: "thousand" as const,
    decimalSeparator: "," as const,
    label: "faturamento mensal potencial",
  },
];

export function Stats() {
  return (
    <section className="relative border-y border-border bg-surface-1 py-14">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-3xl font-black md:text-4xl text-gradient-brand">
              <AnimatedNumber
                target={s.target}
                prefix={s.prefix}
                suffix={s.suffix}
                decimals={s.decimals}
                decimalSeparator={s.decimalSeparator}
                compact={s.compact}
              />
            </div>
            <div className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

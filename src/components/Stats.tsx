const stats = [
  { value: "+1.200", label: "Imobiliárias ativas" },
  { value: "3.4x", label: "Mais leads convertidos" },
  { value: "R$ 8.7B", label: "Em imóveis transacionados" },
  { value: "97%", label: "Satisfação dos gestores" },
];

export function Stats() {
  return (
    <section className="relative border-y border-border bg-surface-1 py-14">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-3xl font-black md:text-4xl text-gradient-brand">{s.value}</div>
            <div className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

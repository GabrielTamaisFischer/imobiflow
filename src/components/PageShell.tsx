import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ChevronRight } from "lucide-react";

type Crumb = { label: string; to?: string };

export function PageShell({
  eyebrow,
  title,
  subtitle,
  crumbs,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <Navbar />
      <header className="relative border-b border-border/60 bg-surface-1">
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_25%,transparent),transparent)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-20">
          {crumbs && (
            <nav className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">Início</Link>
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  {c.to ? <Link to={c.to} className="hover:text-foreground">{c.label}</Link> : <span className="text-foreground">{c.label}</span>}
                </span>
              ))}
            </nav>
          )}
          {eyebrow && <div className="mb-3 inline-flex rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-gradient-brand">{eyebrow}</div>}
          <h1 className="text-4xl font-black tracking-tight md:text-5xl">{title}</h1>
          {subtitle && <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-16">{children}</main>
      <Footer />
    </div>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-14">
      {title && <h2 className="mb-5 text-2xl font-bold tracking-tight">{title}</h2>}
      <div className="space-y-4 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function FeatureGrid({ items }: { items: { icon?: ReactNode; title: string; desc: string }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((it) => (
        <div key={it.title} className="rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40">
          {it.icon && <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand text-primary-foreground">{it.icon}</div>}
          <div className="text-base font-semibold text-foreground">{it.title}</div>
          <p className="mt-1.5 text-sm text-muted-foreground">{it.desc}</p>
        </div>
      ))}
    </div>
  );
}

export function CTACard({ title, desc, to = "/", label = "Começar agora" }: { title: string; desc: string; to?: string; label?: string }) {
  return (
    <div className="mt-10 rounded-2xl border border-border bg-gradient-to-br from-card to-surface-1 p-8 text-center">
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      <Link to={to} className="mt-5 inline-flex rounded-full bg-gradient-brand px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110">{label}</Link>
    </div>
  );
}
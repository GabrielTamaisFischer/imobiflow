import { Menu, X } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "./theme/theme-toggle";

const links = [
  { href: "/produto", label: "Produto" },
  { href: "/quem-usa", label: "Quem usa" },
  { href: "/resultados", label: "Resultados" },
  { href: "/inteligencia", label: "Inteligência" },
  { href: "/planos", label: "Planos" },
  { href: "/faq", label: "FAQ" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-40 border-b border-border/60 bg-background/40 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-brand">
            <span className="absolute inset-0 rounded-xl bg-gradient-brand blur-md opacity-60" />
            <span className="relative font-black text-primary-foreground">i</span>
          </span>
          <span className="text-base font-bold tracking-tight">
            Imobi<span className="text-gradient-brand">Flow</span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <a href="/entrar" className="hidden text-sm text-muted-foreground transition hover:text-foreground sm:block">
            Entrar
          </a>
          <a
            href="/cadastro"
            className="hidden rounded-full bg-gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 sm:inline-flex"
          >
            Teste grátis
          </a>
          <button
            className="md:hidden rounded-md p-2 text-muted-foreground"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background/95 px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                {l.label}
              </a>
            ))}
            <a href="/entrar" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              Entrar
            </a>
            <a href="/cadastro" onClick={() => setOpen(false)} className="mt-2 rounded-full bg-gradient-brand px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
              Teste grátis
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

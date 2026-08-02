import { Instagram, Linkedin, Youtube, Mail, Phone, MapPin } from "lucide-react";
import { Link } from "@tanstack/react-router";

const cols = [
  {
    title: "Produto",
    links: [
      ["Visão geral", "/produto"],
      ["Para gestores", "/para-gestores"],
      ["Para corretores", "/para-corretores"],
      ["Inteligência IA", "/inteligencia-ia"],
      ["Vistoria", "/vistoria"],
    ],
  },
  {
    title: "Empresa",
    links: [
      ["Sobre", "/sobre"],
      ["Clientes", "/clientes"],
      ["Blog", "/blog"],
      ["Carreiras", "/carreiras"],
      ["Imprensa", "/imprensa"],
    ],
  },
  {
    title: "Recursos",
    links: [
      ["Central de ajuda", "/ajuda"],
      ["Documentação", "/docs"],
      ["API", "/api-docs"],
      ["Status", "/status"],
      ["Indique e ganhe", "/indique"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Termos de uso", "/termos"],
      ["Política de privacidade", "/privacidade"],
      ["LGPD", "/lgpd"],
      ["Contrato SaaS", "/contrato"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-surface-1">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-10">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-brand text-base font-black text-primary-foreground">i</span>
              <span className="text-lg font-bold tracking-tight">
                Imobi<span className="text-gradient-brand">Flow</span>
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Inteligência que move imóveis. Tudo o que sua imobiliária precisa para vender mais, do lead ao contrato.
            </p>
            <div className="mt-6 space-y-2 text-sm text-muted-foreground">
              <a href="mailto:contato@imobiflow.app" className="flex items-center gap-2 hover:text-foreground">
                <Mail className="h-4 w-4 text-primary" />
                <span>contato@imobiflow.app</span>
              </a>
              <a href="tel:+551130000000" className="flex items-center gap-2 hover:text-foreground">
                <Phone className="h-4 w-4 text-primary" />
                <span>(11) 3000-0000</span>
              </a>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span>Av. Paulista, 1000 · São Paulo / SP</span>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              {[Instagram, Linkedin, Youtube].map((Icon, i) => (
                <a key={i} href="#" aria-label="social" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <div className="text-sm font-bold">{c.title}</div>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <Link to={href} className="transition hover:text-foreground">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-border bg-card p-6 md:flex md:items-center md:justify-between">
          <div>
            <div className="font-semibold">Receba insights do mercado imobiliário</div>
            <div className="text-sm text-muted-foreground">Newsletter quinzenal · sem spam.</div>
          </div>
          <form className="mt-4 flex gap-2 md:mt-0">
            <input
              type="email"
              required
              placeholder="seu@email.com"
              className="w-full rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary md:w-72"
            />
            <button type="submit" className="rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
              Inscrever
            </button>
          </form>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} ImobiFlow Tecnologia LTDA · CNPJ 00.000.000/0001-00</p>
          <p>Feito com 💜 no Brasil · Inteligência que move imóveis</p>
        </div>
      </div>
    </footer>
  );
}

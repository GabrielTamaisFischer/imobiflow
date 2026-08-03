import { Instagram, Linkedin, Mail, MapPin, Phone, ShieldCheck, Youtube } from "lucide-react";

const cols = [
  {
    title: "Produto",
    links: [
      ["CRM Inteligente", "/produto"],
      ["Gestão de Imóveis", "/produto"],
      ["Vistoria Inteligente", "/vistoria"],
      ["Financeiro", "/produto"],
      ["Locação", "/produto"],
      ["IA Imobiliária", "/inteligencia"],
      ["Automação WhatsApp", "/produto"],
      ["Assinatura Digital", "/produto"],
    ],
  },
  {
    title: "Recursos",
    links: [
      ["API", "/api"],
      ["Webhooks", "/api"],
      ["Aplicativo Android", "/documentacao"],
      ["Desktop", "/documentacao"],
      ["Multiempresa", "/documentacao"],
      ["Portal do Proprietário", "/documentacao"],
      ["Portal do Inquilino", "/documentacao"],
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
    title: "Legal",
    links: [
      ["LGPD", "/lgpd"],
      ["Política de Privacidade", "/politica-de-privacidade"],
      ["Termos SaaS", "/termos-de-uso"],
      ["Segurança", "/status"],
      ["Compliance", "/contrato-saas"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-surface-1">
      <div className="absolute inset-0 grid-bg opacity-35" />
      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-10">
        <div className="grid gap-12 lg:grid-cols-[1.35fr_repeat(4,1fr)]">
          <div>
            <a href="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand text-base font-black text-primary-foreground shadow-glow">
                i
              </span>
              <span className="text-xl font-bold tracking-tight">
                Imobi<span className="text-gradient-brand">Flow</span>
              </span>
            </a>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              O ImobiFlow nasceu para modernizar a operação imobiliária brasileira com
              tecnologia, automação e inteligência operacional. Uma plataforma para
              centralizar vendas, locações, contratos, vistorias, financeiro e gestão.
            </p>
            <div className="mt-6 rounded-2xl border border-border bg-card p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-bold">SaaS preparado para operação real</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Multiempresa, permissões, assinatura ativa, LGPD e auditoria como base do produto.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-2 text-sm text-muted-foreground">
              <a href="mailto:contato@imobiflow.app" className="flex items-center gap-2 hover:text-foreground">
                <Mail className="h-4 w-4 text-primary" /> contato@imobiflow.app
              </a>
              <a href="tel:+551130000000" className="flex items-center gap-2 hover:text-foreground">
                <Phone className="h-4 w-4 text-primary" /> (11) 3000-0000
              </a>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> São Paulo / SP · Atendimento nacional
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              {[Instagram, Linkedin, Youtube].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  aria-label="social"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
                >
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
                    <a href={href} className="transition hover:text-foreground">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-3xl border border-border bg-card p-6 md:flex md:items-center md:justify-between">
          <div>
            <div className="font-semibold">Receba inteligência operacional para imobiliárias</div>
            <div className="text-sm text-muted-foreground">
              Conteúdos sobre vendas, locação, vistoria, contratos, IA e gestão imobiliária.
            </div>
          </div>
          <form className="mt-4 flex gap-2 md:mt-0">
            <input
              type="email"
              required
              placeholder="seu@email.com"
              className="w-full rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary md:w-72"
            />
            <button
              type="submit"
              className="rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
            >
              Inscrever
            </button>
          </form>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} ImobiFlow Tecnologia LTDA · Plataforma SaaS imobiliária</p>
          <p>Inteligência operacional para imobiliárias modernas.</p>
        </div>
      </div>
    </footer>
  );
}

import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bot,
  Brain,
  Building2,
  CalendarCheck,
  Camera,
  Check,
  ClipboardList,
  FileSignature,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";

const chaos = ["WhatsApp", "Excel", "Word", "Post-it", "Contratos", "Comissões"];
const flow = ["Lead", "Visita", "Proposta", "Contrato", "Financeiro", "Repasse"];

const ecosystem = [
  {
    icon: Users,
    title: "CRM Inteligente",
    body: "Lead scoring com IA, funil visual, histórico completo, automações e integração total com WhatsApp.",
  },
  {
    icon: Building2,
    title: "Gestão de Imóveis",
    body: "Cadastre imóveis completos com fotos, vídeos, documentos, proprietários e publicação automática.",
  },
  {
    icon: Camera,
    title: "Vistoria Inteligente",
    body: "Vistorias profissionais por cômodo, comparação entrada/saída e laudos PDF automatizados.",
  },
  {
    icon: WalletCards,
    title: "Financeiro Imobiliário",
    body: "Comissões, repasses, inadimplência, cobranças, fluxo de caixa e relatórios em tempo real.",
  },
  {
    icon: FileSignature,
    title: "Contratos & Assinaturas",
    body: "Contratos automatizados com assinatura digital, histórico jurídico e renovação inteligente.",
  },
  {
    icon: Brain,
    title: "IA Imobiliária",
    body: "Descrições automáticas, respostas inteligentes, geração de anúncios e análise de leads.",
  },
];

const aiBlocks = [
  ["Geração de anúncios", "Transforme dados técnicos em anúncios profissionais para portais, Instagram e WhatsApp."],
  ["Respostas automáticas", "A IA entende intenção, responde dúvidas e acelera o atendimento."],
  ["Lead Scoring Inteligente", "Descubra quais clientes têm maior chance de fechar negócio."],
  ["Resumo automático de vistoria", "Padronize linguagem técnica e gere laudos profissionais em segundos."],
  ["Sugestão de preço", "Análises inteligentes baseadas em região, perfil e mercado."],
];

const inspectionFeatures = [
  "Vistoria por cômodo",
  "Upload instantâneo de fotos",
  "Comparação entrada vs saída",
  "Assinatura digital",
  "PDF premium automático",
  "Organização por ambiente",
  "Funcionamento offline no celular",
];

const security = [
  "Multiempresa com isolamento por company_id",
  "Controle de permissões",
  "Logs de auditoria",
  "MFA preparado no roadmap",
  "HTTPS/TLS",
  "Proteção LGPD",
  "Backups automáticos",
  "Controle por assinatura SaaS",
];

export function OperationsNarrative() {
  return (
    <>
      <OperationalChaos />
      <Ecosystem />
      <RealEstateAI />
      <InspectionSpotlight />
      <ManagersAndBrokers />
      <SecuritySection />
      <NotJustCrm />
    </>
  );
}

function OperationalChaos() {
  return (
    <section id="resultados" className="relative overflow-hidden bg-surface-1 py-28">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            O caos operacional
          </p>
          <h2 className="mt-3 text-4xl font-black md:text-6xl">
            Sua imobiliária cresce. O caos operacional cresce junto.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            Leads esquecidos. Contratos espalhados. Vistorias feitas no WhatsApp.
            Comissões calculadas manualmente. Corretores sem follow-up. Planilhas que
            ninguém entende. A maioria das imobiliárias perde vendas não por falta de
            imóveis, mas por falta de processo.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[28px] border border-destructive/20 bg-card p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Antes: operação fragmentada</h3>
                <p className="text-sm text-muted-foreground">Muito esforço para pouca previsibilidade.</p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {chaos.map((item, index) => (
                <div
                  key={item}
                  className="rounded-2xl border border-border bg-background/60 p-4"
                  style={{ transform: `rotate(${[-2, 1, -1, 2, -2, 1][index]}deg)` }}
                >
                  <div className="text-sm font-bold">{item}</div>
                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-destructive/50" style={{ width: `${55 + index * 6}%` }} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Informação solta</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-primary/25 bg-card p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand-soft text-primary ring-1 ring-border">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Depois: fluxo inteligente</h3>
                <p className="text-sm text-muted-foreground">Tudo conectado em uma rotina operacional.</p>
              </div>
            </div>
            <div className="mt-8 space-y-4">
              {flow.map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-border bg-background/60 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-sm font-black text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{item}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${45 + index * 9}%` }} />
                    </div>
                  </div>
                  <Check className="h-4 w-4 text-primary" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Ecosystem() {
  return (
    <section id="produto" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
              Ecossistema ImobiFlow
            </p>
            <h2 className="mt-3 text-4xl font-black md:text-6xl">
              Tudo conectado. Tudo sincronizado. Tudo em tempo real.
            </h2>
          </div>
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
            Cada módulo conversa com o outro automaticamente. O imóvel alimenta o CRM.
            O CRM gera visitas. A visita gera proposta. A proposta gera contrato. O
            contrato gera financeiro. O financeiro gera repasse. Sem retrabalho. Sem
            informações perdidas.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ecosystem.map((item) => (
            <article
              key={item.title}
              className="ring-gradient group relative overflow-hidden rounded-3xl border border-border bg-card p-7 transition duration-300 hover:-translate-y-1"
            >
              <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-gradient-brand opacity-0 blur-3xl transition group-hover:opacity-25" />
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand-soft ring-1 ring-border">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-6 text-xl font-bold">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RealEstateAI() {
  return (
    <section id="ia" className="relative overflow-hidden bg-surface-1 py-28">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-brand opacity-[0.10] blur-[160px]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            IA imobiliária
          </p>
          <h2 className="mt-3 text-4xl font-black leading-tight md:text-6xl">
            Uma IA treinada para o mercado imobiliário.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            O ImobiFlow não usa IA como efeito visual. Ela trabalha diariamente dentro
            da operação da imobiliária: escreve anúncios, resume vistorias, qualifica
            leads, sugere respostas e transforma dados soltos em decisões.
          </p>
          <div className="mt-8 grid gap-3">
            {aiBlocks.map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <SparkDot />
                  <div>
                    <h3 className="text-sm font-bold">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 bg-gradient-brand-soft opacity-70 blur-3xl" />
          <div className="relative overflow-hidden rounded-[30px] border border-border bg-card shadow-card">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Bot className="h-4 w-4 text-primary" />
                Assistente ImobiFlow IA
              </div>
            </div>
            <div className="space-y-4 p-5">
              <Prompt title="Dados do imóvel" text="Apartamento 118m², 3 suítes, varanda gourmet, 2 vagas, bairro nobre, condomínio completo." />
              <Response title="Descrição premium" text="Apartamento elegante com planta inteligente, varanda gourmet integrada e localização estratégica para famílias que desejam conforto, segurança e praticidade." />
              <Response title="Resposta WhatsApp" text="Tenho uma opção perfeita para o perfil que você descreveu. Posso te enviar fotos, valores e horários de visita agora?" />
              <Response title="Resumo de vistoria" text="Sala e dormitórios em bom estado geral. Pintura preservada, piso sem avarias visíveis e pontos elétricos funcionais." />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InspectionSpotlight() {
  return (
    <section id="vistoria" className="relative py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="relative">
          <div className="absolute -inset-6 bg-gradient-brand-soft opacity-70 blur-3xl" />
          <div className="relative rounded-[32px] border border-border bg-card p-5 shadow-card">
            <div className="grid gap-4 sm:grid-cols-2">
              <InspectionPanel title="Antes" label="Word, papel e WhatsApp" tone="muted" />
              <InspectionPanel title="Depois" label="Laudo técnico automático" tone="brand" />
            </div>
            <div className="mt-5 rounded-2xl border border-border bg-background/70 p-4">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-sm font-bold">Vistoria mobile offline</div>
                  <div className="text-xs text-muted-foreground">Fotos, cômodos, assinatura e PDF premium.</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {["Sala", "Cozinha", "Suíte"].map((room) => (
                  <div key={room} className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold">
                    {room}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
            Produto estrela
          </p>
          <h2 className="mt-3 text-4xl font-black leading-tight md:text-6xl">
            A vistoria que faz sua imobiliária parecer anos à frente.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            Pare de fazer vistorias no Word, no papel ou pelo WhatsApp. O ImobiFlow
            transforma vistoria em um processo profissional, padronizado, rápido e comparável.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {inspectionFeatures.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
                <BadgeCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ManagersAndBrokers() {
  return (
    <section id="quem-usa" className="bg-surface-1 py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <AudienceCard
            eyebrow="Para gestores"
            title="Gestão imobiliária baseada em dados reais."
            text="Tenha visão completa de vendas, locações, repasses, contratos, leads, equipe, inadimplência e financeiro em tempo real."
            icon={TrendingUp}
            items={["Leads ativos", "Vendas no mês", "Receita recorrente", "Taxa de conversão", "Corretores em destaque", "Imóveis mais procurados"]}
          />
          <AudienceCard
            eyebrow="Para corretores"
            title="Menos tarefas operacionais. Mais tempo fechando negócios."
            text="O corretor recebe leads organizados, lembretes automáticos, mensagens prontas, imóveis para envio e follow-up inteligente."
            icon={MessageSquare}
            items={["Agenda integrada", "Histórico completo", "WhatsApp rápido", "Imóveis prontos", "Tarefas automáticas", "Próxima ação sugerida"]}
          />
        </div>
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section className="relative py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Segurança e arquitetura
          </p>
          <h2 className="mt-3 text-4xl font-black leading-tight md:text-6xl">
            Arquitetura preparada para operações imobiliárias reais.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            Usuário logado não significa usuário autorizado. O ImobiFlow foi estruturado
            para validar login, empresa vinculada, assinatura ativa e permissão antes de
            liberar a operação.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {security.map((item) => (
            <div key={item} className="rounded-2xl border border-border bg-card p-5">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div className="mt-4 text-sm font-semibold">{item}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NotJustCrm() {
  return (
    <section className="relative overflow-hidden bg-surface-1 py-28">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          Não é só um CRM
        </p>
        <h2 className="mt-3 text-4xl font-black leading-tight md:text-6xl">
          O ImobiFlow não nasceu para ser apenas mais um CRM.
        </h2>
        <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Ele foi projetado para centralizar toda a operação imobiliária: comercial,
          financeira, documental, contratual, operacional e administrativa. Tudo conectado
          em um único ecossistema.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {["Comercial", "Financeira", "Documental", "Contratual", "Operacional", "Administrativa"].map((item) => (
            <span key={item} className="rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold">
              {item}
            </span>
          ))}
        </div>
        <a
          href="/cadastro"
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
        >
          Solicitar demonstração
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}

function SparkDot() {
  return (
    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-brand-soft ring-1 ring-border">
      <Bot className="h-3.5 w-3.5 text-primary" />
    </span>
  );
}

function Prompt({ title, text }: { title: string; text: string }) {
  return (
    <div className="ml-auto max-w-[88%] rounded-2xl bg-gradient-brand px-4 py-3 text-primary-foreground">
      <div className="text-xs font-bold opacity-80">{title}</div>
      <p className="mt-1 text-sm leading-relaxed">{text}</p>
    </div>
  );
}

function Response({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-[92%] rounded-2xl border border-border bg-background/70 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-bold text-primary">
        <Bot className="h-3.5 w-3.5" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function InspectionPanel({ title, label, tone }: { title: string; label: string; tone: "muted" | "brand" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "brand" ? "border-primary/30 bg-gradient-brand-soft" : "border-border bg-background/70"}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-4 aspect-[4/3] rounded-2xl border border-border bg-card p-4">
        <div className={`h-full rounded-xl ${tone === "brand" ? "bg-gradient-brand" : "bg-muted"}`} />
      </div>
      <div className="mt-3 text-sm font-bold">{label}</div>
    </div>
  );
}

function AudienceCard({
  eyebrow,
  title,
  text,
  icon: Icon,
  items,
}: {
  eyebrow: string;
  title: string;
  text: string;
  icon: typeof TrendingUp;
  items: string[];
}) {
  return (
    <article className="ring-gradient rounded-[30px] border border-border bg-card p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand-soft ring-1 ring-border">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black leading-tight md:text-5xl">{title}</h2>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">{text}</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-3 rounded-2xl border border-border bg-background/60 p-4 text-sm">
            <CalendarCheck className="h-4 w-4 flex-shrink-0 text-primary" />
            {item}
          </div>
        ))}
      </div>
    </article>
  );
}

import { ArrowRight, CheckCircle2, Clock3, LockKeyhole, TrendingUp } from "lucide-react";
import dashboardPreview from "@/assets/dashboard-preview.jpg";

const outcomes = [
  {
    icon: TrendingUp,
    title: "Crescimento previsivel",
    body: "Acompanhe origem dos leads, etapa do funil, taxa de conversao, visitas, propostas e fechamento por corretor para saber onde investir e onde corrigir.",
  },
  {
    icon: Clock3,
    title: "Rotina com menos retrabalho",
    body: "Centralize clientes, imoveis, tarefas, historico de atendimento e proximas acoes para reduzir planilhas, mensagens perdidas e cadastros duplicados.",
  },
  {
    icon: LockKeyhole,
    title: "Acesso controlado",
    body: "A area interna valida login, empresa, assinatura e permissao. O usuario so entra quando todos os criterios de autorizacao forem atendidos.",
  },
];

const reasons = [
  "Implantacao pensada para operacoes reais: corretores, gestores, financeiro, locacao, vendas e futuras filiais.",
  "Base SaaS multiempresa preparada para separar dados por company_id e proteger a operacao de cada imobiliaria.",
  "Estados vazios profissionais: o sistema comeca limpo, sem dados ficticios, e orienta o proximo cadastro real.",
  "Planos conectados a assinatura ativa, com bloqueio automatico quando houver cancelamento, expiracao ou inadimplencia.",
  "Roadmap preparado para Kiwify/Cakto, webhooks de pagamento, IA, vistorias, contratos, repasses e automacoes.",
  "Conteudo, suporte e evolucao focados no mercado imobiliario brasileiro, com linguagem de operacao e nao apenas de tecnologia.",
];

export function BusinessCase() {
  return (
    <section id="decisao" className="relative overflow-hidden bg-surface-1 py-28">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="pointer-events-none absolute -left-32 top-10 h-[460px] w-[460px] rounded-full bg-primary opacity-[0.10] blur-[150px]" />
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Por que contratar
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight md:text-5xl">
              Uma plataforma para transformar atendimento em receita, com controle de ponta a ponta.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              O ImobiFlow foi desenhado para empresas imobiliarias que precisam vender mais sem perder governanca. A proposta nao e apenas ter uma tela bonita: e organizar o processo comercial, proteger dados, acelerar respostas, dar clareza ao gestor e preparar a operacao para crescer com assinatura ativa e permissoes bem definidas.
            </p>

            <div className="mt-8 grid gap-4">
              {outcomes.map((item) => (
                <div key={item.title} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex gap-4">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-brand-soft ring-1 ring-border">
                      <item.icon className="h-5 w-5 text-primary" />
                    </span>
                    <div>
                      <h3 className="font-bold">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-brand-soft opacity-70 blur-3xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-border bg-card shadow-card">
              <img
                src={dashboardPreview}
                alt="Dashboard do ImobiFlow com indicadores de crescimento imobiliario"
                className="h-[300px] w-full object-cover md:h-[420px]"
                width={1280}
                height={1024}
              />
              <div className="border-t border-border p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  {reasons.map((reason) => (
                    <div key={reason} className="flex gap-2 text-sm leading-relaxed">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <a
                    href="/cadastro"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
                  >
                    Comecar avaliacao gratuita
                    <ArrowRight className="h-4 w-4" />
                  </a>
                  <a
                    href="/planos"
                    className="inline-flex items-center justify-center rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold transition hover:bg-accent"
                  >
                    Ver estrutura dos planos
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

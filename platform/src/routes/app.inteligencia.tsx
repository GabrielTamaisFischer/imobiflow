import { createFileRoute } from "@tanstack/react-router";
import { BrainCircuit, FileText, Loader2, MessageSquareText, RefreshCw, Send } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import {
  createAiRequest,
  getAiOverview,
  type AiFeature,
  type AiGenerationRequest,
  type AiOverview,
} from "@/product/ai";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/inteligencia")({
  component: AiPage,
});

const featureLabels: Record<AiFeature, string> = {
  property_description: "Descrição de imóvel",
  whatsapp_message: "Mensagem WhatsApp",
  inspection_summary: "Resumo de vistoria",
  lead_analysis: "Análise de lead",
  contract_summary: "Resumo de contrato",
  other: "Outro",
};

const featureDescriptions: Record<AiFeature, string> = {
  property_description: "Transforma dados reais do imóvel em texto comercial.",
  whatsapp_message: "Prepara mensagem usando objetivo e contexto informados.",
  inspection_summary: "Padroniza observações reais de vistoria.",
  lead_analysis: "Avalia sinais reais do atendimento e do histórico.",
  contract_summary: "Resume pontos operacionais de um contrato real.",
  other: "Registra uma solicitação manual para uso futuro.",
};

function AiPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("ai");
  const [overview, setOverview] = useState<AiOverview | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function refreshAi() {
    setIsAiLoading(true);
    setError(null);

    try {
      setOverview(await getAiOverview());
    } catch (aiError) {
      setError(aiError instanceof Error ? aiError.message : "Não foi possível carregar IA.");
    } finally {
      setIsAiLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const form = new FormData(event.currentTarget);
    const feature = String(form.get("feature")) as AiFeature;
    const inputText = String(form.get("input_text") || "").trim();
    const instructions = String(form.get("instructions") || "").trim();

    if (!inputText) {
      setError("Informe dados reais para registrar a solicitação de IA.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await createAiRequest({
        feature,
        entity_type: "manual",
        input_text: inputText,
        instructions,
      });

      setSuccess(response.message);
      event.currentTarget.reset();
      await refreshAi();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Não foi possível registrar a solicitação.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshAi();
    }
  }, [isLoading, session]);

  const usagePercent = useMemo(() => {
    const balance = overview?.balance;
    if (!balance || balance.monthly_limit <= 0) return 0;
    return Math.min(100, Math.round((balance.used_credits / balance.monthly_limit) * 100));
  }, [overview]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: a IA real ainda não chama provider externo. Solicitações ficam
          registradas para validar fluxo, créditos e histórico.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-600">
          {success}
        </div>
      ) : null}

      <section className="mb-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Nova solicitação de IA</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use somente dados reais. O sistema registra a solicitação e fica pronto para o provider
                real.
              </p>
            </div>
            <BrainCircuit className="h-5 w-5 text-primary" />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
            <label className="text-sm font-medium">
              Tipo
              <select
                name="feature"
                className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="property_description"
              >
                {Object.entries(featureLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium">
              Orientação opcional
              <input
                name="instructions"
                className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Ex.: tom profissional, curto para WhatsApp, linguagem técnica..."
              />
            </label>
          </div>

          <label className="mt-4 block text-sm font-medium">
            Dados reais de entrada
            <textarea
              name="input_text"
              rows={7}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Cole aqui os dados reais do imóvel, lead, vistoria ou contrato. A IA não deve inventar informações ausentes."
            />
          </label>

          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Registrar solicitação
            </Button>
          </div>
        </form>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Créditos do mês</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Controle por plano, preparado para cobrança e custo por tenant.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={refreshAi} disabled={isAiLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
            <div className="mt-5">
              <div className="flex items-end justify-between">
                <p className="text-3xl font-semibold">
                  {overview?.balance.used_credits ?? 0}
                  <span className="text-base text-muted-foreground">
                    /{overview?.balance.monthly_limit ?? 0}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">{usagePercent}% usado</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${usagePercent}%` }} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Templates ativos</h2>
            <div className="mt-3 space-y-2">
              {(overview?.templates ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum template ativo. Os templates padrão serão criados pela migration.
                </p>
              ) : (
                overview!.templates.slice(0, 4).map((template) => (
                  <div key={template.id} className="rounded-md border border-border bg-background p-3">
                    <p className="text-sm font-medium">{template.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {featureLabels[template.feature]} · {template.description}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>

      {isAiLoading ? (
        <section className="flex min-h-[260px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando histórico de IA...
        </section>
      ) : !overview || overview.requests.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          title="Nenhuma solicitação de IA registrada"
          description="A IA começa vazia. Quando houver dados reais de imóvel, lead, vistoria ou contrato, registre a primeira solicitação."
        />
      ) : (
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">Histórico de solicitações</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Toda chamada fica auditável por empresa, usuário, recurso e entidade relacionada.
            </p>
          </div>
          <div className="divide-y divide-border">
            {overview.requests.map((request) => (
              <AiRequestRow key={request.id} request={request} />
            ))}
          </div>
        </section>
      )}
    </ModulePage>
  );
}

function AiRequestRow({ request }: { request: AiGenerationRequest }) {
  const isMessage = request.feature === "whatsapp_message";
  const Icon = isMessage ? MessageSquareText : FileText;

  return (
    <article className="grid gap-3 p-4 md:grid-cols-[1fr_170px_150px] md:items-center">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {featureLabels[request.feature]}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {request.input_text || featureDescriptions[request.feature]}
        </p>
        {request.error_message ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Status técnico: {request.error_message}
          </p>
        ) : null}
      </div>
      <StatusBadge status={request.status} />
      <p className="text-sm text-muted-foreground md:text-right">
        {formatDateTime(request.created_at)}
      </p>
    </article>
  );
}

function StatusBadge({ status }: { status: AiGenerationRequest["status"] }) {
  const label: Record<AiGenerationRequest["status"], string> = {
    pending_provider: "Provider pendente",
    queued: "Na fila",
    processing: "Processando",
    completed: "Concluído",
    failed: "Falhou",
    cancelled: "Cancelado",
  };

  return (
    <span className="inline-flex w-fit rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
      {label[status]}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

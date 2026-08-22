import { createFileRoute } from "@tanstack/react-router";
import { Bell, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import {
  dispatchNotificationEvent,
  listNotificationEvents,
  queueNotificationEvent,
  registerManualNotificationDelivery,
  type NotificationEvent,
} from "@/product/notifications";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/notificacoes")({
  component: NotificationsPage,
});

const channelLabels = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  sms: "SMS",
  system: "Sistema",
};

const statusLabels = {
  draft: "Rascunho",
  prepared: "Preparado",
  queued: "Na fila",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  bounced: "Devolvida",
  blocked: "Bloqueada",
  cancelled: "Cancelado",
};

function NotificationsPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("notifications");
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  async function refreshEvents() {
    setIsEventsLoading(true);
    setError(null);

    try {
      const response = await listNotificationEvents(50);
      setEvents(response.events);
    } catch (eventsError) {
      setError(
        eventsError instanceof Error
          ? eventsError.message
          : "Não foi possível carregar notificações.",
      );
    } finally {
      setIsEventsLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshEvents();
    }
  }, [isLoading, session]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Metric label="Preparadas" value={countByStatus(events, "prepared")} />
        <Metric label="Na fila" value={countByStatus(events, "queued")} />
        <Metric
          label="Enviadas"
          value={countByStatus(events, "sent") + countByStatus(events, "delivered") + countByStatus(events, "read")}
        />
        <Metric
          label="Falhas"
          value={countByStatus(events, "failed") + countByStatus(events, "bounced") + countByStatus(events, "blocked")}
        />
      </div>

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: o histórico de notificações fica salvo apenas neste navegador.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isEventsLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando notificações...
        </section>
      ) : events.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nenhuma notificação registrada"
          description="O histórico começa vazio. Ao copiar ou abrir links dos portais, o ImobiFlow passa a registrar a preparação do contato."
        />
      ) : (
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">Histórico operacional</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Registro auditável de mensagens preparadas, enviadas e entregues.
            </p>
          </div>
          <div className="divide-y divide-border">
            {events.map((event) => (
              <NotificationRow
                key={event.id}
                event={event}
                isBusy={actionId === event.id}
                onEventChange={replaceEvent}
                onBusyChange={setActionId}
              />
            ))}
          </div>
        </section>
      )}
    </ModulePage>
  );

  function replaceEvent(nextEvent: NotificationEvent) {
    setEvents((currentEvents) =>
      currentEvents.map((event) => (event.id === nextEvent.id ? nextEvent : event)),
    );
  }
}

function NotificationRow({
  event,
  isBusy,
  onEventChange,
  onBusyChange,
}: {
  event: NotificationEvent;
  isBusy: boolean;
  onEventChange: (event: NotificationEvent) => void;
  onBusyChange: (eventId: string | null) => void;
}) {
  const Icon = event.channel === "email" ? Mail : event.channel === "whatsapp" ? MessageCircle : Send;
  const canQueue = ["draft", "prepared", "failed"].includes(event.status);
  const canDispatch = ["queued", "failed"].includes(event.status);
  const canRegisterManual = ["prepared", "queued", "failed"].includes(event.status);

  return (
    <article className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_160px_150px_260px] xl:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">
              {event.recipient_name || event.recipient_contact}
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {channelLabels[event.channel]}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{event.recipient_contact}</p>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.body}</p>
          {event.failure_reason ? (
            <p className="mt-2 text-xs text-destructive">Falha: {event.failure_reason}</p>
          ) : null}
        </div>
      </div>
      <span className="rounded-full border border-border px-3 py-1 text-center text-xs font-medium text-muted-foreground">
        {statusLabels[event.status]}
      </span>
      <div className="text-sm text-muted-foreground xl:text-right">
        <p>{formatDateTime(event.created_at)}</p>
        {event.attempt_count > 0 ? <p className="text-xs">Tentativas: {event.attempt_count}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 xl:justify-end">
        {canQueue ? (
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
            disabled={isBusy}
            onClick={() => runEventAction(event.id, onBusyChange, onEventChange, () => queueNotificationEvent(event.id))}
          >
            {isBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Fila
          </button>
        ) : null}
        {canDispatch ? (
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
            disabled={isBusy}
            onClick={() =>
              runEventAction(event.id, onBusyChange, onEventChange, async () => {
                const response = await dispatchNotificationEvent(event.id);
                return { event: response.event };
              })
            }
          >
            {isBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Enviar
          </button>
        ) : null}
        {canRegisterManual ? (
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            disabled={isBusy}
            onClick={() =>
              runEventAction(event.id, onBusyChange, onEventChange, () =>
                registerManualNotificationDelivery(event.id, { provider: "manual", status: "sent" }),
              )
            }
          >
            Manual
          </button>
        ) : null}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function countByStatus(events: NotificationEvent[], status: NotificationEvent["status"]) {
  return events.filter((event) => event.status === status).length;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function runEventAction(
  eventId: string,
  onBusyChange: (eventId: string | null) => void,
  onEventChange: (event: NotificationEvent) => void,
  action: () => Promise<{ event: NotificationEvent }>,
) {
  onBusyChange(eventId);

  try {
    const response = await action();
    onEventChange(response.event);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Nao foi possivel atualizar a notificacao.");
  } finally {
    onBusyChange(null);
  }
}

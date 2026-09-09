import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Check, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage } from "@/product/app-access";
import {
  appointmentStatusLabels,
  appointmentTypeLabels,
  cancelAppointment,
  completeAppointment,
  createAppointment,
  formatAppointmentDate,
  listAppointments,
  safeAppointmentError,
  toIsoDateTime,
  updateAppointment,
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
} from "@/product/appointments";
import { listCrmUsers, listLeads, type CrmUser, type Lead } from "@/product/crm";
import { listAllProperties, type PropertySummary } from "@/product/real-estate";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/agenda")({ component: AgendaPage });
const statusOptions: Array<AppointmentStatus | "all"> = [
  "all",
  "scheduled",
  "completed",
  "cancelled",
];
const statusLabels: Record<AppointmentStatus | "all", string> = {
  all: "Todos",
  ...appointmentStatusLabels,
};

function AgendaPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("agenda");
  const user = session?.access.appUser;
  const canEdit = canManage(user, "appointments.manage");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [status, setStatus] = useState<AppointmentStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appointmentResponse, leadResponse, propertyResponse, userResponse] = await Promise.all(
        [
          listAppointments({ status, from: toIsoDateTime(from), to: toIsoDateTime(to) }),
          listLeads({ page_size: 100 }),
          listAllProperties({ status: "not_archived" }),
          listCrmUsers(),
        ],
      );
      setAppointments(appointmentResponse.appointments);
      setLeads(leadResponse.leads);
      setProperties(propertyResponse.properties);
      setUsers(userResponse.users.filter((item) => item.status === "active"));
    } catch (loadError) {
      setError(getSafeApiErrorMessage(loadError, "Não foi possível carregar a agenda."));
    } finally {
      setLoading(false);
    }
  }, [from, status, to]);
  useEffect(() => {
    if (!isLoading && session) void loadData();
  }, [isLoading, loadData, session]);
  const visibleAppointments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return appointments;
    return appointments.filter((appointment) =>
      [
        appointment.title,
        appointment.lead?.name,
        appointment.property?.title,
        appointment.assignee?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    );
  }, [appointments, search]);

  async function transition(appointment: Appointment, action: "cancel" | "complete") {
    setRunning(`${action}:${appointment.id}`);
    setError(null);
    try {
      const response =
        action === "cancel"
          ? await cancelAppointment(appointment.id, appointment.version)
          : await completeAppointment(appointment.id, appointment.version);
      setAppointments((current) =>
        current.map((item) => (item.id === appointment.id ? response.appointment : item)),
      );
      setNotice(action === "cancel" ? "Agendamento cancelado." : "Agendamento concluído.");
    } catch (actionError) {
      setError(safeAppointmentError(actionError, "Não foi possível atualizar o agendamento."));
      if ((actionError as { status?: number }).status === 409) void loadData();
    } finally {
      setRunning(null);
    }
  }
  async function saveAppointment(input: AppointmentFormValues) {
    setRunning("save");
    setError(null);
    try {
      if (editing) {
        const response = await updateAppointment(editing.id, editing.version, {
          assigned_to: input.assigned_to,
          title: input.title,
          description: input.description || null,
          location_text: input.location_text || null,
          starts_at: toIsoDateTime(input.starts_at),
          ends_at: toIsoDateTime(input.ends_at),
        });
        setAppointments((current) =>
          current.map((item) => (item.id === editing.id ? response.appointment : item)),
        );
        setNotice("Agendamento remarcado.");
      } else {
        const response = await createAppointment({
          lead_id: input.lead_id,
          property_id: input.property_id,
          assigned_to: input.assigned_to,
          appointment_type: input.appointment_type,
          title: input.title,
          description: input.description || null,
          location_text: input.location_text || null,
          starts_at: toIsoDateTime(input.starts_at) ?? "",
          ends_at: toIsoDateTime(input.ends_at),
        });
        setAppointments((current) => [response.appointment, ...current]);
        setNotice("Agendamento criado.");
      }
      setFormOpen(false);
      setEditing(null);
    } catch (saveError) {
      setError(safeAppointmentError(saveError, "Não foi possível salvar o agendamento."));
      if ((saveError as { status?: number }).status === 409) void loadData();
    } finally {
      setRunning(null);
    }
  }
  if (isLoading)
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  return (
    <ModulePage session={session} module={module}>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Agendamentos persistidos no banco da empresa e protegidos pelo escopo de acesso.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Horários exibidos no fuso local do navegador.
            </p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo agendamento
            </Button>
          ) : null}
        </header>
        <section className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-5">
          <label className="text-sm">
            Status
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-3"
              value={status}
              onChange={(event) => setStatus(event.target.value as AppointmentStatus | "all")}
            >
              <option value="all">Todos</option>
              {statusOptions.slice(1).map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            A partir de
            <Input
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Até
            <Input
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label className="text-sm md:col-span-2">
            Buscar
            <Input
              placeholder="Título, lead, imóvel ou responsável"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="md:col-span-5 sm:w-fit"
            onClick={() => void loadData()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar
          </Button>
        </section>
        {notice ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}
        {formOpen ? (
          <AppointmentForm
            editing={editing}
            leads={leads}
            properties={properties}
            users={users}
            busy={running === "save"}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
            onSubmit={saveAppointment}
          />
        ) : null}
        {loading ? (
          <div className="flex min-h-48 items-center justify-center rounded-lg border text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando agendamentos...
          </div>
        ) : visibleAppointments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">Nenhum agendamento encontrado</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste os filtros ou crie o primeiro agendamento.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleAppointments.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                canEdit={canEdit}
                running={running}
                onEdit={() => {
                  setEditing(appointment);
                  setFormOpen(true);
                }}
                onCancel={() => void transition(appointment, "cancel")}
                onComplete={() => void transition(appointment, "complete")}
              />
            ))}
          </div>
        )}
      </div>
    </ModulePage>
  );
}

type AppointmentFormValues = {
  lead_id: string;
  property_id: string;
  assigned_to: string;
  appointment_type: AppointmentType;
  title: string;
  description: string;
  location_text: string;
  starts_at: string;
  ends_at: string;
};
function AppointmentForm({
  editing,
  leads,
  properties,
  users,
  busy,
  onCancel,
  onSubmit,
}: {
  editing: Appointment | null;
  leads: Lead[];
  properties: PropertySummary[];
  users: CrmUser[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: AppointmentFormValues) => Promise<void>;
}) {
  const localDate = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const [values, setValues] = useState<AppointmentFormValues>(() => ({
    lead_id: editing?.lead_id ?? leads[0]?.id ?? "",
    property_id: editing?.property_id ?? properties[0]?.id ?? "",
    assigned_to: editing?.assigned_to ?? users[0]?.id ?? "",
    appointment_type: editing?.appointment_type ?? "visit",
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    location_text: editing?.location_text ?? "",
    starts_at: localDate(editing?.starts_at),
    ends_at: localDate(editing?.ends_at),
  }));
  function update<K extends keyof AppointmentFormValues>(key: K, value: AppointmentFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void onSubmit(values);
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{editing ? "Remarcar agendamento" : "Novo agendamento"}</h2>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Lead
          <select
            required
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={values.lead_id}
            onChange={(event) => update("lead_id", event.target.value)}
          >
            <option value="">Selecione</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Imóvel
          <select
            required
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={values.property_id}
            onChange={(event) => update("property_id", event.target.value)}
          >
            <option value="">Selecione</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.code ? `${property.code} — ` : ""}
                {property.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Responsável
          <select
            required
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={values.assigned_to}
            onChange={(event) => update("assigned_to", event.target.value)}
          >
            <option value="">Selecione</option>
            {users.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.role}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Tipo
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={values.appointment_type}
            onChange={(event) => update("appointment_type", event.target.value as AppointmentType)}
          >
            {(Object.keys(appointmentTypeLabels) as AppointmentType[]).map((item) => (
              <option key={item} value={item}>
                {appointmentTypeLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Título
          <Input
            required
            minLength={2}
            maxLength={180}
            value={values.title}
            onChange={(event) => update("title", event.target.value)}
          />
        </label>
        <label className="text-sm">
          Início
          <Input
            required
            type="datetime-local"
            value={values.starts_at}
            onChange={(event) => update("starts_at", event.target.value)}
          />
        </label>
        <label className="text-sm">
          Fim
          <Input
            type="datetime-local"
            value={values.ends_at}
            onChange={(event) => update("ends_at", event.target.value)}
          />
        </label>
        <label className="text-sm">
          Local
          <Input
            maxLength={300}
            value={values.location_text}
            onChange={(event) => update("location_text", event.target.value)}
          />
        </label>
        <label className="text-sm">
          Descrição
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            maxLength={1000}
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={busy || !values.lead_id || !values.property_id || !values.assigned_to}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {editing ? "Salvar remarcação" : "Criar agendamento"}
        </Button>
      </div>
    </form>
  );
}

function AppointmentCard({
  appointment,
  canEdit,
  running,
  onEdit,
  onCancel,
  onComplete,
}: {
  appointment: Appointment;
  canEdit: boolean;
  running: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const terminal = appointment.status !== "scheduled";
  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">
              {appointmentStatusLabels[appointment.status]}
            </span>
            <span className="text-xs text-muted-foreground">v{appointment.version}</span>
          </div>
          <h2 className="mt-2 text-lg font-semibold">{appointment.title}</h2>
          <p className="text-sm text-muted-foreground">
            {appointmentTypeLabels[appointment.appointment_type]} ·{" "}
            {formatAppointmentDate(appointment.starts_at)}
          </p>
        </div>
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Lead</dt>
          <dd>{appointment.lead?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Imóvel</dt>
          <dd>{appointment.property?.code ?? appointment.property?.title ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Responsável</dt>
          <dd>{appointment.assignee?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Local</dt>
          <dd>{appointment.location_text ?? "Não informado"}</dd>
        </div>
      </dl>
      {appointment.description ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {appointment.description}
        </p>
      ) : null}
      {canEdit && !terminal ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={Boolean(running)}
          >
            Remarcar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onComplete}
            disabled={Boolean(running)}
          >
            {running === `complete:${appointment.id}` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}{" "}
            Concluir
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onCancel}
            disabled={Boolean(running)}
          >
            {running === `cancel:${appointment.id}` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}{" "}
            Cancelar
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          {terminal
            ? "Este agendamento está encerrado e não pode ser alterado."
            : "Você possui acesso somente para consulta."}
        </p>
      )}
    </article>
  );
}

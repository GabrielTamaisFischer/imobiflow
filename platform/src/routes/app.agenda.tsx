import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Home,
  Loader2,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  User2,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage } from "@/product/app-access";
import {
  appointmentStatusFlowByType,
  appointmentTypeLabels,
  cancelAppointment,
  changeAppointmentStatus,
  completeAppointment,
  createAppointment,
  getAppointmentStatusLabel,
  listAppointments,
  safeAppointmentError,
  toIsoDateTime,
  updateAppointment,
  type Appointment,
  type AppointmentInput,
  type AppointmentStatus,
  type AppointmentType,
} from "@/product/appointments";
import { listCrmUsers, listLeads, type CrmUser, type Lead } from "@/product/crm";
import { listAllProperties, type PropertySummary } from "@/product/real-estate";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/agenda")({ component: AgendaPage });

// ---------------------------------------------------------------------------
// Constantes de calendário
// ---------------------------------------------------------------------------

type ViewMode = "day" | "week" | "month" | "year" | "schedule";

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const ROW_HEIGHT_PX = 48;

type TypeStyle = { bg: string; border: string; text: string; icon: typeof Home };

const TYPE_STYLES: Record<AppointmentType, TypeStyle> = {
  visit: { bg: "bg-blue-100 dark:bg-blue-950/60", border: "border-blue-400", text: "text-blue-900 dark:text-blue-100", icon: Home },
  return: { bg: "bg-purple-100 dark:bg-purple-950/60", border: "border-purple-400", text: "text-purple-900 dark:text-purple-100", icon: CalendarClock },
  meeting: { bg: "bg-emerald-100 dark:bg-emerald-950/60", border: "border-emerald-400", text: "text-emerald-900 dark:text-emerald-100", icon: UsersIcon },
  inspection: { bg: "bg-rose-100 dark:bg-rose-950/60", border: "border-rose-400", text: "text-rose-900 dark:text-rose-100", icon: CalendarCheck },
  signature: { bg: "bg-indigo-100 dark:bg-indigo-950/60", border: "border-indigo-400", text: "text-indigo-900 dark:text-indigo-100", icon: CalendarCheck },
  follow_up: { bg: "bg-teal-100 dark:bg-teal-950/60", border: "border-teal-400", text: "text-teal-900 dark:text-teal-100", icon: CalendarClock },
  event: { bg: "bg-fuchsia-100 dark:bg-fuchsia-950/60", border: "border-fuchsia-400", text: "text-fuchsia-900 dark:text-fuchsia-100", icon: CalendarDays },
  task: { bg: "bg-amber-100 dark:bg-amber-950/60", border: "border-amber-400", text: "text-amber-900 dark:text-amber-100", icon: CheckSquare },
};

// Grupos de filtro da barra lateral ("Minhas agendas" / "Outras agendas").
type AgendaFilterKey = "mine" | "visits" | "tasks" | "events" | "brokers" | "shared";
const AGENDA_FILTER_TYPES: Record<AgendaFilterKey, AppointmentType[]> = {
  mine: [],
  visits: ["visit", "return", "inspection"],
  tasks: ["task", "follow_up"],
  events: ["meeting", "event", "signature"],
  brokers: [],
  shared: [],
};

function capitalize(value: string) {
  return value.length ? value[0].toLocaleUpperCase("pt-BR") + value.slice(1) : value;
}
function pad2(value: number) {
  return String(value).padStart(2, "0");
}
function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}
function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}
function addMonths(date: Date, amount: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + amount);
  return result;
}
function addYears(date: Date, amount: number) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + amount);
  return result;
}
function startOfWeek(date: Date) {
  const result = startOfDay(date);
  const weekday = (result.getDay() + 6) % 7; // segunda = 0
  return addDays(result, -weekday);
}
function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(date: Date) {
  return isSameDay(date, new Date());
}
function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function formatDateTimeLocal(date: Date) {
  return `${formatDateInput(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
function minutesSinceMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

// ---------------------------------------------------------------------------
// Layout de eventos simultâneos (colunas lado a lado, como no Google Calendar)
// ---------------------------------------------------------------------------

type PositionedAppointment = {
  appointment: Appointment;
  start: Date;
  end: Date;
  col: number;
  totalCols: number;
};

function layoutDayAppointments(appointments: Appointment[], day: Date): PositionedAppointment[] {
  const items = appointments
    .filter((item) => isSameDay(new Date(item.starts_at), day))
    .map((item) => ({ appointment: item, start: new Date(item.starts_at), end: new Date(item.ends_at) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const result: PositionedAppointment[] = [];
  let cluster: Array<{ appointment: Appointment; start: Date; end: Date; col: number }> = [];
  let clusterEnd = -Infinity;
  let columnEnds: number[] = [];

  const flush = () => {
    if (!cluster.length) return;
    const totalCols = Math.max(...cluster.map((item) => item.col)) + 1;
    for (const item of cluster) result.push({ ...item, totalCols });
    cluster = [];
  };

  for (const item of items) {
    const start = item.start.getTime();
    const end = Math.max(item.end.getTime(), start + 15 * 60 * 1000);
    if (start >= clusterEnd) {
      flush();
      columnEnds = [];
      clusterEnd = -Infinity;
    }
    let col = columnEnds.findIndex((endTime) => endTime <= start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[col] = end;
    }
    cluster.push({ ...item, col });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

type TaskPriority = "low" | "normal" | "high";

type FormValues = {
  appointment_type: AppointmentType;
  title: string;
  description: string;
  location_text: string;
  lead_id: string;
  property_id: string;
  assigned_to: string;
  starts_at: string;
  ends_at: string;
  // Guardados em `metadata` (sem exigir migration): dia inteiro para Evento/Visita,
  // prioridade para Tarefa.
  all_day: boolean;
  priority: TaskPriority;
};

const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { low: "Baixa", normal: "Normal", high: "Alta" };

function emptyFormValues(type: AppointmentType, start: Date, currentUserId: string | null): FormValues {
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    appointment_type: type,
    title: "",
    description: "",
    location_text: "",
    lead_id: "",
    property_id: "",
    assigned_to: currentUserId ?? "",
    starts_at: formatDateTimeLocal(start),
    ends_at: formatDateTimeLocal(end),
    all_day: false,
    priority: "normal",
  };
}

function formValuesFromAppointment(appointment: Appointment): FormValues {
  const metadata = (appointment.metadata ?? {}) as { all_day?: boolean; priority?: TaskPriority };
  return {
    appointment_type: appointment.appointment_type,
    title: appointment.title,
    description: appointment.description ?? "",
    location_text: appointment.location_text ?? "",
    lead_id: appointment.lead_id ?? "",
    property_id: appointment.property_id ?? "",
    assigned_to: appointment.assigned_to,
    starts_at: formatDateTimeLocal(new Date(appointment.starts_at)),
    ends_at: formatDateTimeLocal(new Date(appointment.ends_at)),
    all_day: Boolean(metadata.all_day),
    priority: metadata.priority ?? "normal",
  };
}

function AgendaPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("agenda");
  const user = session?.access.appUser;
  const canEdit = canManage(user, "appointments.manage");

  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Record<AgendaFilterKey, boolean>>({
    mine: true,
    visits: true,
    tasks: true,
    events: true,
    brokers: true,
    shared: true,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formValues, setFormValues] = useState<FormValues | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Intervalo visível conforme o modo de visualização (controla o que é buscado)
  // -------------------------------------------------------------------------
  const range = useMemo(() => {
    if (view === "day") return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1) };
    if (view === "week") {
      const start = startOfWeek(anchor);
      return { from: start, to: addDays(start, 7) };
    }
    if (view === "year") {
      return { from: new Date(anchor.getFullYear(), 0, 1), to: new Date(anchor.getFullYear() + 1, 0, 1) };
    }
    if (view === "schedule") return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 30) };
    // month: inclui semanas parciais do mês anterior/seguinte exibidas na grade
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    return { from: startOfWeek(monthStart), to: addDays(startOfWeek(addDays(monthEnd, 7)), 0) };
  }, [anchor, view]);

  const activeTypes = useMemo(() => {
    const types = new Set<AppointmentType>();
    (Object.keys(activeFilters) as AgendaFilterKey[]).forEach((key) => {
      if (activeFilters[key]) AGENDA_FILTER_TYPES[key].forEach((type) => types.add(type));
    });
    // "mine" e "brokers"/"shared" não restringem tipo, apenas responsável — se nenhum filtro de
    // categoria estiver ativo, não aplicamos filtro de tipo (mostra tudo) em vez de esconder tudo.
    const anyCategoryActive = activeFilters.visits || activeFilters.tasks || activeFilters.events;
    return anyCategoryActive ? types : null;
  }, [activeFilters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appointmentResponse, leadResponse, propertyResponse, userResponse] = await Promise.all([
        listAppointments({
          from: toIsoDateTime(formatDateTimeLocal(range.from)),
          to: toIsoDateTime(formatDateTimeLocal(range.to)),
        }),
        listLeads({ page_size: 100 }),
        listAllProperties({ status: "not_archived" }),
        listCrmUsers(),
      ]);
      setAppointments(appointmentResponse.appointments);
      setLeads(leadResponse.leads);
      setProperties(propertyResponse.properties);
      setUsers(userResponse.users.filter((item) => item.status === "active"));
    } catch (loadError) {
      setError(getSafeApiErrorMessage(loadError, "Não foi possível carregar a agenda."));
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    if (!isLoading && session) void loadData();
  }, [isLoading, loadData, session]);

  const visibleAppointments = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("pt-BR");
    return appointments.filter((appointment) => {
      if (activeTypes && !activeTypes.has(appointment.appointment_type)) return false;
      if (selectedPersonId && appointment.assigned_to !== selectedPersonId) return false;
      if (!query) return true;
      return [
        appointment.title,
        appointment.lead?.name,
        appointment.property?.title,
        appointment.property?.code,
        appointment.assignee?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query);
    });
  }, [appointments, activeTypes, selectedPersonId, searchQuery]);

  const peopleResults = useMemo(() => {
    const query = peopleQuery.trim().toLocaleLowerCase("pt-BR");
    if (!query) return [];
    return users.filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(query)).slice(0, 8);
  }, [peopleQuery, users]);

  const selectedAppointment = useMemo(
    () => appointments.find((item) => item.id === selectedId) ?? null,
    [appointments, selectedId],
  );

  // -------------------------------------------------------------------------
  // Navegação de datas
  // -------------------------------------------------------------------------
  function goToday() {
    setAnchor(startOfDay(new Date()));
  }
  function goPrev() {
    if (view === "day") setAnchor((current) => addDays(current, -1));
    else if (view === "week") setAnchor((current) => addDays(current, -7));
    else if (view === "year") setAnchor((current) => addYears(current, -1));
    else setAnchor((current) => addMonths(current, -1));
  }
  function goNext() {
    if (view === "day") setAnchor((current) => addDays(current, 1));
    else if (view === "week") setAnchor((current) => addDays(current, 7));
    else if (view === "year") setAnchor((current) => addYears(current, 1));
    else setAnchor((current) => addMonths(current, 1));
  }

  const rangeTitle = useMemo(() => {
    if (view === "day") return `${anchor.getDate()} de ${MONTH_NAMES[anchor.getMonth()]} de ${anchor.getFullYear()}`;
    if (view === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} – ${end.getDate()} de ${MONTH_NAMES[start.getMonth()]} de ${start.getFullYear()}`;
      }
      return `${start.getDate()} de ${MONTH_NAMES[start.getMonth()]} – ${end.getDate()} de ${MONTH_NAMES[end.getMonth()]} de ${end.getFullYear()}`;
    }
    if (view === "year") return `${anchor.getFullYear()}`;
    if (view === "schedule") return `A partir de ${anchor.getDate()} de ${MONTH_NAMES[anchor.getMonth()]}`;
    return `${MONTH_NAMES[anchor.getMonth()]} de ${anchor.getFullYear()}`;
  }, [anchor, view]);

  // -------------------------------------------------------------------------
  // Ações de criação / edição / transição de status
  // -------------------------------------------------------------------------
  function openCreateForm(type: AppointmentType, start: Date) {
    setEditingId(null);
    setFormValues(emptyFormValues(type, start, user?.id ?? null));
    setFormOpen(true);
    setCreateMenuOpen(false);
  }
  function openEditForm(appointment: Appointment) {
    setEditingId(appointment.id);
    setFormValues(formValuesFromAppointment(appointment));
    setFormOpen(true);
    setSelectedId(null);
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!formValues) return;
    setRunning("save");
    setError(null);
    try {
      const metadata: Record<string, unknown> = { all_day: formValues.all_day };
      if (formValues.appointment_type === "task") metadata.priority = formValues.priority;

      if (editingId) {
        const response = await updateAppointment(editingId, selectedAppointment?.version ?? 1, {
          assigned_to: formValues.assigned_to,
          title: formValues.title,
          description: formValues.description || null,
          location_text: formValues.location_text || null,
          starts_at: toIsoDateTime(formValues.starts_at),
          ends_at: toIsoDateTime(formValues.ends_at),
          metadata,
        });
        setAppointments((current) => current.map((item) => (item.id === editingId ? response.appointment : item)));
        setNotice("Compromisso atualizado.");
      } else {
        const input: AppointmentInput = {
          appointment_type: formValues.appointment_type,
          title: formValues.title,
          description: formValues.description || null,
          location_text: formValues.location_text || null,
          lead_id: formValues.lead_id || null,
          property_id: formValues.property_id || null,
          assigned_to: formValues.assigned_to,
          starts_at: toIsoDateTime(formValues.starts_at) ?? "",
          ends_at: toIsoDateTime(formValues.ends_at),
          metadata,
        };
        const response = await createAppointment(input);
        setAppointments((current) => [response.appointment, ...current]);
        setNotice("Compromisso criado.");
      }
      setFormOpen(false);
      setFormValues(null);
      setEditingId(null);
    } catch (saveError) {
      setError(safeAppointmentError(saveError, "Não foi possível salvar o compromisso."));
      if ((saveError as { status?: number }).status === 409) void loadData();
    } finally {
      setRunning(null);
    }
  }

  async function applyStatus(appointment: Appointment, status: AppointmentStatus) {
    setRunning(`status:${appointment.id}`);
    setError(null);
    try {
      const response =
        status === "cancelled"
          ? await cancelAppointment(appointment.id, appointment.version)
          : status === "completed"
            ? await completeAppointment(appointment.id, appointment.version)
            : await changeAppointmentStatus(appointment.id, appointment.version, status);
      setAppointments((current) => current.map((item) => (item.id === appointment.id ? response.appointment : item)));
      setNotice(`Status atualizado para "${getAppointmentStatusLabel(appointment.appointment_type, status)}".`);
    } catch (actionError) {
      setError(safeAppointmentError(actionError, "Não foi possível atualizar o status."));
      if ((actionError as { status?: number }).status === 409) void loadData();
    } finally {
      setRunning(null);
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module} fullBleed hideHeader>
      <div className="flex h-[calc(100vh-2rem)] flex-col gap-3 p-4">
        <AgendaHeader
          rangeTitle={capitalize(rangeTitle)}
          view={view}
          onView={setView}
          onToday={goToday}
          onPrev={goPrev}
          onNext={goNext}
          searchQuery={searchQuery}
          onSearchQuery={setSearchQuery}
          canEdit={canEdit}
          onCreate={() => setCreateMenuOpen((value) => !value)}
          createMenuOpen={createMenuOpen}
          onCreateType={(type) => openCreateForm(type, view === "day" ? anchor : new Date())}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((value) => !value)}
        />

        {error ? (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {notice}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 gap-3">
          {sidebarOpen ? (
            <AgendaSidebar
              anchor={anchor}
              onAnchorChange={setAnchor}
              appointments={appointments}
              onCreateType={(type) => openCreateForm(type, anchor)}
              peopleQuery={peopleQuery}
              onPeopleQuery={setPeopleQuery}
              peopleResults={peopleResults}
              selectedPersonId={selectedPersonId}
              onSelectPerson={setSelectedPersonId}
              activeFilters={activeFilters}
              onToggleFilter={(key) =>
                setActiveFilters((current) => ({ ...current, [key]: !current[key] }))
              }
            />
          ) : null}

          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-card">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando agenda...
              </div>
            ) : view === "day" ? (
              <TimeGridView
                days={[anchor]}
                appointments={visibleAppointments}
                onSelect={setSelectedId}
                onCreateAt={(start) => openCreateForm("event", start)}
              />
            ) : view === "week" ? (
              <TimeGridView
                days={Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchor), index))}
                appointments={visibleAppointments}
                onSelect={setSelectedId}
                onCreateAt={(start) => openCreateForm("event", start)}
              />
            ) : view === "month" ? (
              <MonthView
                anchor={anchor}
                appointments={visibleAppointments}
                onSelect={setSelectedId}
                onOpenDay={(day) => {
                  setAnchor(day);
                  setView("day");
                }}
              />
            ) : view === "schedule" ? (
              <ScheduleView appointments={visibleAppointments} onSelect={setSelectedId} />
            ) : (
              <YearView
                anchor={anchor}
                appointments={visibleAppointments}
                onOpenMonth={(month) => {
                  setAnchor(month);
                  setView("month");
                }}
                onOpenDay={(day) => {
                  setAnchor(day);
                  setView("day");
                }}
              />
            )}
          </div>
        </div>
      </div>

      <AppointmentDetailSheet
        appointment={selectedAppointment}
        properties={properties}
        leads={leads}
        canEdit={canEdit}
        running={running}
        onClose={() => setSelectedId(null)}
        onEdit={openEditForm}
        onStatus={applyStatus}
      />

      <AppointmentFormSheet
        open={formOpen}
        editing={Boolean(editingId)}
        values={formValues}
        onChange={setFormValues}
        onCancel={() => {
          setFormOpen(false);
          setFormValues(null);
          setEditingId(null);
        }}
        onSubmit={submitForm}
        busy={running === "save"}
        leads={leads}
        properties={properties}
        users={users}
      />
    </ModulePage>
  );
}

// ---------------------------------------------------------------------------
// Cabeçalho
// ---------------------------------------------------------------------------

const VIEW_TABS: Array<{ key: ViewMode; label: string }> = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
  { key: "year", label: "Ano" },
  { key: "schedule", label: "Programação" },
];

function AgendaHeader(props: {
  rangeTitle: string;
  view: ViewMode;
  onView: (view: ViewMode) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  searchQuery: string;
  onSearchQuery: (value: string) => void;
  canEdit: boolean;
  onCreate: () => void;
  createMenuOpen: boolean;
  onCreateType: (type: AppointmentType) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="flex flex-col gap-3 border-b pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="icon" onClick={props.onToggleSidebar} title="Mostrar/ocultar barra lateral">
          {props.sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </Button>
        <CalendarDays className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">Agenda</h1>
          <p className="text-xs text-muted-foreground">Visitas, reuniões, vistorias, retornos e lembretes internos.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {props.canEdit ? (
            <div className="relative">
              <Button type="button" onClick={props.onCreate} className="gap-1">
                <Plus className="h-4 w-4" /> Novo agendamento
              </Button>
              {props.createMenuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border bg-popover p-1 shadow-md">
                  {(
                    [
                      ["event", "Evento"],
                      ["visit", "Visita a imóvel"],
                      ["task", "Tarefa"],
                    ] as Array<[AppointmentType, string]>
                  ).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => props.onCreateType(type)}
                    >
                      <TYPE_STYLES_ICON type={type} /> {label}
                    </button>
                  ))}
                  <div className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground">
                    <CalendarClock className="h-4 w-4" /> Agendamento com reserva
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px]">Em breve</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={props.onToday}>
          Hoje
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={props.onPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={props.onNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="min-w-0 truncate text-sm font-medium">{props.rangeTitle}</span>

        <div className="ml-auto flex items-center gap-2">
          <Tabs value={props.view} onValueChange={(value) => props.onView(value as ViewMode)}>
            <TabsList>
              {VIEW_TABS.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={props.searchQuery}
              onChange={(event) => props.onSearchQuery(event.target.value)}
              placeholder="Buscar"
              className="h-8 w-40 pl-7 text-sm"
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </Button>
        </div>
      </div>
    </header>
  );
}

function TYPE_STYLES_ICON({ type }: { type: AppointmentType }) {
  const Icon = TYPE_STYLES[type].icon;
  return <Icon className="h-4 w-4" />;
}

// ---------------------------------------------------------------------------
// Barra lateral (minicalendário, criar, pesquisar pessoas, filtros de agenda)
// ---------------------------------------------------------------------------

function AgendaSidebar(props: {
  anchor: Date;
  onAnchorChange: (date: Date) => void;
  appointments: Appointment[];
  onCreateType: (type: AppointmentType) => void;
  peopleQuery: string;
  onPeopleQuery: (value: string) => void;
  peopleResults: CrmUser[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string | null) => void;
  activeFilters: Record<AgendaFilterKey, boolean>;
  onToggleFilter: (key: AgendaFilterKey) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [miniMonth, setMiniMonth] = useState<Date>(() => startOfMonth(props.anchor));

  useEffect(() => {
    setMiniMonth(startOfMonth(props.anchor));
  }, [props.anchor]);

  const miniDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(miniMonth));
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [miniMonth]);

  const daysWithAppointments = useMemo(() => {
    const set = new Set<string>();
    for (const appointment of props.appointments) {
      set.add(formatDateInput(new Date(appointment.starts_at)));
    }
    return set;
  }, [props.appointments]);

  const selectedPerson = props.peopleResults.find((item) => item.id === props.selectedPersonId) ?? null;

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto rounded-lg border bg-card p-3">
      <div className="relative">
        <Button type="button" className="w-full justify-start gap-2" onClick={() => setCreateOpen((value) => !value)}>
          <Plus className="h-4 w-4" /> Criar
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        </Button>
        {createOpen ? (
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
            {(
              [
                ["event", "Evento"],
                ["visit", "Visita a imóvel"],
                ["task", "Tarefa"],
              ] as Array<[AppointmentType, string]>
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  props.onCreateType(type);
                  setCreateOpen(false);
                }}
              >
                <TYPE_STYLES_ICON type={type} /> {label}
              </button>
            ))}
            <div className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> Agendamento com reserva
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px]">Em breve</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Minicalendário */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium">
            {capitalize(MONTH_NAMES[miniMonth.getMonth()])} de {miniMonth.getFullYear()}
          </span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMiniMonth((current) => addMonths(current, -1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMiniMonth((current) => addMonths(current, 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
          {WEEKDAY_SHORT.map((day) => (
            <span key={day}>{day.slice(0, 1)}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
          {miniDays.map((day) => {
            const inMonth = day.getMonth() === miniMonth.getMonth();
            const selected = isSameDay(day, props.anchor);
            const hasEvents = daysWithAppointments.has(formatDateInput(day));
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => props.onAnchorChange(startOfDay(day))}
                className={[
                  "relative flex h-7 w-7 items-center justify-center rounded-full",
                  inMonth ? "text-foreground" : "text-muted-foreground/50",
                  selected ? "bg-primary text-primary-foreground" : isToday(day) ? "border border-primary text-primary" : "hover:bg-accent",
                ].join(" ")}
              >
                {day.getDate()}
                {hasEvents && !selected ? (
                  <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pesquisar pessoas */}
      <div>
        <Label className="mb-1 block text-xs text-muted-foreground">Pesquisar pessoas</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={props.peopleQuery}
            onChange={(event) => props.onPeopleQuery(event.target.value)}
            placeholder="Nome do corretor"
            className="h-8 pl-7 text-sm"
          />
        </div>
        {props.peopleQuery && props.peopleResults.length ? (
          <div className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover p-1 shadow-sm">
            {props.peopleResults.map((person) => (
              <button
                key={person.id}
                type="button"
                className={[
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-accent",
                  person.id === props.selectedPersonId ? "bg-accent" : "",
                ].join(" ")}
                onClick={() => props.onSelectPerson(person.id === props.selectedPersonId ? null : person.id)}
              >
                <User2 className="h-3.5 w-3.5 text-muted-foreground" /> {person.name}
              </button>
            ))}
          </div>
        ) : null}
        {selectedPerson ? (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-accent/50 px-2 py-1 text-xs">
            <span className="truncate">Filtrando por {selectedPerson.name}</span>
            <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => props.onSelectPerson(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Minhas agendas */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Minhas agendas</p>
        <div className="flex flex-col gap-1.5">
          {(
            [
              ["mine", "Minha agenda"],
              ["visits", "Visitas a imóveis"],
              ["tasks", "Tarefas"],
              ["events", "Reuniões e eventos"],
            ] as Array<[AgendaFilterKey, string]>
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox checked={props.activeFilters[key]} onCheckedChange={() => props.onToggleFilter(key)} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Outras agendas */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Outras agendas</p>
        <div className="flex flex-col gap-1.5">
          {(
            [
              ["brokers", "Corretores da imobiliária"],
              ["shared", "Agenda compartilhada"],
            ] as Array<[AgendaFilterKey, string]>
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox checked={props.activeFilters[key]} onCheckedChange={() => props.onToggleFilter(key)} />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={false} disabled />
            Horários reservados
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px]">Em breve</span>
          </label>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Grade de horas (Dia / Semana)
// ---------------------------------------------------------------------------

function TimeGridView(props: {
  days: Date[];
  appointments: Appointment[];
  onSelect: (id: string) => void;
  onCreateAt: (start: Date) => void;
}) {
  const isAllDay = (appointment: Appointment) => Boolean((appointment.metadata as { all_day?: boolean } | undefined)?.all_day);
  const allDayByDay = props.days.map((day) =>
    props.appointments.filter((item) => isAllDay(item) && isSameDay(new Date(item.starts_at), day)),
  );
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Cabeçalho dos dias */}
      <div className="flex border-b" style={{ paddingLeft: 56 }}>
        {props.days.map((day) => (
          <div key={day.toISOString()} className="flex-1 border-l px-2 py-1 text-center text-xs">
            <div className="text-muted-foreground">{WEEKDAY_SHORT[day.getDay()]}</div>
            <div
              className={[
                "mx-auto flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium",
                isToday(day) ? "bg-primary text-primary-foreground" : "",
              ].join(" ")}
            >
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* Faixa de eventos de dia inteiro */}
      {hasAllDay ? (
        <div className="flex border-b" style={{ paddingLeft: 56 }}>
          {allDayByDay.map((list, index) => (
            <div key={props.days[index].toISOString()} className="flex-1 space-y-0.5 border-l px-1 py-1">
              {list.map((appointment) => {
                const style = TYPE_STYLES[appointment.appointment_type];
                return (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => props.onSelect(appointment.id)}
                    className={["w-full truncate rounded px-1.5 py-0.5 text-left text-xs", style.bg, style.border, style.text, "border"].join(" ")}
                  >
                    {appointment.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {/* Grade com rolagem */}
      <div className="relative flex-1 overflow-y-auto">
        <div className="flex" style={{ height: HOURS.length * ROW_HEIGHT_PX }}>
          <div className="w-14 shrink-0">
            {HOURS.map((hour) => (
              <div key={hour} style={{ height: ROW_HEIGHT_PX }} className="relative -top-2 pr-2 text-right text-[11px] text-muted-foreground">
                {hour === 0 ? "" : `${pad2(hour)}:00`}
              </div>
            ))}
          </div>

          {props.days.map((day, dayIndex) => {
            const positioned = layoutDayAppointments(
              props.appointments.filter((item) => !isAllDay(item)),
              day,
            );
            return (
              <div key={day.toISOString()} className="relative flex-1 border-l">
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    style={{ height: ROW_HEIGHT_PX }}
                    className="block w-full border-b border-dashed border-border/60 text-left hover:bg-accent/30"
                    onClick={() => {
                      const start = new Date(day);
                      start.setHours(hour, 0, 0, 0);
                      props.onCreateAt(start);
                    }}
                  />
                ))}

                {isToday(day) ? (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 border-t border-red-500"
                    style={{ top: (minutesSinceMidnight(new Date()) / 60) * ROW_HEIGHT_PX }}
                  >
                    <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
                  </div>
                ) : null}

                {positioned.map(({ appointment, start, end, col, totalCols }) => {
                  const top = (minutesSinceMidnight(start) / 60) * ROW_HEIGHT_PX;
                  const durationMinutes = Math.max((end.getTime() - start.getTime()) / 60000, 20);
                  const height = (durationMinutes / 60) * ROW_HEIGHT_PX;
                  const style = TYPE_STYLES[appointment.appointment_type];
                  const width = 100 / totalCols;
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onSelect(appointment.id);
                      }}
                      style={{ top, height, left: `${col * width}%`, width: `${width}%` }}
                      className={[
                        "absolute overflow-hidden rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm",
                        style.bg,
                        style.border,
                        style.text,
                      ].join(" ")}
                    >
                      <div className="truncate font-medium">{appointment.title}</div>
                      <div className="truncate opacity-80">
                        {pad2(start.getHours())}:{pad2(start.getMinutes())}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visualização de Mês
// ---------------------------------------------------------------------------

function MonthView(props: {
  anchor: Date;
  appointments: Appointment[];
  onSelect: (id: string) => void;
  onOpenDay: (day: Date) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(props.anchor));
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appointment of props.appointments) {
      const key = formatDateInput(new Date(appointment.starts_at));
      const list = map.get(key) ?? [];
      list.push(appointment);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    return map;
  }, [props.appointments]);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
        {WEEKDAY_SHORT.map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const inMonth = day.getMonth() === props.anchor.getMonth();
          const items = byDay.get(formatDateInput(day)) ?? [];
          const visible = items.slice(0, 3);
          const overflow = items.length - visible.length;
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => props.onOpenDay(day)}
              className={[
                "flex min-h-0 flex-col items-stretch gap-0.5 border-b border-l p-1 text-left align-top",
                inMonth ? "bg-background" : "bg-muted/30 text-muted-foreground",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                  isToday(day) ? "bg-primary text-primary-foreground" : "",
                ].join(" ")}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {visible.map((appointment) => {
                  const style = TYPE_STYLES[appointment.appointment_type];
                  return (
                    <span
                      key={appointment.id}
                      role="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onSelect(appointment.id);
                      }}
                      className={["truncate rounded px-1 text-[10px]", style.bg, style.text].join(" ")}
                    >
                      {appointment.title}
                    </span>
                  );
                })}
                {overflow > 0 ? <span className="px-1 text-[10px] text-muted-foreground">+{overflow}</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visualização de Ano
// ---------------------------------------------------------------------------

function YearView(props: {
  anchor: Date;
  appointments: Appointment[];
  onOpenMonth: (month: Date) => void;
  onOpenDay: (day: Date) => void;
}) {
  const year = props.anchor.getFullYear();
  const daysWithAppointments = useMemo(() => {
    const set = new Set<string>();
    for (const appointment of props.appointments) set.add(formatDateInput(new Date(appointment.starts_at)));
    return set;
  }, [props.appointments]);

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MONTH_NAMES.map((name, monthIndex) => {
        const monthStart = new Date(year, monthIndex, 1);
        const gridStart = startOfWeek(monthStart);
        const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
        return (
          <div key={name} className="rounded-md border p-2">
            <button type="button" className="mb-1 text-sm font-medium hover:underline" onClick={() => props.onOpenMonth(monthStart)}>
              {name}
            </button>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-muted-foreground">
              {WEEKDAY_SHORT.map((day) => (
                <span key={day}>{day.slice(0, 1)}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]">
              {days.map((day) => {
                const inMonth = day.getMonth() === monthIndex;
                const hasEvents = daysWithAppointments.has(formatDateInput(day));
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => props.onOpenDay(day)}
                    className={[
                      "relative flex h-5 w-5 items-center justify-center rounded-full",
                      inMonth ? "text-foreground" : "text-muted-foreground/40",
                      isToday(day) ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                    ].join(" ")}
                  >
                    {day.getDate()}
                    {hasEvents ? <span className="absolute bottom-0 h-0.5 w-0.5 rounded-full bg-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visualização de Programação (lista cronológica)
// ---------------------------------------------------------------------------

function ScheduleView(props: { appointments: Appointment[]; onSelect: (id: string) => void }) {
  const groups = useMemo(() => {
    const sorted = [...props.appointments].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const map = new Map<string, Appointment[]>();
    for (const appointment of sorted) {
      const key = formatDateInput(new Date(appointment.starts_at));
      const list = map.get(key) ?? [];
      list.push(appointment);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [props.appointments]);

  if (!groups.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Nenhum agendamento encontrado para o período selecionado.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-4">
        {groups.map(([key, items]) => {
          const date = new Date(`${key}T00:00:00`);
          return (
            <div key={key}>
              <p className="mb-1 text-sm font-medium">
                {WEEKDAY_SHORT[date.getDay()]}, {date.getDate()} de {MONTH_NAMES[date.getMonth()]}
                {isToday(date) ? <span className="ml-2 text-xs text-primary">Hoje</span> : null}
              </p>
              <div className="space-y-1">
                {items.map((appointment) => {
                  const style = TYPE_STYLES[appointment.appointment_type];
                  const Icon = style.icon;
                  const start = new Date(appointment.starts_at);
                  const end = new Date(appointment.ends_at);
                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => props.onSelect(appointment.id)}
                      className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent/40"
                    >
                      <span className={["flex h-7 w-7 shrink-0 items-center justify-center rounded-full", style.bg, style.text].join(" ")}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">
                        {pad2(start.getHours())}:{pad2(start.getMinutes())}–{pad2(end.getHours())}:{pad2(end.getMinutes())}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{appointment.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {getAppointmentStatusLabel(appointment.appointment_type, appointment.status)}
                      </Badge>
                      {appointment.assignee ? (
                        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                          <User2 className="h-3 w-3" /> {appointment.assignee.name}
                        </span>
                      ) : null}
                      {appointment.property ? (
                        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground md:flex">
                          <Building2 className="h-3 w-3" /> {appointment.property.code}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de detalhes do compromisso (lateral direito)
// ---------------------------------------------------------------------------

function AppointmentDetailSheet(props: {
  appointment: Appointment | null;
  properties: PropertySummary[];
  leads: Lead[];
  canEdit: boolean;
  running: string | null;
  onClose: () => void;
  onEdit: (appointment: Appointment) => void;
  onStatus: (appointment: Appointment, status: AppointmentStatus) => void;
}) {
  const appointment = props.appointment;
  const busy = appointment ? props.running === `status:${appointment.id}` : false;
  const start = appointment ? new Date(appointment.starts_at) : null;
  const end = appointment ? new Date(appointment.ends_at) : null;
  const nextStatuses = appointment
    ? appointmentStatusFlowByType[appointment.appointment_type].filter((status) => status !== appointment.status)
    : [];

  return (
    <Sheet open={Boolean(appointment)} onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {appointment ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <TYPE_STYLES_ICON type={appointment.appointment_type} />
                {appointment.title}
              </SheetTitle>
              <SheetDescription>{appointmentTypeLabels[appointment.appointment_type]}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                {start && end ? (
                  <span>
                    {pad2(start.getDate())}/{pad2(start.getMonth() + 1)} {pad2(start.getHours())}:{pad2(start.getMinutes())} –{" "}
                    {pad2(end.getHours())}:{pad2(end.getMinutes())}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline">{getAppointmentStatusLabel(appointment.appointment_type, appointment.status)}</Badge>
              </div>

              {appointment.location_text ? (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> <span>{appointment.location_text}</span>
                </div>
              ) : null}

              {appointment.description ? <p className="whitespace-pre-wrap text-foreground">{appointment.description}</p> : null}

              <Separator />

              <div className="space-y-2">
                {appointment.assignee ? (
                  <div className="flex items-center gap-2">
                    <User2 className="h-4 w-4 text-muted-foreground" />
                    <span>Responsável: {appointment.assignee.name}</span>
                  </div>
                ) : null}
                {appointment.property ? (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Imóvel: {appointment.property.code} — {appointment.property.title}
                    </span>
                  </div>
                ) : null}
                {appointment.lead ? (
                  <div className="flex items-center gap-2">
                    <UsersIcon className="h-4 w-4 text-muted-foreground" />
                    <span>Cliente: {appointment.lead.name}</span>
                  </div>
                ) : null}
              </div>

              {props.canEdit && nextStatuses.length ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Alterar status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nextStatuses.map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => props.onStatus(appointment, status)}
                      >
                        {getAppointmentStatusLabel(appointment.appointment_type, status)}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <SheetFooter className="mt-6">
              {props.canEdit && appointment.status === "scheduled" ? (
                <Button type="button" variant="outline" className="gap-1" onClick={() => props.onEdit(appointment)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              ) : null}
              {props.canEdit && appointment.status !== "cancelled" && appointment.status !== "completed" ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => props.onStatus(appointment, "cancelled")}
                >
                  Cancelar
                </Button>
              ) : null}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Formulário de criação / edição
// ---------------------------------------------------------------------------

function AppointmentFormSheet(props: {
  open: boolean;
  editing: boolean;
  values: FormValues | null;
  onChange: (values: FormValues) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
  busy: boolean;
  leads: Lead[];
  properties: PropertySummary[];
  users: CrmUser[];
}) {
  const values = props.values;

  return (
    <Sheet open={props.open} onOpenChange={(open) => !open && props.onCancel()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {values ? (
          <form onSubmit={props.onSubmit} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>{props.editing ? "Editar compromisso" : "Novo agendamento"}</SheetTitle>
              <SheetDescription>
                {values.appointment_type === "visit"
                  ? "Visita a imóvel"
                  : values.appointment_type === "task"
                    ? "Tarefa"
                    : "Evento"}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
              {!props.editing ? (
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select
                    value={values.appointment_type}
                    onValueChange={(value) => props.onChange({ ...values, appointment_type: value as AppointmentType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">Evento</SelectItem>
                      <SelectItem value="visit">Visita a imóvel</SelectItem>
                      <SelectItem value="task">Tarefa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input
                  required
                  value={values.title}
                  onChange={(event) => props.onChange({ ...values, title: event.target.value })}
                  placeholder={values.appointment_type === "task" ? "Ex.: Enviar contrato ao proprietário" : "Título do compromisso"}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea
                  value={values.description}
                  onChange={(event) => props.onChange({ ...values, description: event.target.value })}
                  rows={3}
                />
              </div>

              {values.appointment_type === "visit" ? (
                <div className="space-y-1.5">
                  <Label>Imóvel</Label>
                  <Select
                    value={values.property_id || undefined}
                    onValueChange={(value) => props.onChange({ ...values, property_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um imóvel" />
                    </SelectTrigger>
                    <SelectContent>
                      {props.properties.map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.code} — {property.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {values.appointment_type !== "task" ? (
                <div className="space-y-1.5">
                  <Label>Cliente interessado</Label>
                  <Select
                    value={values.lead_id || undefined}
                    onValueChange={(value) => props.onChange({ ...values, lead_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {props.leads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label>{values.appointment_type === "task" ? "Responsável" : "Corretor responsável"}</Label>
                <Select
                  value={values.assigned_to || undefined}
                  onValueChange={(value) => props.onChange({ ...values, assigned_to: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.users.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {values.appointment_type === "task" ? (
                <div className="space-y-1.5">
                  <Label>Prioridade</Label>
                  <Select
                    value={values.priority}
                    onValueChange={(value) => props.onChange({ ...values, priority: value as TaskPriority })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {TASK_PRIORITY_LABELS[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={values.all_day}
                  onCheckedChange={(checked) => props.onChange({ ...values, all_day: Boolean(checked) })}
                />
                Dia inteiro
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{values.appointment_type === "task" ? "Início" : "Começa em"}</Label>
                  <Input
                    required
                    type="datetime-local"
                    value={values.starts_at}
                    onChange={(event) => props.onChange({ ...values, starts_at: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{values.appointment_type === "task" ? "Prazo" : "Termina em"}</Label>
                  <Input
                    type="datetime-local"
                    value={values.ends_at}
                    onChange={(event) => props.onChange({ ...values, ends_at: event.target.value })}
                  />
                </div>
              </div>

              {values.appointment_type !== "task" ? (
                <div className="space-y-1.5">
                  <Label>Local</Label>
                  <Input
                    value={values.location_text}
                    onChange={(event) => props.onChange({ ...values, location_text: event.target.value })}
                    placeholder="Endereço ou local do compromisso"
                  />
                </div>
              ) : null}
            </div>

            <SheetFooter className="mt-4">
              <Button type="button" variant="outline" onClick={props.onCancel}>
                Cancelar
              </Button>
              <Button type="submit" disabled={props.busy}>
                {props.busy ? "Salvando..." : props.editing ? "Salvar alterações" : "Criar"}
              </Button>
            </SheetFooter>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default AgendaPage;

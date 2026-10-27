import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Check,
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
  Settings,
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
  appointmentStatusLabels,
  appointmentTypeLabels,
  cancelAppointment,
  changeAppointmentStatus,
  completeAppointment,
  createAppointment,
  getAppointmentStatusLabel,
  formatAppointmentDate,
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
import {
  getAgendaPreferences,
  getAgendaCompanySettings,
  updateAgendaCompanySettings,
  type AgendaCompanySettings,
  updateAgendaPreferences,
  type AgendaUserPreferences,
} from "@/product/agenda-settings";
import {
  createBooking,
  createBookingException,
  createBookingPage,
  deleteBookingException,
  duplicateBookingPage,
  listBookingAvailability,
  listBookingPages,
  listBookings,
  rescheduleBooking,
  updateBookingPage,
  updateWeeklyAvailability,
  type BookingPage,
} from "@/product/booking";

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

  // Em telas estreitas (celular/tablet retrato) a barra lateral some por padrao para a grade
  // nao ficar espremida; o usuario ainda pode reabri-la pelo botao do cabecalho.
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1024,
  );
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
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferences, setPreferences] = useState<AgendaUserPreferences | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [companySettings, setCompanySettings] = useState<AgendaCompanySettings | null>(null);
  const [companySettingsLoading, setCompanySettingsLoading] = useState(false);
  const [companySettingsSaving, setCompanySettingsSaving] = useState(false);
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [bookingPagesOpen, setBookingPagesOpen] = useState(false);
  const [bookingPagesLoading, setBookingPagesLoading] = useState(false);
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bookingAvailability, setBookingAvailability] = useState<Record<string, Array<{ starts_at: string; ends_at: string }>>>({});
  const [bookingLoading, setBookingLoading] = useState<string | null>(null);
  const [editingBookingPage, setEditingBookingPage] = useState<string | null>(null);
  const [bookingRows, setBookingRows] = useState<Record<string, Array<{ id: string; appointment_id: string; version: number; starts_at: string; ends_at: string; status: string }>>>({});

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

  async function openPreferences() {
    setPreferencesOpen(true);
    if (preferences || preferencesLoading) return;
    setPreferencesLoading(true);
    try { setPreferences((await getAgendaPreferences()).preferences); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível carregar as preferências da Agenda.")); }
    finally { setPreferencesLoading(false); }
  }
  async function openCompanySettings() {
    setPreferencesOpen(true);
    if (companySettings || companySettingsLoading || !canManage(user, "settings.manage")) return;
    setCompanySettingsLoading(true);
    try { setCompanySettings((await getAgendaCompanySettings()).settings); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível carregar as políticas da empresa.")); }
    finally { setCompanySettingsLoading(false); }
  }
  async function saveCompanySettings() {
    if (!companySettings) return;
    setCompanySettingsSaving(true);
    try { setCompanySettings((await updateAgendaCompanySettings({ ...companySettings })).settings); setNotice("Políticas da empresa salvas."); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível salvar as políticas.")); }
    finally { setCompanySettingsSaving(false); }
  }
  async function savePreferences() {
    if (!preferences) return;
    setPreferencesSaving(true);
    try { setPreferences((await updateAgendaPreferences({ ...preferences })).preferences); setNotice("Preferências da Agenda salvas."); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível salvar as preferências.")); }
    finally { setPreferencesSaving(false); }
  }
  async function openBookingPages() {
    setBookingPagesOpen(true);
    if (bookingPagesLoading) return;
    setBookingPagesLoading(true);
    try { setBookingPages((await listBookingPages()).pages); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível carregar as páginas de agendamento.")); }
    finally { setBookingPagesLoading(false); }
  }
  async function createPage(input: Record<string, unknown>) {
    if (!input.owner_user_id) { setError("Selecione um responsável."); return; }
    setRunning("booking-page");
    try { const response = await createBookingPage(input); setBookingPages((current) => [response.page, ...current]); setNotice("Página de agendamento criada como inativa."); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível criar a página de agendamento.")); }
    finally { setRunning(null); }
  }
  async function toggleBookingPage(page: BookingPage) {
    setRunning(`booking-toggle:${page.id}`);
    try { const response = await updateBookingPage(page.id, { expected_version: page.version, status: page.status === "active" ? "inactive" : "active" }); setBookingPages((current) => current.map((item) => item.id === page.id ? response.page : item)); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível atualizar a página.")); }
    finally { setRunning(null); }
  }
  async function duplicatePage(page: BookingPage) {
    setRunning(`booking-duplicate:${page.id}`);
    try { const response = await duplicateBookingPage(page.id); setBookingPages((current) => [response.page, ...current]); setNotice("Página duplicada como inativa."); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível duplicar a página.")); }
    finally { setRunning(null); }
  }
  async function saveBookingPage(page: BookingPage, input: Record<string, unknown>) {
    setRunning(`booking-edit:${page.id}`);
    try { const response = await updateBookingPage(page.id, { ...input, expected_version: page.version }); setBookingPages((current) => current.map((item) => item.id === page.id ? response.page : item)); setEditingBookingPage(null); setNotice("Página de agendamento atualizada."); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível editar a página.")); }
    finally { setRunning(null); }
  }
  async function savePageWeekly(page: BookingPage, intervals: Array<{ weekday: number; start_minute: number; end_minute: number }>) {
    setRunning(`booking-weekly:${page.id}`);
    try { const response = await updateWeeklyAvailability(page.id, intervals); setBookingPages((current) => current.map((item) => item.id === page.id ? response.page : item)); setNotice("Disponibilidade semanal salva."); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível salvar a disponibilidade.")); }
    finally { setRunning(null); }
  }
  async function addPageException(page: BookingPage, input: Record<string, unknown>) {
    setRunning(`booking-exception:${page.id}`);
    try { const response = await createBookingException(page.id, input); setBookingPages((current) => current.map((item) => item.id === page.id ? { ...item, exceptions: [...item.exceptions, response.exception] } : item)); setNotice("Exceção de disponibilidade adicionada."); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível adicionar a exceção.")); }
    finally { setRunning(null); }
  }
  async function removePageException(page: BookingPage, exceptionId: string) {
    setRunning(`booking-exception-delete:${exceptionId}`);
    try { await deleteBookingException(page.id, exceptionId); setBookingPages((current) => current.map((item) => item.id === page.id ? { ...item, exceptions: item.exceptions.filter((exception) => exception.id !== exceptionId) } : item)); setNotice("Exceção removida."); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível remover a exceção.")); }
    finally { setRunning(null); }
  }
  async function archiveBookingPage(page: BookingPage) {
    setRunning(`booking-archive:${page.id}`);
    try { const response = await updateBookingPage(page.id, { expected_version: page.version, status: "archived" }); setBookingPages((current) => current.map((item) => item.id === page.id ? response.page : item)); setNotice("Página arquivada."); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível arquivar a página.")); }
    finally { setRunning(null); }
  }
  async function loadAvailability(page: BookingPage) {
    setBookingLoading(page.id);
    try { const response = await listBookingAvailability(page.id, bookingDate); setBookingAvailability((current) => ({ ...current, [page.id]: response.slots })); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível consultar horários.")); }
    finally { setBookingLoading(null); }
  }
  async function reserveSlot(page: BookingPage, slot: { starts_at: string; ends_at: string }, leadId: string, propertyId: string) {
    if (!leadId) { setError("Selecione o cliente antes de reservar."); return; }
    setBookingLoading(`${page.id}:${slot.starts_at}`);
    try { await createBooking(page.id, { lead_id: leadId, property_id: propertyId || null, starts_at: slot.starts_at, ends_at: slot.ends_at }); setNotice("Reserva criada e vinculada ao agendamento."); await loadData(); await loadAvailability(page); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível criar a reserva.")); }
    finally { setBookingLoading(null); }
  }
  async function loadBookings(page: BookingPage) {
    setBookingLoading(`list:${page.id}`);
    try { const response = await listBookings(page.id); setBookingRows((current) => ({ ...current, [page.id]: response.bookings })); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível carregar as reservas.")); }
    finally { setBookingLoading(null); }
  }
  async function cancelBooking(row: { appointment_id: string; version: number }) {
    setBookingLoading(`cancel:${row.appointment_id}`);
    try { await cancelAppointment(row.appointment_id, row.version); setNotice("Reserva cancelada; o horário foi liberado novamente."); await loadData(); setBookingRows({}); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível cancelar a reserva.")); }
    finally { setBookingLoading(null); }
  }
  async function rescheduleBookingRow(page: BookingPage, row: { id: string; appointment_id: string; version: number }, startsAt: string, endsAt: string) {
    setBookingLoading(`reschedule:${row.id}`);
    try { const response = await rescheduleBooking(page.id, row.id, { expected_version: row.version, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString() }); setBookingRows((current) => ({ ...current, [page.id]: (current[page.id] ?? []).map((item) => item.id === row.id ? { ...item, ...response.booking } : item) })); setNotice("Reserva reagendada."); await loadAvailability(page); }
    catch (error) { setError(getSafeApiErrorMessage(error, "Não foi possível reagendar a reserva.")); }
    finally { setBookingLoading(null); }
  }

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
          onOpenPreferences={() => void openPreferences()}
          onOpenBookingPages={() => void openBookingPages()}
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

        {preferencesOpen ? (
          <>
            <AgendaPreferencesPanel preferences={preferences} loading={preferencesLoading} saving={preferencesSaving} onClose={() => setPreferencesOpen(false)} onChange={setPreferences} onSave={() => void savePreferences()} />
            {canManage(user, "settings.manage") ? (
              <AgendaCompanySettingsPanel settings={companySettings} loading={companySettingsLoading} saving={companySettingsSaving} onOpen={() => void openCompanySettings()} onChange={setCompanySettings} onSave={() => void saveCompanySettings()} />
            ) : null}
          </>
        ) : null}

        {bookingPagesOpen ? (
          <BookingPagesPanel
            pages={bookingPages} leads={leads} properties={properties} users={users} loading={bookingPagesLoading} running={running}
            editingPageId={editingBookingPage} bookingDate={bookingDate} setBookingDate={setBookingDate} availability={bookingAvailability} bookings={bookingRows} bookingLoading={bookingLoading}
            onClose={() => setBookingPagesOpen(false)} onCreate={(input) => void createPage(input)} onToggle={(page) => void toggleBookingPage(page)} onDuplicate={(page) => void duplicatePage(page)}
            onEdit={(page) => setEditingBookingPage(page.id)} onCancelEdit={() => setEditingBookingPage(null)} onSaveEdit={(page, input) => void saveBookingPage(page, input)}
            onSaveWeekly={(page, intervals) => void savePageWeekly(page, intervals)} onAddException={(page, input) => void addPageException(page, input)} onRemoveException={(page, exceptionId) => void removePageException(page, exceptionId)} onArchive={(page) => void archiveBookingPage(page)}
            onLoadAvailability={(page) => void loadAvailability(page)} onReserve={(page, slot, leadId, propertyId) => void reserveSlot(page, slot, leadId, propertyId)} onLoadBookings={(page) => void loadBookings(page)} onCancelBooking={(row) => void cancelBooking(row)} onRescheduleBooking={(page, row, startsAt, endsAt) => void rescheduleBookingRow(page, row, startsAt, endsAt)}
          />
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
  onOpenPreferences: () => void;
  onOpenBookingPages: () => void;
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
          <Button type="button" variant="outline" size="sm" onClick={props.onOpenPreferences}>
            <Settings className="h-4 w-4" /> Preferências
          </Button>
          {props.canEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={props.onOpenBookingPages}>
              <CalendarDays className="h-4 w-4" /> Páginas
            </Button>
          ) : null}
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
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

  // Largura minima por coluna de dia: evita que Semana vire uma faixa ilegivel em telas
  // estreitas - a grade passa a rolar horizontalmente em vez de espremer as colunas.
  const minGridWidth = 56 + props.days.length * 92;

  return (
    <div className="flex h-full flex-col overflow-hidden">
    <div className="flex h-full flex-col overflow-x-auto">
    <div className="flex h-full flex-col" style={{ minWidth: minGridWidth }}>
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
  // Espelha o grafo de transicoes do backend (canTransitionAppointment): cancelled/completed/no_show sao
  // estados terminais e nao aceitam nenhuma nova transicao - sem isso a UI oferecia botoes que sempre
  // resultavam em 409 (conflito) ao clicar.
  const isTerminal = appointment ? ["cancelled", "completed", "no_show"].includes(appointment.status) : true;
  const nextStatuses =
    appointment && !isTerminal
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
              {props.canEdit && !isTerminal ? (
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
  reminder_at: string;
};

function AgendaPreferencesPanel({
  preferences,
  loading,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  preferences: AgendaUserPreferences | null;
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onChange: (value: AgendaUserPreferences | null) => void;
  onSave: () => void;
}) {
  if (loading || !preferences) {
    return (
      <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Carregando preferências...
      </section>
    );
  }
  const update = <K extends keyof AgendaUserPreferences>(key: K, value: AgendaUserPreferences[K]) =>
    onChange({ ...preferences, [key]: value });
  return (
    <section
      className="space-y-4 rounded-lg border bg-card p-4"
      aria-label="Preferências da Agenda"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Preferências da Agenda</h2>
          <p className="text-xs text-muted-foreground">
            Estas opções são pessoais e não alteram a política da empresa.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Fechar preferências"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Idioma
          <Input value={preferences.locale} onChange={(e) => update("locale", e.target.value)} />
        </label>
        <label className="text-sm">
          País
          <Input
            maxLength={2}
            value={preferences.country}
            onChange={(e) => update("country", e.target.value.toUpperCase())}
          />
        </label>
        <label className="text-sm">
          Formato de data
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={preferences.date_format}
            onChange={(e) =>
              update("date_format", e.target.value as AgendaUserPreferences["date_format"])
            }
          >
            <option value="DMY">DD/MM/AAAA</option>
            <option value="MDY">MM/DD/AAAA</option>
            <option value="YMD">AAAA-MM-DD</option>
          </select>
        </label>
        <label className="text-sm">
          Formato de hora
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={preferences.time_format}
            onChange={(e) =>
              update("time_format", e.target.value as AgendaUserPreferences["time_format"])
            }
          >
            <option value="24h">24 horas</option>
            <option value="12h">12 horas</option>
          </select>
        </label>
        <label className="text-sm">
          Fuso principal
          <Input
            value={preferences.timezone}
            onChange={(e) => update("timezone", e.target.value)}
          />
        </label>
        <label className="text-sm">
          Fuso secundário
          <Input
            value={preferences.secondary_timezone ?? ""}
            onChange={(e) => update("secondary_timezone", e.target.value || null)}
          />
        </label>
        <label className="text-sm">
          Início da semana
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={preferences.week_start}
            onChange={(e) => update("week_start", Number(e.target.value))}
          >
            <option value={0}>Domingo</option>
            <option value={1}>Segunda</option>
            <option value={6}>Sábado</option>
          </select>
        </label>
        <label className="text-sm">
          Duração padrão (min)
          <Input
            type="number"
            min={5}
            max={1440}
            value={preferences.default_event_duration_minutes}
            onChange={(e) => update("default_event_duration_minutes", Number(e.target.value))}
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["show_world_clock", "Relógio mundial"],
            ["shorten_meetings", "Reuniões rápidas"],
            ["notify_enabled", "Notificações"],
            ["notify_sound", "Som de notificação"],
            ["notify_only_confirmed", "Somente confirmados"],
            ["notify_tasks_enabled", "Notificar tarefas"],
            ["show_weekends", "Exibir fins de semana"],
            ["show_cancelled", "Exibir cancelados"],
            ["show_completed_tasks", "Exibir concluídos"],
            ["show_week_numbers", "Números das semanas"],
            ["compact_short_events", "Eventos curtos compactos"],
            ["dim_past_events", "Atenuar eventos passados"],
            ["show_brokers_side_by_side", "Corretores lado a lado"],
            ["keyboard_shortcuts_enabled", "Atalhos de teclado"],
          ] as Array<[keyof AgendaUserPreferences, string]>
        ).map(([key, label]) => (
          <label
            key={String(key)}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={Boolean(preferences[key])}
              onChange={(e) => update(key, e.target.checked as AgendaUserPreferences[typeof key])}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <label className="text-sm">
          Privacidade padrão
          <select
            className="ml-2 h-9 rounded-md border bg-background px-3"
            value={preferences.default_visibility}
            onChange={(e) =>
              update(
                "default_visibility",
                e.target.value as AgendaUserPreferences["default_visibility"],
              )
            }
          >
            <option value="shared">Compartilhado</option>
            <option value="private">Privado</option>
          </select>
        </label>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar preferências
        </Button>
      </div>
    </section>
  );
}

function AgendaCompanySettingsPanel({
  settings,
  loading,
  saving,
  onOpen,
  onChange,
  onSave,
}: {
  settings: AgendaCompanySettings | null;
  loading: boolean;
  saving: boolean;
  onOpen: () => void;
  onChange: (value: AgendaCompanySettings | null) => void;
  onSave: () => void;
}) {
  if (!settings)
    return (
      <div className="rounded-md border border-dashed p-3 text-sm">
        <Button type="button" variant="outline" onClick={onOpen} disabled={loading}>
          {loading ? "Carregando políticas..." : "Carregar políticas da empresa"}
        </Button>
      </div>
    );
  const update = <K extends keyof AgendaCompanySettings>(key: K, value: AgendaCompanySettings[K]) =>
    onChange({ ...settings, [key]: value });
  return (
    <section
      className="space-y-3 rounded-md border bg-muted/20 p-3"
      aria-label="Políticas da empresa"
    >
      <div>
        <h3 className="font-medium">Políticas da empresa</h3>
        <p className="text-xs text-muted-foreground">
          Limites institucionais aplicados às reservas e notificações.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Fuso padrão
          <Input
            value={settings.default_timezone}
            onChange={(event) => update("default_timezone", event.target.value)}
          />
        </label>
        <label className="text-sm">
          Visibilidade
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-3"
            value={settings.default_visibility}
            onChange={(event) =>
              update(
                "default_visibility",
                event.target.value as AgendaCompanySettings["default_visibility"],
              )
            }
          >
            <option value="shared">Compartilhado</option>
            <option value="private">Privado</option>
          </select>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.guests_can_modify_max}
            onChange={(event) => update("guests_can_modify_max", event.target.checked)}
          />{" "}
          Convidados podem alterar
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.guests_can_invite_max}
            onChange={(event) => update("guests_can_invite_max", event.target.checked)}
          />{" "}
          Convidados podem convidar
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.guests_can_see_guest_list_max}
            onChange={(event) => update("guests_can_see_guest_list_max", event.target.checked)}
          />{" "}
          Exibir lista de convidados
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.notify_channel_system_enabled}
            onChange={(event) => update("notify_channel_system_enabled", event.target.checked)}
          />{" "}
          Notificações no sistema
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.notify_channel_email_enabled}
            onChange={(event) => update("notify_channel_email_enabled", event.target.checked)}
          />{" "}
          Notificações por e-mail
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.notify_channel_whatsapp_enabled}
            onChange={(event) => update("notify_channel_whatsapp_enabled", event.target.checked)}
          />{" "}
          Notificações WhatsApp
        </label>
      </div>
      <Button type="button" onClick={onSave} disabled={saving}>
        {saving ? "Salvando..." : "Salvar políticas"}
      </Button>
    </section>
  );
}

function BookingPagesPanel({
  pages,
  leads,
  properties,
  users,
  loading,
  running,
  onClose,
  onCreate,
  onToggle,
  onDuplicate,
  editingPageId,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onSaveWeekly,
  onAddException,
  onRemoveException,
  onArchive,
  bookingDate,
  setBookingDate,
  availability,
  bookings,
  bookingLoading,
  onLoadAvailability,
  onReserve,
  onLoadBookings,
  onCancelBooking,
  onRescheduleBooking,
}: {
  pages: BookingPage[];
  leads: Lead[];
  properties: PropertySummary[];
  users: CrmUser[];
  loading: boolean;
  running: string | null;
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => void;
  onToggle: (page: BookingPage) => void;
  onDuplicate: (page: BookingPage) => void;
  editingPageId: string | null;
  onEdit: (page: BookingPage) => void;
  onCancelEdit: () => void;
  onSaveEdit: (page: BookingPage, input: Record<string, unknown>) => void;
  onSaveWeekly: (
    page: BookingPage,
    intervals: Array<{ weekday: number; start_minute: number; end_minute: number }>,
  ) => void;
  onAddException: (page: BookingPage, input: Record<string, unknown>) => void;
  onRemoveException: (page: BookingPage, exceptionId: string) => void;
  onArchive: (page: BookingPage) => void;
  bookingDate: string;
  setBookingDate: (value: string) => void;
  availability: Record<string, Array<{ starts_at: string; ends_at: string }>>;
  bookings: Record<
    string,
    Array<{
      id: string;
      appointment_id: string;
      version: number;
      starts_at: string;
      ends_at: string;
      status: string;
    }>
  >;
  bookingLoading: string | null;
  onLoadAvailability: (page: BookingPage) => void;
  onReserve: (
    page: BookingPage,
    slot: { starts_at: string; ends_at: string },
    leadId: string,
    propertyId: string,
  ) => void;
  onLoadBookings: (page: BookingPage) => void;
  onCancelBooking: (row: { appointment_id: string; version: number }) => void;
  onRescheduleBooking: (
    page: BookingPage,
    row: { id: string; appointment_id: string; version: number },
    startsAt: string,
    endsAt: string,
  ) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [leadByPage, setLeadByPage] = useState<Record<string, string>>({});
  const [propertyByPage, setPropertyByPage] = useState<Record<string, string>>({});
  const [rescheduleByBooking, setRescheduleByBooking] = useState<
    Record<string, { startsAt: string; endsAt: string }>
  >({});
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    service_type: "visit",
    owner_user_id: users[0]?.id ?? "",
    property_id: "",
    location_text: "",
    color: "#6d28d9",
    duration_minutes: 60,
    buffer_minutes: 30,
    min_notice_minutes: 240,
    max_advance_days: 60,
    max_bookings_per_day: "",
    timezone: "America/Sao_Paulo",
    guests_can_invite: false,
    guests_can_see_guest_list: true,
  });
  function submitCreate(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.owner_user_id) return;
    onCreate({
      ...draft,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      property_id: draft.property_id || null,
      location_text: draft.location_text.trim() || null,
      color: draft.color || null,
      max_bookings_per_day: draft.max_bookings_per_day ? Number(draft.max_bookings_per_day) : null,
    });
    setCreateOpen(false);
    setDraft((current) => ({ ...current, title: "", description: "" }));
  }
  return (
    <section
      className="space-y-4 rounded-lg border bg-card p-4"
      aria-label="Páginas de agendamento"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Páginas de agendamento</h2>
          <p className="text-xs text-muted-foreground">
            Páginas internas para reservar horários; nenhuma publicação externa é criada nesta
            rodada.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => setCreateOpen((current) => !current)}
            disabled={Boolean(running)}
          >
            <Plus className="h-4 w-4" /> Nova página
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Fechar páginas"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {createOpen ? (
        <form
          onSubmit={submitCreate}
          className="grid gap-3 rounded-md border bg-background p-3 sm:grid-cols-2"
        >
          <label className="text-sm sm:col-span-2">
            Título
            <Input
              required
              value={draft.title}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Ex.: Visita ao imóvel"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Descrição
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2"
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            Tipo de atendimento
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-3"
              value={draft.service_type}
              onChange={(event) =>
                setDraft((current) => ({ ...current, service_type: event.target.value }))
              }
            >
              <option value="visit">Visita</option>
              <option value="meeting">Reunião</option>
              <option value="inspection">Vistoria</option>
              <option value="signature">Assinatura</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </label>
          <label className="text-sm">
            Cor do evento
            <Input
              type="color"
              value={draft.color}
              onChange={(event) =>
                setDraft((current) => ({ ...current, color: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            Responsável
            <select
              required
              className="mt-1 h-9 w-full rounded-md border bg-background px-3"
              value={draft.owner_user_id}
              onChange={(event) =>
                setDraft((current) => ({ ...current, owner_user_id: event.target.value }))
              }
            >
              <option value="">Selecione</option>
              {users.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Imóvel vinculado (opcional)
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-3"
              value={draft.property_id}
              onChange={(event) =>
                setDraft((current) => ({ ...current, property_id: event.target.value }))
              }
            >
              <option value="">Nenhum</option>
              {properties.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code ? `${item.code} — ` : ""}
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Local
            <Input
              value={draft.location_text}
              onChange={(event) =>
                setDraft((current) => ({ ...current, location_text: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            Fuso horário
            <Input
              value={draft.timezone}
              onChange={(event) =>
                setDraft((current) => ({ ...current, timezone: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            Duração (minutos)
            <Input
              type="number"
              min={5}
              max={1440}
              value={draft.duration_minutes}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  duration_minutes: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="text-sm">
            Intervalo (minutos)
            <Input
              type="number"
              min={0}
              max={1440}
              value={draft.buffer_minutes}
              onChange={(event) =>
                setDraft((current) => ({ ...current, buffer_minutes: Number(event.target.value) }))
              }
            />
          </label>
          <label className="text-sm">
            Antecedência mínima (minutos)
            <Input
              type="number"
              min={0}
              max={43200}
              value={draft.min_notice_minutes}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  min_notice_minutes: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="text-sm">
            Antecedência máxima (dias)
            <Input
              type="number"
              min={1}
              max={730}
              value={draft.max_advance_days}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  max_advance_days: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="text-sm">
            Limite diário (opcional)
            <Input
              type="number"
              min={1}
              max={1000}
              value={draft.max_bookings_per_day}
              onChange={(event) =>
                setDraft((current) => ({ ...current, max_bookings_per_day: event.target.value }))
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.guests_can_invite}
              onChange={(event) =>
                setDraft((current) => ({ ...current, guests_can_invite: event.target.checked }))
              }
            />{" "}
            Convidados podem convidar
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.guests_can_see_guest_list}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  guests_can_see_guest_list: event.target.checked,
                }))
              }
            />{" "}
            Exibir lista de convidados
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              type="submit"
              disabled={Boolean(running) || !draft.title.trim() || !draft.owner_user_id}
            >
              Criar página
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando páginas...</p>
      ) : pages.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nenhuma página criada.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {pages.map((page) => (
            <article key={page.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {editingPageId === page.id ? (
                    <BookingPageEditor
                      page={page}
                      users={users}
                      properties={properties}
                      busy={running === `booking-edit:${page.id}`}
                      onCancel={onCancelEdit}
                      onSave={(input) => onSaveEdit(page, input)}
                    />
                  ) : (
                    <>
                      <h3 className="font-medium">{page.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {page.owner?.name ?? "Responsável"} · {page.timezone}
                      </p>
                    </>
                  )}
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs">
                  {page.status === "active"
                    ? "Ativa"
                    : page.status === "archived"
                      ? "Arquivada"
                      : "Inativa"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {page.duration_minutes} min + {page.buffer_minutes} min de intervalo
              </p>
              {page.status !== "archived" ? (
                <BookingScheduleEditor
                  page={page}
                  busy={Boolean(running)}
                  onSave={(intervals) => onSaveWeekly(page, intervals)}
                  onAddException={(input) => onAddException(page, input)}
                  onRemoveException={(exceptionId) => onRemoveException(page, exceptionId)}
                />
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onToggle(page)}
                  disabled={Boolean(running) || page.status === "archived"}
                >
                  {page.status === "active" ? "Desativar" : "Ativar"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(page)}
                  disabled={Boolean(running) || page.status === "archived"}
                >
                  Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onDuplicate(page)}
                  disabled={Boolean(running)}
                >
                  Duplicar
                </Button>
                {page.status !== "archived" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onArchive(page)}
                    disabled={Boolean(running)}
                  >
                    Arquivar
                  </Button>
                ) : null}
              </div>
              {page.status === "active" ? (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-muted-foreground">
                      Cliente
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={leadByPage[page.id] ?? ""}
                        onChange={(event) =>
                          setLeadByPage((current) => ({
                            ...current,
                            [page.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Nenhum imóvel</option>
                        {leads.map((lead) => (
                          <option key={lead.id} value={lead.id}>
                            {lead.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Imóvel
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={propertyByPage[page.id] ?? ""}
                        onChange={(event) =>
                          setPropertyByPage((current) => ({
                            ...current,
                            [page.id]: event.target.value,
                          }))
                        }
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
                  </div>
                  <label className="text-xs text-muted-foreground">
                    Consultar disponibilidade
                    <Input
                      type="date"
                      value={bookingDate}
                      onChange={(event) => setBookingDate(event.target.value)}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onLoadAvailability(page)}
                    disabled={bookingLoading === page.id}
                  >
                    Consultar horários
                  </Button>
                  {availability[page.id]?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {availability[page.id].map((slot) => (
                        <Button
                          key={slot.starts_at}
                          type="button"
                          size="sm"
                          onClick={() =>
                            onReserve(
                              page,
                              slot,
                              leadByPage[page.id] ?? "",
                              propertyByPage[page.id] ?? "",
                            )
                          }
                          disabled={bookingLoading === `${page.id}:${slot.starts_at}`}
                        >
                          {new Date(slot.starts_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · Reservar
                        </Button>
                      ))}
                    </div>
                  ) : availability[page.id] ? (
                    <p className="text-xs text-muted-foreground">Nenhum horário disponível.</p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 border-t pt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onLoadBookings(page)}
                  disabled={bookingLoading === `list:${page.id}`}
                >
                  Consultar reservas
                </Button>
                {bookings[page.id]?.length ? (
                  <div className="mt-2 space-y-2">
                    {bookings[page.id].map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-xs"
                      >
                        <span>
                          {new Date(row.starts_at).toLocaleString("pt-BR")} · {row.status}
                        </span>
                        {row.status === "scheduled" ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <Input
                              type="datetime-local"
                              value={rescheduleByBooking[row.id]?.startsAt ?? ""}
                              onChange={(event) =>
                                setRescheduleByBooking((current) => ({
                                  ...current,
                                  [row.id]: {
                                    startsAt: event.target.value,
                                    endsAt: current[row.id]?.endsAt ?? "",
                                  },
                                }))
                              }
                              aria-label="Novo início da reserva"
                            />
                            <Input
                              type="datetime-local"
                              value={rescheduleByBooking[row.id]?.endsAt ?? ""}
                              onChange={(event) =>
                                setRescheduleByBooking((current) => ({
                                  ...current,
                                  [row.id]: {
                                    startsAt: current[row.id]?.startsAt ?? "",
                                    endsAt: event.target.value,
                                  },
                                }))
                              }
                              aria-label="Novo fim da reserva"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const value = rescheduleByBooking[row.id];
                                if (value?.startsAt && value.endsAt)
                                  onRescheduleBooking(page, row, value.startsAt, value.endsAt);
                              }}
                              disabled={
                                bookingLoading === `reschedule:${row.id}` ||
                                !rescheduleByBooking[row.id]?.startsAt ||
                                !rescheduleByBooking[row.id]?.endsAt
                              }
                            >
                              Reagendar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => onCancelBooking(row)}
                              disabled={bookingLoading === `cancel:${row.appointment_id}`}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : bookings[page.id] ? (
                  <p className="mt-2 text-xs text-muted-foreground">Nenhuma reserva encontrada.</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type WeeklyDraftInterval = { weekday: number; start_minute: number; end_minute: number };

function BookingScheduleEditor({
  page,
  busy,
  onSave,
  onAddException,
  onRemoveException,
}: {
  page: BookingPage;
  busy: boolean;
  onSave: (intervals: WeeklyDraftInterval[]) => void;
  onAddException: (input: Record<string, unknown>) => void;
  onRemoveException: (exceptionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [intervals, setIntervals] = useState<WeeklyDraftInterval[]>(() =>
    page.weekly_availability.map((item) => ({
      weekday: item.weekday,
      start_minute: item.startMinute,
      end_minute: item.endMinute,
    })),
  );
  const [exception, setException] = useState({
    date: "",
    is_available: false,
    start_minute: "",
    end_minute: "",
    reason: "",
  });
  const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const toTime = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const toMinute = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const addInterval = (weekday: number) =>
    setIntervals((current) => [...current, { weekday, start_minute: 9 * 60, end_minute: 18 * 60 }]);
  const copyDay = (source: number, target: number) =>
    setIntervals((current) => [
      ...current.filter((item) => item.weekday !== target),
      ...current
        .filter((item) => item.weekday === source)
        .map((item) => ({ ...item, weekday: target })),
    ]);
  function submitException(event: FormEvent) {
    event.preventDefault();
    if (!exception.date) return;
    onAddException({
      date: exception.date,
      is_available: exception.is_available,
      start_minute: exception.start_minute ? Number(exception.start_minute) : null,
      end_minute: exception.end_minute ? Number(exception.end_minute) : null,
      reason: exception.reason.trim() || null,
    });
    setException({ date: "", is_available: false, start_minute: "", end_minute: "", reason: "" });
  }
  return (
    <div className="mt-3 border-t pt-3">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
        {open ? "Ocultar disponibilidade" : "Editar disponibilidade"}
      </Button>
      {open ? (
        <div className="mt-2 space-y-3 rounded-md bg-muted/30 p-2 text-xs">
          <strong>Disponibilidade semanal</strong>
          <div className="space-y-2">
            {dayLabels.map((label, weekday) => {
              const dayRows = intervals
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => item.weekday === weekday);
              return (
                <div key={label} className="space-y-1 rounded border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="w-8">{label}</strong>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addInterval(weekday)}
                    >
                      + período
                    </Button>
                    {weekday > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => copyDay(weekday - 1, weekday)}
                      >
                        Copiar anterior
                      </Button>
                    ) : null}
                  </div>
                  {dayRows.map(({ item, index }) => (
                    <div key={`${weekday}-${index}`} className="flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        value={toTime(item.start_minute)}
                        onChange={(event) =>
                          setIntervals((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, start_minute: toMinute(event.target.value) }
                                : row,
                            ),
                          )
                        }
                      />
                      <span>até</span>
                      <Input
                        type="time"
                        value={toTime(item.end_minute)}
                        onChange={(event) =>
                          setIntervals((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, end_minute: toMinute(event.target.value) }
                                : row,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setIntervals((current) =>
                            current.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <Button type="button" size="sm" onClick={() => onSave(intervals)} disabled={busy}>
            Salvar horários semanais
          </Button>
          <form onSubmit={submitException} className="space-y-2 border-t pt-2">
            <strong>Exceção por data</strong>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="date"
                required
                value={exception.date}
                onChange={(event) =>
                  setException((current) => ({ ...current, date: event.target.value }))
                }
              />
              <Input
                placeholder="Motivo"
                value={exception.reason}
                onChange={(event) =>
                  setException((current) => ({ ...current, reason: event.target.value }))
                }
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exception.is_available}
                  onChange={(event) =>
                    setException((current) => ({ ...current, is_available: event.target.checked }))
                  }
                />{" "}
                Disponibilidade extraordinária
              </label>
              {exception.is_available ? (
                <>
                  <Input
                    type="time"
                    required
                    value={exception.start_minute ? toTime(Number(exception.start_minute)) : ""}
                    onChange={(event) =>
                      setException((current) => ({
                        ...current,
                        start_minute: String(toMinute(event.target.value)),
                      }))
                    }
                  />
                  <Input
                    type="time"
                    required
                    value={exception.end_minute ? toTime(Number(exception.end_minute)) : ""}
                    onChange={(event) =>
                      setException((current) => ({
                        ...current,
                        end_minute: String(toMinute(event.target.value)),
                      }))
                    }
                  />
                </>
              ) : null}
            </div>
            <Button type="submit" size="sm" variant="outline" disabled={busy}>
              Adicionar exceção
            </Button>
            {page.exceptions.length ? (
              <div className="space-y-1">
                {page.exceptions.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded border p-1"
                  >
                    <span>
                      {item.date} ·{" "}
                      {item.is_available
                        ? `${item.start_minute ?? "?"}-${item.end_minute ?? "?"}`
                        : "bloqueado"}
                      {item.reason ? ` · ${item.reason}` : ""}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveException(item.id)}
                      disabled={busy}
                    >
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}

function BookingPageEditor({
  page,
  users,
  properties,
  busy,
  onCancel,
  onSave,
}: {
  page: BookingPage;
  users: CrmUser[];
  properties: PropertySummary[];
  busy: boolean;
  onCancel: () => void;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState(() => ({
    title: page.title,
    description: page.description ?? "",
    service_type: page.service_type,
    owner_user_id: page.owner_user_id,
    property_id: page.property_id ?? "",
    location_text: page.location_text ?? "",
    color: "#6d28d9",
    duration_minutes: page.duration_minutes,
    buffer_minutes: page.buffer_minutes,
    min_notice_minutes: page.min_notice_minutes,
    max_advance_days: page.max_advance_days,
    max_bookings_per_day: page.max_bookings_per_day?.toString() ?? "",
    timezone: page.timezone,
    guests_can_invite: false,
    guests_can_see_guest_list: true,
  }));
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!values.title.trim() || !values.owner_user_id) return;
    onSave({
      ...values,
      title: values.title.trim(),
      description: values.description.trim() || null,
      property_id: values.property_id || null,
      location_text: values.location_text.trim() || null,
      color: values.color || null,
      max_bookings_per_day: values.max_bookings_per_day
        ? Number(values.max_bookings_per_day)
        : null,
    });
  }
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  return (
    <form onSubmit={submit} className="grid gap-2 rounded-md border bg-background p-2 text-sm">
      <Input value={values.title} onChange={(event) => set("title", event.target.value)} required />
      <textarea
        className="min-h-16 rounded-md border bg-background px-2 py-1"
        value={values.description}
        onChange={(event) => set("description", event.target.value)}
        placeholder="Descrição"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <label>
          Tipo
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            value={values.service_type}
            onChange={(event) => set("service_type", event.target.value)}
          >
            <option value="visit">Visita</option>
            <option value="meeting">Reunião</option>
            <option value="inspection">Vistoria</option>
            <option value="signature">Assinatura</option>
            <option value="follow_up">Follow-up</option>
          </select>
        </label>
        <label>
          Responsável
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            value={values.owner_user_id}
            onChange={(event) => set("owner_user_id", event.target.value)}
          >
            {users.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Imóvel (opcional)
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            value={values.property_id}
            onChange={(event) => set("property_id", event.target.value)}
          >
            <option value="">Nenhum</option>
            {properties.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code ? `${item.code} — ` : ""}
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Local
          <Input
            value={values.location_text}
            onChange={(event) => set("location_text", event.target.value)}
          />
        </label>
        <label>
          Duração (min)
          <Input
            type="number"
            min={5}
            max={1440}
            value={values.duration_minutes}
            onChange={(event) => set("duration_minutes", Number(event.target.value))}
          />
        </label>
        <label>
          Intervalo (min)
          <Input
            type="number"
            min={0}
            max={1440}
            value={values.buffer_minutes}
            onChange={(event) => set("buffer_minutes", Number(event.target.value))}
          />
        </label>
        <label>
          Antecedência mínima
          <Input
            type="number"
            min={0}
            max={43200}
            value={values.min_notice_minutes}
            onChange={(event) => set("min_notice_minutes", Number(event.target.value))}
          />
        </label>
        <label>
          Antecedência máxima (dias)
          <Input
            type="number"
            min={1}
            max={730}
            value={values.max_advance_days}
            onChange={(event) => set("max_advance_days", Number(event.target.value))}
          />
        </label>
        <label>
          Limite diário
          <Input
            type="number"
            min={1}
            max={1000}
            value={values.max_bookings_per_day}
            onChange={(event) => set("max_bookings_per_day", event.target.value)}
          />
        </label>
        <label>
          Fuso horário
          <Input
            value={values.timezone}
            onChange={(event) => set("timezone", event.target.value)}
          />
        </label>
        <label>
          Cor
          <Input
            type="color"
            value={values.color}
            onChange={(event) => set("color", event.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy || !values.title.trim() || !values.owner_user_id}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

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
    reminder_at: localDate(editing?.reminder_at),
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
          Lembrete
          <Input
            type="datetime-local"
            value={values.reminder_at}
            onChange={(event) => update("reminder_at", event.target.value)}
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
  dimPastEvents,
  running,
  onEdit,
  onCancel,
  onComplete,
}: {
  appointment: Appointment;
  canEdit: boolean;
  dimPastEvents: boolean;
  running: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) {
  const terminal = appointment.status !== "scheduled";
  const isPast = new Date(appointment.starts_at).getTime() < Date.now();
  return (
    <article
      className={`rounded-lg border bg-card p-4 shadow-sm ${dimPastEvents && isPast ? "opacity-70" : ""}`}
    >
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

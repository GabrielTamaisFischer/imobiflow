import { createFileRoute } from "@tanstack/react-router";
import "leaflet/dist/leaflet.css";
import {
  CalendarDays,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Home,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Star,
  StickyNote,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { FormEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type * as LeafletNamespace from "leaflet";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import {
  createAppointment,
  createRental,
  deleteAppointment,
  generateDueRentalCharges,
  generateNextRentalCharge,
  listAppointments,
  listRentals,
  updateAppointment,
  updateAppointmentStatus,
  type Appointment,
  type RentalAgreement,
} from "@/product/agenda";
import { listLeads, type Lead } from "@/product/crm";
import { listProperties, type Property } from "@/product/real-estate";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/agenda")({
  component: AgendaPage,
});

const appointmentTypeLabels = {
  visit: "Visita",
  return: "Retorno",
  meeting: "Reuniao",
  inspection: "Vistoria",
  signature: "Assinatura",
  follow_up: "Follow-up",
};

const appointmentStatusLabels = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  completed: "Realizada",
  cancelled: "Cancelada",
  rescheduled: "Reagendada",
  no_show: "Nao compareceu",
};

const rentalStatusLabels = {
  draft: "Rascunho",
  active: "Ativa",
  pending_signature: "Assinatura pendente",
  ending: "Em encerramento",
  ended: "Encerrada",
  cancelled: "Cancelada",
  overdue: "Inadimplente",
};

type CalendarPanel = "notes" | "tasks" | "people" | "maps";
type CalendarViewMode = "Dia" | "Semana" | "Mes" | "Ano";
type QuickScheduleMode = "event" | "task" | "booking";
type TimeRangeSelection = { date: Date; startHour: number; endHour: number } | null;
type PlaceSuggestion = { id: string; label: string };
type AgendaFilterKey = "events" | "tasks" | "bookings" | "scheduled" | "confirmed" | "completed";
type AgendaFilterOption = { key: AgendaFilterKey; label: string; description: string; count: number };
type GeoPoint = { lat: number; lng: number; label?: string };
type RouteSummary = { distanceKm: number; durationMin: number; geometry: GeoPoint[] };

type CalendarDraft = {
  appointmentId?: string;
  mode: QuickScheduleMode;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  repeat: string;
  assignedTo: string;
  location: string;
  description: string;
  attachmentName: string;
  visibility: "default" | "public" | "private";
  reminder: string;
  reminderChannel: "app" | "email";
  reminderCustomAmount: string;
  reminderCustomUnit: "minutes" | "hours" | "days" | "weeks";
  dueDate: string;
  linkedTaskListId: string;
  customRepeat: {
    every: string;
    unit: "dia" | "semana" | "mes" | "ano";
    weekdays: string[];
    ends: "never" | "on" | "after";
    endDate: string;
    occurrences: string;
  };
};

type EmailDraft = {
  recipients: string;
  copyMe: boolean;
  subject: string;
  message: string;
};

type NoteList = {
  id: string;
  title: string;
  items: Array<{ id: string; text: string; done: boolean }>;
  archived: boolean;
};

type QuickTask = {
  id: string;
  title: string;
  details: string;
  dueAt: string | null;
  repeating: boolean;
  starred: boolean;
  done: boolean;
  address: string;
  assigneeId: string | null;
};

function AgendaPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("agenda");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [rentals, setRentals] = useState<RentalAgreement[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isAgendaLoading, setIsAgendaLoading] = useState(true);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showRentalForm, setShowRentalForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  async function refreshAgenda() {
    setIsAgendaLoading(true);
    setError(null);

    try {
      const [appointmentResponse, rentalResponse, leadResponse, propertyResponse] = await Promise.all([
        listAppointments(),
        listRentals(),
        listLeads(),
        listProperties(),
      ]);
      setAppointments(appointmentResponse.appointments);
      setRentals(rentalResponse.rentals);
      setLeads(leadResponse.leads);
      setProperties(propertyResponse.properties);
    } catch (agendaError) {
      setError(
        agendaError instanceof Error
          ? agendaError.message
          : "Nao foi possivel carregar agenda e locacoes.",
      );
    } finally {
      setIsAgendaLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshAgenda();
    }
  }, [isLoading, session]);

  const activeAppointments = useMemo(
    () =>
      appointments.filter((appointment) =>
        ["scheduled", "confirmed", "rescheduled"].includes(appointment.status),
      ),
    [appointments],
  );
  const completedAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.status === "completed"),
    [appointments],
  );
  const selectedDayAppointments = useMemo(
    () => appointments.filter((appointment) => isSameCalendarDay(new Date(appointment.starts_at), selectedDate)),
    [appointments, selectedDate],
  );

  async function changeAppointmentStatus(
    appointment: Appointment,
    status: Appointment["status"],
  ) {
    setRunningAction(`${appointment.id}:${status}`);
    setError(null);

    try {
      const response = await updateAppointmentStatus(appointment.id, {
        status,
        result_notes:
          status === "completed"
            ? "Visita concluida. Follow-up gerado automaticamente quando houver lead vinculado."
            : undefined,
      });
      setAppointments((current) =>
        current.map((item) => (item.id === appointment.id ? response.appointment : item)),
      );
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Nao foi possivel atualizar o compromisso.",
      );
    } finally {
      setRunningAction(null);
    }
  }

  async function generateDueCharges() {
    setRunningAction("generate-due");
    setError(null);

    try {
      await generateDueRentalCharges({ limit: 50 });
      await refreshAgenda();
    } catch (chargeError) {
      setError(
        chargeError instanceof Error
          ? chargeError.message
          : "Nao foi possivel gerar cobrancas pendentes.",
      );
    } finally {
      setRunningAction(null);
    }
  }

  async function generateRentalCharge(rental: RentalAgreement) {
    setRunningAction(`rental-charge:${rental.id}`);
    setError(null);

    try {
      const response = await generateNextRentalCharge(rental.id, {
        notes: "Cobranca gerada manualmente pela agenda de locacoes.",
      });
      setRentals((current) =>
        current.map((item) => (item.id === rental.id ? response.rental : item)),
      );
    } catch (chargeError) {
      setError(
        chargeError instanceof Error
          ? chargeError.message
          : "Nao foi possivel gerar a proxima cobranca.",
      );
    } finally {
      setRunningAction(null);
    }
  }

  function shiftSelectedDate(days: number) {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() + days);
      return next;
    });
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module} fullBleed hideHeader>
      <section className="hidden">
        <div>
          <p className="text-sm font-semibold">Agenda operacional e locacoes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize visitas, retornos, reunioes e formalize locacoes com contrato, inquilino e
            primeira cobranca.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:flex">
          <Button type="button" variant="outline" onClick={() => void refreshAgenda()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void generateDueCharges()}
            disabled={runningAction === "generate-due"}
          >
            {runningAction === "generate-due" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <WalletCards className="mr-2 h-4 w-4" />
            )}
            Cobranças do período
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowAppointmentForm((v) => !v)}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Evento
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowAppointmentForm(true)}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Tarefa
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowAppointmentForm(true)}>
            <Clock3 className="mr-2 h-4 w-4" />
            Agendamento de horário
          </Button>
          <Button type="button" onClick={() => setShowRentalForm((v) => !v)}>
            <Home className="mr-2 h-4 w-4" />
            Nova locacao
          </Button>
        </div>
      </section>

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="hidden">
          Modo visualizacao ativo: agenda e locacoes ficam apenas neste navegador. Em producao, tudo
          passa pelo backend com assinatura e empresa validadas.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {showAppointmentForm ? (
        <AppointmentForm
          leads={leads}
          properties={properties}
          assignedTo={session?.access.appUser.id}
          onCancel={() => setShowAppointmentForm(false)}
          onCreated={(appointment) => {
            setAppointments((current) => [appointment, ...current]);
            setShowAppointmentForm(false);
          }}
        />
      ) : null}

      {showRentalForm ? (
        <RentalForm
          leads={leads}
          properties={properties}
          onCancel={() => setShowRentalForm(false)}
          onCreated={(rental) => {
            setRentals((current) => [rental, ...current]);
            setShowRentalForm(false);
            void refreshAgenda();
          }}
        />
      ) : null}

      {isAgendaLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando agenda...
        </section>
      ) : (
        <GoogleCalendarWorkspace
          selectedDate={selectedDate}
          appointments={appointments}
          selectedDayAppointments={selectedDayAppointments}
          rentals={rentals}
          activeAppointments={activeAppointments.length}
          completedAppointments={completedAppointments.length}
          currentUser={session?.access.appUser}
          runningAction={runningAction}
          onSelectDate={setSelectedDate}
          onToday={() => setSelectedDate(new Date())}
          onPreviousWeek={() => shiftSelectedDate(-7)}
          onNextWeek={() => shiftSelectedDate(7)}
          onStatusChange={changeAppointmentStatus}
          onGenerateCharge={generateRentalCharge}
          onAppointmentChanged={(appointment) =>
            setAppointments((current) => {
              const exists = current.some((item) => item.id === appointment.id);
              return exists
                ? current.map((item) => (item.id === appointment.id ? appointment : item))
                : [appointment, ...current];
            })
          }
          onAppointmentDeleted={(appointmentId) =>
            setAppointments((current) => current.filter((item) => item.id !== appointmentId))
          }
        />
      )}
    </ModulePage>
  );
}

function GoogleCalendarWorkspace({
  selectedDate,
  appointments,
  selectedDayAppointments,
  rentals,
  activeAppointments,
  completedAppointments,
  currentUser,
  runningAction,
  onSelectDate,
  onToday,
  onPreviousWeek,
  onNextWeek,
  onStatusChange,
  onGenerateCharge,
  onAppointmentChanged,
  onAppointmentDeleted,
}: {
  selectedDate: Date;
  appointments: Appointment[];
  selectedDayAppointments: Appointment[];
  rentals: RentalAgreement[];
  activeAppointments: number;
  completedAppointments: number;
  currentUser?: { id: string; name: string; email: string; role: string; permissions: string[] };
  runningAction: string | null;
  onSelectDate: (date: Date) => void;
  onToday: () => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onStatusChange: (appointment: Appointment, status: Appointment["status"]) => void;
  onGenerateCharge: (rental: RentalAgreement) => void;
  onAppointmentChanged: (appointment: Appointment) => void;
  onAppointmentDeleted: (appointmentId: string) => void;
}) {
  const weekDays = buildWeekDays(selectedDate);
  const monthDays = buildMonthDays(selectedDate);
  const hours = Array.from({ length: 23 }, (_, index) => index + 1);
  const activeRentals = rentals.filter((rental) => rental.status === "active");
  const now = new Date();
  const currentDayIndex = weekDays.findIndex((day) => isSameCalendarDay(day, now));
  const selectedMonthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(selectedDate);
  const currentTimeTop = ((now.getHours() - 1) * 64) + (now.getMinutes() / 60) * 64;
  const [activePanel, setActivePanel] = useState<CalendarPanel | null>(null);
  const [noteLists, setNoteLists] = useState<NoteList[]>([]);
  const [quickTasks, setQuickTasks] = useState<QuickTask[]>([]);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("Semana");
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [emailAppointment, setEmailAppointment] = useState<Appointment | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [draggedAppointmentId, setDraggedAppointmentId] = useState<string | null>(null);
  const [dayRangeStart, setDayRangeStart] = useState<Date | null>(null);
  const [dayRangeEnd, setDayRangeEnd] = useState<Date | null>(null);
  const [timeRangeSelection, setTimeRangeSelection] = useState<TimeRangeSelection>(null);
  const [yearPreviewDate, setYearPreviewDate] = useState<Date | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [agendaSearch, setAgendaSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [isMyAgendasOpen, setIsMyAgendasOpen] = useState(true);
  const [isOtherAgendasOpen, setIsOtherAgendasOpen] = useState(true);
  const [visibleAgendaFilters, setVisibleAgendaFilters] = useState<AgendaFilterKey[]>([
    "events",
    "tasks",
    "bookings",
    "scheduled",
    "confirmed",
    "completed",
  ]);
  const employees = useMemo(() => {
    const people = new Map<string, { id: string; name: string; email: string; role?: string }>();

    if (currentUser) {
      people.set(currentUser.id, {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
      });
    }

    appointments.forEach((appointment) => {
      if (appointment.users) {
        people.set(appointment.users.id, {
          id: appointment.users.id,
          name: appointment.users.name,
          email: appointment.users.email,
          role: "Equipe",
        });
      }
    });

    return [...people.values()];
  }, [appointments, currentUser]);
  const searchedAppointments = useMemo(
    () => filterAppointmentsForSearch(appointments, agendaSearch),
    [appointments, agendaSearch],
  );
  const filteredAppointments = useMemo(
    () => filterAppointmentsByAgendaFilters(searchedAppointments, visibleAgendaFilters),
    [searchedAppointments, visibleAgendaFilters],
  );
  const agendaFilterOptions = useMemo(
    () => buildAgendaFilterOptions(searchedAppointments),
    [searchedAppointments],
  );
  const filteredEmployees = useMemo(
    () => employees.filter((employee) => searchMatches([employee.name, employee.email, employee.role], peopleSearch)),
    [employees, peopleSearch],
  );
  const addressSuggestions = useMemo(() => buildAddressSuggestions(appointments, rentals), [appointments, rentals]);

  function toggleAgendaFilter(filter: AgendaFilterKey) {
    setVisibleAgendaFilters((current) =>
      current.includes(filter)
        ? current.filter((item) => item !== filter)
        : [...current, filter],
    );
  }

  function openDraft(date: Date, hour: number, mode: QuickScheduleMode = "event") {
    const startsAt = new Date(date);
    startsAt.setHours(hour, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(startsAt.getHours() + 1);
    setWorkspaceError(null);
    setSelectedAppointment(null);
    setCalendarDraft(createCalendarDraft(startsAt, endsAt, employees[0]?.id ?? "", mode));
  }

  function openDraftForRange(date: Date, startHour: number, endHour: number, mode: QuickScheduleMode = "event") {
    const firstHour = Math.min(startHour, endHour);
    const lastHour = Math.max(startHour, endHour);
    const startsAt = new Date(date);
    startsAt.setHours(firstHour, 0, 0, 0);
    const endsAt = new Date(date);
    endsAt.setHours(Math.min(24, lastHour + 1), 0, 0, 0);
    setWorkspaceError(null);
    setSelectedAppointment(null);
    setCalendarDraft(createCalendarDraft(startsAt, endsAt, employees[0]?.id ?? "", mode));
  }

  function openDayDraft(date: Date, mode: QuickScheduleMode = "event", endDate?: Date) {
    const startsAt = new Date(date);
    startsAt.setHours(0, 0, 0, 0);
    const endsAt = new Date(endDate ?? date);
    endsAt.setHours(23, 59, 0, 0);
    setWorkspaceError(null);
    setSelectedAppointment(null);
    setCalendarDraft({
      ...createCalendarDraft(startsAt, endsAt, employees[0]?.id ?? "", mode),
      allDay: true,
    });
  }

  function finishDayRangeSelection() {
    if (!dayRangeStart) return;
    const start = dayRangeStart <= (dayRangeEnd ?? dayRangeStart) ? dayRangeStart : (dayRangeEnd ?? dayRangeStart);
    const end = dayRangeStart <= (dayRangeEnd ?? dayRangeStart) ? (dayRangeEnd ?? dayRangeStart) : dayRangeStart;
    openDayDraft(start, "event", end);
    setDayRangeStart(null);
    setDayRangeEnd(null);
  }

  function startTimeRangeSelection(event: MouseEvent, date: Date, hour: number) {
    event.preventDefault();
    setTimeRangeSelection({ date, startHour: hour, endHour: hour });
  }

  function updateTimeRangeSelection(date: Date, hour: number) {
    setTimeRangeSelection((current) =>
      current && isSameCalendarDay(current.date, date)
        ? { ...current, endHour: hour }
        : current,
    );
  }

  function finishTimeRangeSelection(date: Date, hour: number) {
    setTimeRangeSelection((current) => {
      if (!current || !isSameCalendarDay(current.date, date)) return null;
      openDraftForRange(date, current.startHour, hour);
      return null;
    });
  }

  async function saveDraft() {
    if (!calendarDraft) return;
    setIsSavingDraft(true);
    setWorkspaceError(null);

    try {
      const metadata = {
        calendar_mode: calendarDraft.mode,
        all_day: calendarDraft.allDay,
        repeat: calendarDraft.repeat,
        custom_repeat: calendarDraft.repeat === "Personalizar..." ? calendarDraft.customRepeat : null,
        visibility: calendarDraft.visibility,
        reminder: calendarDraft.reminder,
        reminder_channel: calendarDraft.reminderChannel,
        attachment_name: calendarDraft.attachmentName || null,
        due_date: calendarDraft.dueDate || null,
        linked_task_list_id: calendarDraft.linkedTaskListId || null,
      };

      const payload = {
        assigned_to: calendarDraft.assignedTo || undefined,
        appointment_type: calendarDraft.mode === "task" ? "follow_up" : calendarDraft.mode === "booking" ? "visit" : "meeting",
        title: calendarDraft.title || defaultDraftTitle(calendarDraft.mode),
        description: calendarDraft.description,
        location_text: calendarDraft.location,
        starts_at: toIsoDateTime(calendarDraft.startsAt),
        ends_at: calendarDraft.allDay ? undefined : toIsoDateTime(calendarDraft.endsAt),
        reminder_at: calculateReminderAt(calendarDraft.startsAt, calendarDraft.reminder),
        metadata,
      };

      const response = calendarDraft.appointmentId
        ? await updateAppointment(calendarDraft.appointmentId, payload)
        : await createAppointment(payload);

      const appointmentWithMetadata = { ...response.appointment, metadata };
      setWorkspaceError(null);
      onAppointmentChanged(appointmentWithMetadata);
      setCalendarDraft(null);
    } catch (draftError) {
      setWorkspaceError(draftError instanceof Error ? draftError.message : "Nao foi possivel salvar o agendamento.");
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function removeAppointment(appointment: Appointment) {
    setWorkspaceError(null);
    try {
      await deleteAppointment(appointment.id);
      onAppointmentDeleted(appointment.id);
      setSelectedAppointment(null);
    } catch (deleteError) {
      setWorkspaceError(deleteError instanceof Error ? deleteError.message : "Nao foi possivel excluir este agendamento.");
    }
  }

  function openEmailDialog(appointment: Appointment) {
    setEmailAppointment(appointment);
    setEmailDraft({
      recipients: appointment.users?.email ?? "",
      copyMe: true,
      subject: appointment.title ? `Agenda: ${appointment.title}` : "Agenda ImobiFlow",
      message: buildAppointmentEmailMessage(appointment),
    });
  }

  async function moveAppointmentTo(appointmentId: string, date: Date, hour: number) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;

    const previousStart = new Date(appointment.starts_at);
    const previousEnd = appointment.ends_at ? new Date(appointment.ends_at) : null;
    const durationMs = previousEnd ? Math.max(30 * 60 * 1000, previousEnd.getTime() - previousStart.getTime()) : 60 * 60 * 1000;
    const nextStart = new Date(date);
    nextStart.setHours(hour, previousStart.getMinutes(), 0, 0);
    const nextEnd = new Date(nextStart.getTime() + durationMs);

    setWorkspaceError(null);
    try {
      const response = await updateAppointment(appointmentId, {
        starts_at: nextStart.toISOString(),
        ends_at: nextEnd.toISOString(),
      });
      onAppointmentChanged(response.appointment);
    } catch (moveError) {
      setWorkspaceError(moveError instanceof Error ? moveError.message : "Nao foi possivel mover o compromisso.");
    }
  }

  return (
    <div className="h-[calc(100dvh-4rem)] w-full overflow-hidden bg-[#f8fafd] text-[#202124]">
      <div
        className="grid h-full"
        style={{
          gridTemplateColumns: activePanel
            ? "240px minmax(0, 1fr) 360px 52px"
            : "240px minmax(0, 1fr) 52px",
        }}
      >
        <aside className="overflow-y-auto bg-[#f8fafd] px-4 py-3">
          <div className="mb-6 flex items-center gap-3">
            <span className="text-2xl text-[#3c4043]">Agenda</span>
          </div>

          <div className="relative mb-7">
            <button
              type="button"
              onClick={() => setIsCreateMenuOpen((value) => !value)}
              className="inline-flex h-14 items-center gap-3 rounded-2xl bg-white px-5 text-sm font-semibold shadow-md transition hover:shadow-lg"
            >
              <Plus className="h-5 w-5" />
              Criar
              <ChevronDown className="h-4 w-4" />
            </button>
            {isCreateMenuOpen ? (
              <div className="absolute left-0 top-16 z-30 w-56 rounded-2xl border border-[#dadce0] bg-white p-2 text-sm shadow-xl">
                {[
                  ["event", "Evento"],
                  ["task", "Tarefa"],
                  ["booking", "Agendamento de horario"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      openDraft(selectedDate, Math.max(new Date().getHours(), 9), mode as QuickScheduleMode);
                      setIsCreateMenuOpen(false);
                    }}
                    className="block w-full rounded-xl px-3 py-2 text-left hover:bg-[#f1f3f4]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mb-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold capitalize">{selectedMonthLabel}</p>
              <div className="flex gap-1">
                <button type="button" onClick={onPreviousWeek} className="rounded-full p-1 hover:bg-black/5">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={onNextWeek} className="rounded-full p-1 hover:bg-black/5">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-y-2 text-center text-[11px]">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                <span key={`${day}-${index}`} className="font-medium text-[#3c4043]">{day}</span>
              ))}
              {monthDays.map((date) => {
                const inMonth = date.getMonth() === selectedDate.getMonth();
                const selected = isSameCalendarDay(date, selectedDate);
                const hasEvent = appointments.some((appointment) => isSameCalendarDay(new Date(appointment.starts_at), date));
                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => onSelectDate(date)}
                    className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition ${
                      selected ? "bg-[#1a73e8] font-semibold text-white" : "hover:bg-black/5"
                    } ${inMonth ? "text-[#202124]" : "text-[#70757a]"}`}
                  >
                    {date.getDate()}
                    {hasEvent ? (
                      <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-[#1a73e8]"}`} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="mb-5 flex h-10 w-full items-center gap-3 rounded-md bg-[#e8f0fe] px-3 text-sm text-[#3c4043]">
            <UserRound className="h-5 w-5 text-[#5f6368]" />
            <input
              value={peopleSearch}
              onChange={(event) => setPeopleSearch(event.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#5f6368]"
              placeholder="Pesquisar pessoas"
            />
          </label>
          {peopleSearch ? (
            <div className="mb-5 space-y-1 rounded-xl border border-[#dadce0] bg-white p-2 text-xs shadow-sm">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((employee) => (
                  <button key={employee.id} type="button" className="block w-full rounded-lg px-2 py-2 text-left hover:bg-[#f1f3f4]">
                    <span className="block font-semibold">{employee.name}</span>
                    <span className="text-[#5f6368]">{employee.email}</span>
                  </button>
                ))
              ) : (
                <span className="block px-2 py-2 text-[#5f6368]">Nenhuma pessoa encontrada.</span>
              )}
            </div>
          ) : null}

          <AgendaGroup
            title="Minhas agendas"
            description="Escolha quais agendas aparecem na grade."
            items={agendaFilterOptions.slice(0, 3)}
            selectedItems={visibleAgendaFilters}
            isOpen={isMyAgendasOpen}
            onToggle={() => setIsMyAgendasOpen((value) => !value)}
            onItemToggle={toggleAgendaFilter}
          />
          <div className="mt-6">
            <AgendaGroup
              title="Filtros de status"
              description="Controle agendas agendadas, confirmadas ou concluídas."
              items={agendaFilterOptions.slice(3)}
              selectedItems={visibleAgendaFilters}
              muted
              isOpen={isOtherAgendasOpen}
              onToggle={() => setIsOtherAgendasOpen((value) => !value)}
              onItemToggle={toggleAgendaFilter}
            />
          </div>

        </aside>

        <main className="min-w-0 bg-[#f8fafd]">
          <div className="flex h-[60px] items-center justify-between px-5">
            <div className="flex items-center gap-4">
              <button type="button" onClick={onToday} className="h-10 rounded-full border border-[#dadce0] bg-white px-6 text-sm font-medium hover:bg-[#f1f3f4]">
                Hoje
              </button>
              <div className="flex items-center gap-1">
                <button type="button" onClick={onPreviousWeek} className="rounded-full p-2 hover:bg-black/5">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button type="button" onClick={onNextWeek} className="rounded-full p-2 hover:bg-black/5">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
              <h1 className="text-2xl capitalize text-[#202124]">{selectedMonthLabel}</h1>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex h-10 w-64 items-center gap-2 rounded-full border border-[#dadce0] bg-white px-4 text-sm">
                <Search className="h-4 w-4 text-[#3c4043]" />
                <input
                  value={agendaSearch}
                  onChange={(event) => setAgendaSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  placeholder="Pesquisar agenda"
                />
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsViewMenuOpen((value) => !value)}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[#dadce0] bg-white px-4 text-sm font-medium"
                >
                  {viewMode}
                  <ChevronDown className="h-4 w-4" />
                </button>
                {isViewMenuOpen ? (
                  <div className="absolute right-0 top-12 z-30 w-44 rounded-2xl border border-[#dadce0] bg-white p-2 text-sm shadow-xl">
                    {(["Dia", "Semana", "Mes", "Ano"] as CalendarViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setViewMode(mode);
                          setIsViewMenuOpen(false);
                        }}
                        className={`block w-full rounded-xl px-3 py-2 text-left hover:bg-[#f1f3f4] ${viewMode === mode ? "font-semibold text-[#1a73e8]" : ""}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="inline-flex h-10 overflow-hidden rounded-full border border-[#dadce0] bg-white">
                <button type="button" onClick={() => setActivePanel(null)} className="flex w-12 items-center justify-center bg-[#c2e7ff]">
                  <CalendarDays className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => setActivePanel("tasks")} className="flex w-12 items-center justify-center">
                  <CheckCircle2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {workspaceError ? (
            <div className="mx-5 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {workspaceError}
            </div>
          ) : null}

          <section className="h-[calc(100dvh-7.75rem)] overflow-auto rounded-t-[28px] bg-white shadow-sm">
            {viewMode === "Semana" ? (
              <WeekCalendarGrid
                days={weekDays}
                hours={hours}
                appointments={filteredAppointments}
                selectedDate={selectedDate}
                calendarDraft={calendarDraft}
                draggedAppointmentId={draggedAppointmentId}
                dayRangeStart={dayRangeStart}
                dayRangeEnd={dayRangeEnd}
                timeRangeSelection={timeRangeSelection}
                onSelectDate={onSelectDate}
                onSelectAppointment={setSelectedAppointment}
                onOpenDraft={openDraft}
                onMoveAppointment={moveAppointmentTo}
                onDragAppointment={setDraggedAppointmentId}
                onDayRangeStart={(date) => {
                  setDayRangeStart(date);
                  setDayRangeEnd(date);
                }}
                onDayRangeEnter={(date) => {
                  if (dayRangeStart) setDayRangeEnd(date);
                }}
                onDayRangeFinish={finishDayRangeSelection}
                onTimeRangeStart={startTimeRangeSelection}
                onTimeRangeEnter={updateTimeRangeSelection}
                onTimeRangeFinish={finishTimeRangeSelection}
              />
            ) : null}

            {viewMode === "Dia" ? (
              <DayCalendarGrid
                date={selectedDate}
                hours={hours}
                appointments={filteredAppointments}
                calendarDraft={calendarDraft}
                timeRangeSelection={timeRangeSelection}
                draggedAppointmentId={draggedAppointmentId}
                onSelectAppointment={setSelectedAppointment}
                onOpenDraft={openDraft}
                onMoveAppointment={moveAppointmentTo}
                onDragAppointment={setDraggedAppointmentId}
                onTimeRangeStart={startTimeRangeSelection}
                onTimeRangeEnter={updateTimeRangeSelection}
                onTimeRangeFinish={finishTimeRangeSelection}
              />
            ) : null}

            {viewMode === "Mes" ? (
              <MonthCalendarGrid
                days={monthDays}
                selectedDate={selectedDate}
                appointments={filteredAppointments}
                onSelectDate={onSelectDate}
                onOpenDayDraft={openDayDraft}
                onSelectAppointment={setSelectedAppointment}
              />
            ) : null}

            {viewMode === "Ano" ? (
              <YearCalendarGrid
                selectedDate={selectedDate}
                appointments={filteredAppointments}
                previewDate={yearPreviewDate}
                onPreviewDate={(date) => {
                  setYearPreviewDate(date);
                  onSelectDate(date);
                }}
                onOpenDay={(date) => {
                  onSelectDate(date);
                  setViewMode("Dia");
                }}
              />
            ) : null}
          </section>

          <div className="hidden">
            {selectedDayAppointments.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                runningAction={runningAction}
                onStatusChange={onStatusChange}
              />
            ))}
            {rentals.map((rental) => (
              <RentalCard
                key={rental.id}
                rental={rental}
                runningAction={runningAction}
                onGenerateCharge={onGenerateCharge}
              />
            ))}
            {activeAppointments}
            {completedAppointments}
            {activeRentals.length}
          </div>
        </main>

        {calendarDraft ? (
          <CalendarDraftDialog
            draft={calendarDraft}
            employees={employees}
            noteLists={noteLists}
            addressSuggestions={addressSuggestions}
            isSaving={isSavingDraft}
            onChange={setCalendarDraft}
            onClose={() => setCalendarDraft(null)}
            onSave={() => void saveDraft()}
          />
        ) : null}

        {selectedAppointment ? (
          <AppointmentDetailsDialog
            appointment={selectedAppointment}
            onClose={() => setSelectedAppointment(null)}
            onEdit={() => {
              setCalendarDraft(createCalendarDraftFromAppointment(selectedAppointment));
              setSelectedAppointment(null);
            }}
            onDelete={() => void removeAppointment(selectedAppointment)}
            onEmail={() => openEmailDialog(selectedAppointment)}
          />
        ) : null}

        {emailAppointment && emailDraft ? (
          <EmailGuestsDialog
            appointment={emailAppointment}
            draft={emailDraft}
            onChange={setEmailDraft}
            onClose={() => {
              setEmailAppointment(null);
              setEmailDraft(null);
            }}
          />
        ) : null}

        {activePanel ? (
          <CalendarUtilityPanel
            activePanel={activePanel}
            noteLists={noteLists}
            quickTasks={quickTasks}
            employees={employees}
            appointments={appointments}
            onClose={() => setActivePanel(null)}
            onCreateNoteList={() =>
              setNoteLists((current) => [
                {
                  id: createClientId(),
                  title: `Lista ${current.length + 1}`,
                  items: [{ id: createClientId(), text: "Nova tarefa da lista", done: false }],
                  archived: false,
                },
                ...current,
              ])
            }
            onUpdateNoteList={(list) =>
              setNoteLists((current) => current.map((item) => (item.id === list.id ? list : item)))
            }
            onDeleteNoteList={(listId) =>
              setNoteLists((current) => current.filter((item) => item.id !== listId))
            }
            onCreateTask={() =>
              setQuickTasks((current) => [
                {
                  id: createClientId(),
                  title: "Nova tarefa",
                  details: "",
                  dueAt: null,
                  repeating: false,
                  starred: false,
                  done: false,
                  address: "",
                  assigneeId: employees[0]?.id ?? null,
                },
                ...current,
              ])
            }
            onUpdateTask={(task) =>
              setQuickTasks((current) => current.map((item) => (item.id === task.id ? task : item)))
            }
            onDeleteTask={(taskId) =>
              setQuickTasks((current) => current.filter((item) => item.id !== taskId))
            }
            onMoveTask={(taskId, targetId) =>
              setQuickTasks((current) => moveItemBefore(current, taskId, targetId))
            }
          />
        ) : null}

        <aside className="flex flex-col items-center gap-7 bg-[#f8fafd] py-5">
          <CalendarPanelButton
            label="Notas e listas"
            active={activePanel === "notes"}
            onClick={() => setActivePanel((current) => (current === "notes" ? null : "notes"))}
          >
            <StickyNote className="h-5 w-5 text-[#f9ab00]" />
          </CalendarPanelButton>
          <CalendarPanelButton
            label="Tarefas"
            active={activePanel === "tasks"}
            onClick={() => setActivePanel((current) => (current === "tasks" ? null : "tasks"))}
          >
            <CheckCircle2 className="h-5 w-5 text-[#1a73e8]" />
          </CalendarPanelButton>
          <CalendarPanelButton
            label="Funcionarios"
            active={activePanel === "people"}
            onClick={() => setActivePanel((current) => (current === "people" ? null : "people"))}
          >
            <UserRound className="h-5 w-5 text-[#1a73e8]" />
          </CalendarPanelButton>
          <CalendarPanelButton
            label="Rotas"
            active={activePanel === "maps"}
            onClick={() => setActivePanel((current) => (current === "maps" ? null : "maps"))}
          >
            <MapPinIcon />
          </CalendarPanelButton>
          <div className="h-px w-8 bg-[#dadce0]" />
        </aside>
      </div>
    </div>
  );
}

function WeekCalendarGrid({
  days,
  hours,
  appointments,
  selectedDate,
  calendarDraft,
  draggedAppointmentId,
  dayRangeStart,
  dayRangeEnd,
  timeRangeSelection,
  onSelectDate,
  onSelectAppointment,
  onOpenDraft,
  onMoveAppointment,
  onDragAppointment,
  onDayRangeStart,
  onDayRangeEnter,
  onDayRangeFinish,
  onTimeRangeStart,
  onTimeRangeEnter,
  onTimeRangeFinish,
}: {
  days: Date[];
  hours: number[];
  appointments: Appointment[];
  selectedDate: Date;
  calendarDraft: CalendarDraft | null;
  draggedAppointmentId: string | null;
  dayRangeStart: Date | null;
  dayRangeEnd: Date | null;
  timeRangeSelection: TimeRangeSelection;
  onSelectDate: (date: Date) => void;
  onSelectAppointment: (appointment: Appointment) => void;
  onOpenDraft: (date: Date, hour: number) => void;
  onMoveAppointment: (appointmentId: string, date: Date, hour: number) => Promise<void>;
  onDragAppointment: (appointmentId: string | null) => void;
  onDayRangeStart: (date: Date) => void;
  onDayRangeEnter: (date: Date) => void;
  onDayRangeFinish: () => void;
  onTimeRangeStart: (event: MouseEvent, date: Date, hour: number) => void;
  onTimeRangeEnter: (date: Date, hour: number) => void;
  onTimeRangeFinish: (date: Date, hour: number) => void;
}) {
  return (
    <div className="min-w-[1180px]">
      <div className="grid grid-cols-[68px_repeat(7,minmax(130px,1fr))] border-b border-[#dadce0]">
        <div className="flex items-end justify-end px-2 pb-2 text-[11px] font-medium text-[#3c4043]">GMT-03</div>
        {days.map((date) => {
          const selected = isSameCalendarDay(date, selectedDate);
          const inRange = dayRangeStart && isDateInsideRange(date, dayRangeStart, dayRangeEnd ?? dayRangeStart);
          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDate(date)}
              onMouseDown={() => onDayRangeStart(date)}
              onMouseEnter={() => onDayRangeEnter(date)}
              onMouseUp={onDayRangeFinish}
              className={`h-[84px] border-l border-[#e0e3eb] px-3 pt-3 text-center ${inRange ? "bg-[#e8f0fe]" : ""}`}
            >
              <p className={`text-[11px] font-medium uppercase ${selected ? "text-[#1a73e8]" : "text-[#3c4043]"}`}>
                {new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "")}
              </p>
              <span className={`mt-1 inline-flex h-12 w-12 items-center justify-center rounded-full text-3xl ${
                selected ? "bg-[#1a73e8] text-white" : "text-[#3c4043]"
              }`}>
                {date.getDate()}
              </span>
              <span className={`mt-1 block h-2 rounded-full ${inRange ? "bg-[#1a73e8]" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
      <div className="relative grid grid-cols-[68px_repeat(7,minmax(130px,1fr))]">
        {hours.map((hour) => (
          <div key={hour} className="contents">
            <div className="h-16 border-b border-[#dadce0] pr-2 pt-1 text-right text-xs text-[#3c4043]">
              {formatAgendaHour(hour)}
            </div>
            {days.map((date) => {
              const hourEvents = layoutTimedEventsForDay(appointments, date).filter((item) => item.startHour === hour);
              const isDraftCell =
                calendarDraft &&
                !calendarDraft.allDay &&
                isSameCalendarDay(new Date(calendarDraft.startsAt), date) &&
                new Date(calendarDraft.startsAt).getHours() === hour;
              const isSelectionStart =
                timeRangeSelection &&
                isSameCalendarDay(timeRangeSelection.date, date) &&
                Math.min(timeRangeSelection.startHour, timeRangeSelection.endHour) === hour;
              return (
                <button
                  key={`${date.toISOString()}-${hour}`}
                  type="button"
                  onDoubleClick={() => onOpenDraft(date, hour)}
                  onMouseDown={(event) => onTimeRangeStart(event, date, hour)}
                  onMouseEnter={() => onTimeRangeEnter(date, hour)}
                  onMouseUp={() => onTimeRangeFinish(date, hour)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedAppointmentId) void onMoveAppointment(draggedAppointmentId, date, hour);
                    onDragAppointment(null);
                  }}
                  className="relative h-16 border-b border-l border-[#e0e3eb] text-left hover:bg-[#f8fbff]"
                >
                  {isSelectionStart ? (
                    <CalendarGhostBlock selection={timeRangeSelection} />
                  ) : null}
                  {isDraftCell ? (
                    <span
                      className="absolute left-1 right-1 z-10 rounded-md border-l-4 border-[#188038] bg-[#e6f4ea] px-2 py-1 text-xs font-medium text-[#137333]"
                      style={{
                        top: 2 + (new Date(calendarDraft.startsAt).getMinutes() / 60) * 56,
                        height: Math.max(24, calendarDraftHeight(calendarDraft)),
                      }}
                    >
                      {calendarDraft.title || defaultDraftTitle(calendarDraft.mode)}
                    </span>
                  ) : null}
                  {hourEvents.map(({ appointment, lane, laneCount }) => (
                    <CalendarTimedEvent
                      key={appointment.id}
                      appointment={appointment}
                      lane={lane}
                      laneCount={laneCount}
                      onDragAppointment={onDragAppointment}
                      onSelectAppointment={onSelectAppointment}
                      onSelectDate={onSelectDate}
                    />
                  ))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCalendarGrid({
  date,
  hours,
  appointments,
  calendarDraft,
  timeRangeSelection,
  draggedAppointmentId,
  onSelectAppointment,
  onOpenDraft,
  onMoveAppointment,
  onDragAppointment,
  onTimeRangeStart,
  onTimeRangeEnter,
  onTimeRangeFinish,
}: {
  date: Date;
  hours: number[];
  appointments: Appointment[];
  calendarDraft: CalendarDraft | null;
  timeRangeSelection: TimeRangeSelection;
  draggedAppointmentId: string | null;
  onSelectAppointment: (appointment: Appointment) => void;
  onOpenDraft: (date: Date, hour: number) => void;
  onMoveAppointment: (appointmentId: string, date: Date, hour: number) => Promise<void>;
  onDragAppointment: (appointmentId: string | null) => void;
  onTimeRangeStart: (event: MouseEvent, date: Date, hour: number) => void;
  onTimeRangeEnter: (date: Date, hour: number) => void;
  onTimeRangeFinish: (date: Date, hour: number) => void;
}) {
  const dayEvents = layoutTimedEventsForDay(appointments, date);

  return (
    <div className="min-w-[760px]">
      <div className="grid grid-cols-[68px_minmax(0,1fr)] border-b border-[#dadce0]">
        <div className="flex items-end justify-end px-2 pb-2 text-[11px] font-medium text-[#3c4043]">GMT-03</div>
        <div className="h-[84px] border-l border-[#e0e3eb] px-4 pt-3 text-center">
          <p className="text-[11px] font-medium uppercase text-[#1a73e8]">
            {new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "")}
          </p>
          <span className="mt-1 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1a73e8] text-3xl text-white">
            {date.getDate()}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-[68px_minmax(0,1fr)]">
        {hours.map((hour) => {
          const hourEvents = dayEvents.filter((item) => item.startHour === hour);
          const isDraftCell =
            calendarDraft &&
            !calendarDraft.allDay &&
            isSameCalendarDay(new Date(calendarDraft.startsAt), date) &&
            new Date(calendarDraft.startsAt).getHours() === hour;
          const isSelectionStart =
            timeRangeSelection &&
            isSameCalendarDay(timeRangeSelection.date, date) &&
            Math.min(timeRangeSelection.startHour, timeRangeSelection.endHour) === hour;

          return (
            <div key={hour} className="contents">
              <div className="h-16 border-b border-[#dadce0] pr-2 pt-1 text-right text-xs text-[#3c4043]">
                {formatAgendaHour(hour)}
              </div>
              <button
                type="button"
                onDoubleClick={() => onOpenDraft(date, hour)}
                onMouseDown={(event) => onTimeRangeStart(event, date, hour)}
                onMouseEnter={() => onTimeRangeEnter(date, hour)}
                onMouseUp={() => onTimeRangeFinish(date, hour)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedAppointmentId) void onMoveAppointment(draggedAppointmentId, date, hour);
                  onDragAppointment(null);
                }}
                className="relative h-16 border-b border-l border-[#e0e3eb] text-left hover:bg-[#f8fbff]"
              >
                {isSelectionStart ? <CalendarGhostBlock selection={timeRangeSelection} /> : null}
                {isDraftCell ? (
                  <span
                    className="absolute left-2 right-2 z-10 rounded-md border-l-4 border-[#188038] bg-[#e6f4ea] px-2 py-1 text-xs font-medium text-[#137333]"
                    style={{
                      top: 2 + (new Date(calendarDraft.startsAt).getMinutes() / 60) * 56,
                      height: Math.max(24, calendarDraftHeight(calendarDraft)),
                    }}
                  >
                    {calendarDraft.title || defaultDraftTitle(calendarDraft.mode)}
                  </span>
                ) : null}
                {hourEvents.map(({ appointment, lane, laneCount }) => (
                  <CalendarTimedEvent
                    key={appointment.id}
                    appointment={appointment}
                    lane={lane}
                    laneCount={laneCount}
                    wide
                    onDragAppointment={onDragAppointment}
                    onSelectAppointment={onSelectAppointment}
                    onSelectDate={() => {}}
                  />
                ))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthCalendarGrid({
  days,
  selectedDate,
  appointments,
  onSelectDate,
  onOpenDayDraft,
  onSelectAppointment,
}: {
  days: Date[];
  selectedDate: Date;
  appointments: Appointment[];
  onSelectDate: (date: Date) => void;
  onOpenDayDraft: (date: Date) => void;
  onSelectAppointment: (appointment: Appointment) => void;
}) {
  return (
    <div className="min-w-[980px]">
      <div className="grid grid-cols-7 border-b border-[#dadce0] text-center text-xs font-semibold uppercase text-[#3c4043]">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => (
          <div key={day} className="border-l border-[#e0e3eb] py-3">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const dayAppointments = appointments.filter((appointment) => isSameCalendarDay(new Date(appointment.starts_at), date));
          const inMonth = date.getMonth() === selectedDate.getMonth();
          const selected = isSameCalendarDay(date, selectedDate);
          return (
            <div
              key={date.toISOString()}
              className={`min-h-[132px] border-b border-l border-[#e0e3eb] p-2 ${inMonth ? "bg-white" : "bg-[#f8fafd] text-[#70757a]"}`}
            >
              <button
                type="button"
                onClick={() => onSelectDate(date)}
                onDoubleClick={() => onOpenDayDraft(date)}
                className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-sm ${selected ? "bg-[#1a73e8] text-white" : "hover:bg-[#f1f3f4]"}`}
              >
                {date.getDate()}
              </button>
              <div className="space-y-1">
                {dayAppointments.slice(0, 4).map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => onSelectAppointment(appointment)}
                    className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-[#f1f3f4]"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#1a73e8]" />
                    <span className="truncate">{appointment.title || "(Sem titulo)"}</span>
                  </button>
                ))}
                {dayAppointments.length > 4 ? (
                  <p className="px-1 text-[11px] text-[#5f6368]">+{dayAppointments.length - 4} outros</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearCalendarGrid({
  selectedDate,
  appointments,
  previewDate,
  onPreviewDate,
  onOpenDay,
}: {
  selectedDate: Date;
  appointments: Appointment[];
  previewDate: Date | null;
  onPreviewDate: (date: Date) => void;
  onOpenDay: (date: Date) => void;
}) {
  const months = Array.from({ length: 12 }, (_, month) => new Date(selectedDate.getFullYear(), month, 1));
  const activePreview = previewDate ?? selectedDate;
  const previewAppointments = appointments.filter((appointment) => isSameCalendarDay(new Date(appointment.starts_at), activePreview));

  return (
    <div className="grid min-w-[1180px] grid-cols-[minmax(0,1fr)_300px] gap-4 p-5">
      <div className="grid grid-cols-3 gap-4">
        {months.map((month) => (
          <div key={month.toISOString()} className="rounded-2xl border border-[#dadce0] bg-white p-3">
            <p className="mb-3 text-sm font-semibold capitalize">
              {new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(month)}
            </p>
            <div className="grid grid-cols-7 gap-y-1 text-center text-[10px]">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                <span key={`${day}-${index}`} className="text-[#5f6368]">{day}</span>
              ))}
              {buildMonthDays(month).map((date) => {
                const inMonth = date.getMonth() === month.getMonth();
                const selected = isSameCalendarDay(date, activePreview);
                const hasEvent = appointments.some((appointment) => isSameCalendarDay(new Date(appointment.starts_at), date));
                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => onPreviewDate(date)}
                    className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11px] ${
                      selected ? "bg-[#1a73e8] text-white" : "hover:bg-[#f1f3f4]"
                    } ${inMonth ? "text-[#202124]" : "text-[#9aa0a6]"}`}
                  >
                    {date.getDate()}
                    {hasEvent ? (
                      <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-[#1a73e8]"}`} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <aside className="sticky top-4 h-fit rounded-3xl border border-[#dadce0] bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold capitalize">{weekdayShort(activePreview)}.</p>
        <div className="mt-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1a73e8] text-2xl text-white">
          {activePreview.getDate()}
        </div>
        <div className="mt-5 space-y-2">
          {previewAppointments.length > 0 ? (
            previewAppointments.map((appointment) => (
              <button
                key={appointment.id}
                type="button"
                onClick={() => onOpenDay(activePreview)}
                className="block w-full rounded-xl bg-[#e8f0fe] px-3 py-2 text-left text-sm text-[#174ea6]"
              >
                {appointment.title || "(Sem titulo)"}
              </button>
            ))
          ) : (
            <p className="text-sm text-[#5f6368]">Não há eventos programados nesse dia.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenDay(activePreview)}
          className="mt-5 w-full rounded-full bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white"
        >
          Abrir dia
        </button>
      </aside>
    </div>
  );
}

function CalendarGhostBlock({ selection }: { selection: TimeRangeSelection }) {
  if (!selection) return null;
  const height = (Math.abs(selection.endHour - selection.startHour) + 1) * 64 - 4;
  return (
    <span
      className="pointer-events-none absolute left-1 right-1 z-20 rounded-md border-l-4 border-[#188038] bg-[#e6f4ea]/90 px-2 py-1 text-xs font-medium text-[#137333]"
      style={{ top: 2, height }}
    >
      Novo período
    </span>
  );
}

function CalendarTimedEvent({
  appointment,
  lane,
  laneCount,
  wide,
  onDragAppointment,
  onSelectAppointment,
  onSelectDate,
}: {
  appointment: Appointment;
  lane: number;
  laneCount: number;
  wide?: boolean;
  onDragAppointment: (appointmentId: string | null) => void;
  onSelectAppointment: (appointment: Appointment) => void;
  onSelectDate: (date: Date) => void;
}) {
  const start = new Date(appointment.starts_at);
  const top = 2 + (start.getMinutes() / 60) * 56;
  const height = Math.max(28, appointmentDurationHours(appointment) * 64 - 4);
  const gap = 4;
  const width = `calc((100% - ${gap * (laneCount + 1)}px) / ${laneCount})`;
  const left = `calc(${gap}px + (${width} + ${gap}px) * ${lane})`;

  return (
    <span
      draggable
      onDragStart={(event) => {
        event.stopPropagation();
        onDragAppointment(appointment.id);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelectAppointment(appointment);
        onSelectDate(start);
      }}
      className="absolute z-10 cursor-grab overflow-hidden rounded-md border-l-4 border-[#4285f4] bg-[#dfeaff] px-2 py-1 text-left text-xs text-[#202124] shadow-sm"
      style={{
        top,
        height,
        left: wide ? left : left,
        width: wide ? width : width,
      }}
    >
      <span className="block truncate font-medium">{appointment.title || "(Sem título)"}</span>
      <span className="block truncate">{formatCalendarEventTime(appointment.starts_at, appointment.ends_at)}</span>
    </span>
  );
}

function OpenStreetAddressInput({
  value,
  placeholder,
  fallbackSuggestions,
  onChange,
}: {
  value: string;
  placeholder: string;
  fallbackSuggestions: string[];
  onChange: (value: string) => void;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const query = inputValue.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    const fallback = fallbackSuggestions
      .filter((address) => normalizeSearchText(address).includes(normalizeSearchText(query)))
      .slice(0, 6)
      .map((address) => ({ id: address, label: address }));

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void searchOpenStreetAddresses(query, controller.signal)
        .then((openStreetSuggestions) => {
          setSuggestions(openStreetSuggestions.length > 0 ? openStreetSuggestions : fallback);
        })
        .catch(() => setSuggestions(fallback));
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [fallbackSuggestions, inputValue]);

  function selectSuggestion(suggestion: PlaceSuggestion) {
    setInputValue(suggestion.label);
    onChange(suggestion.label);
    setSuggestions([]);
    setIsFocused(false);
  }

  return (
    <div className="relative mt-4">
      <input
        value={inputValue}
        onFocus={() => setIsFocused(true)}
        onChange={(event) => {
          setInputValue(event.target.value);
          onChange(event.target.value);
        }}
        className="w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm"
        placeholder={placeholder}
      />
      {isFocused && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-11 z-[70] overflow-hidden rounded-xl border border-[#dadce0] bg-white text-sm shadow-xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
              className="block w-full px-3 py-2 text-left hover:bg-[#f1f3f4]"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}
      <p className="mt-1 text-[11px] text-[#5f6368]">
        Sugestoes por OpenStreetMap. Se nao aparecer, digite o endereco completo.
      </p>
    </div>
  );
}

function CalendarDraftDialog({
  draft,
  employees,
  noteLists,
  addressSuggestions,
  isSaving,
  onChange,
  onClose,
  onSave,
}: {
  draft: CalendarDraft;
  employees: Array<{ id: string; name: string; email: string; role?: string }>;
  noteLists: NoteList[];
  addressSuggestions: string[];
  isSaving: boolean;
  onChange: (draft: CalendarDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [showCustomRepeat, setShowCustomRepeat] = useState(draft.repeat === "Personalizar...");
  const repeatOptions = [
    "Nao se repete",
    "Todos os dias",
    `Semanal: cada ${weekdayLong(new Date(draft.startsAt))}`,
    `Mensal no(a) ${ordinalWeekOfMonth(new Date(draft.startsAt))} ${weekdayLong(new Date(draft.startsAt))}`,
    `Anual em ${new Intl.DateTimeFormat("pt-BR", { month: "long", day: "numeric" }).format(new Date(draft.startsAt))}`,
    "Todos os dias da semana (segunda a sexta-feira)",
    "Personalizar...",
  ];

  function update(next: Partial<CalendarDraft>) {
    onChange({ ...draft, ...next });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24">
      <div className="max-h-[82vh] w-[680px] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <label className="min-w-0 flex-1">
            <span className="text-xs font-semibold uppercase text-[#5f6368]">Nome do evento, tarefa ou agendamento</span>
            <input
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              className="mt-1 w-full border-b border-[#dadce0] px-1 py-2 text-2xl outline-none focus:border-[#1a73e8]"
              placeholder="Digite o nome"
            />
          </label>
          <button type="button" onClick={onClose} className="ml-3 rounded-full px-3 py-2 text-sm hover:bg-[#f1f3f4]">
            x
          </button>
        </div>

        <div className="mb-5 inline-flex rounded-full bg-[#f1f3f4] p-1 text-sm">
          {[
            ["event", "Evento"],
            ["task", "Tarefa"],
            ["booking", "Agendamento de horario"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => update({ mode: mode as QuickScheduleMode })}
              className={`rounded-full px-4 py-2 ${draft.mode === mode ? "bg-white font-semibold shadow-sm" : "text-[#5f6368]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#5f6368]">
            Inicio
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) => update({ startsAt: event.target.value })}
              className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm text-[#202124]"
            />
          </label>
          <label className="text-xs font-semibold text-[#5f6368]">
            Fim
            <input
              type="datetime-local"
              value={draft.endsAt}
              onChange={(event) => update({ endsAt: event.target.value })}
              disabled={draft.allDay}
              className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm text-[#202124] disabled:bg-[#f1f3f4]"
            />
          </label>
        </div>

        {draft.mode !== "booking" ? (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(event) => update({ allDay: event.target.checked })}
              className="h-4 w-4 accent-[#1a73e8]"
            />
            Dia inteiro
          </label>
        ) : null}

        {draft.mode !== "booking" ? (
          <select
            value={draft.repeat}
            onChange={(event) => {
              update({ repeat: event.target.value });
              setShowCustomRepeat(event.target.value === "Personalizar...");
            }}
            className="mt-3 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm"
          >
            {repeatOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : null}

        {showCustomRepeat ? (
          <CustomRepeatEditor draft={draft} onChange={update} onClose={() => setShowCustomRepeat(false)} />
        ) : null}

        {draft.mode === "task" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#5f6368]">
              Data de entrega
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => update({ dueDate: event.target.value })}
                className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm text-[#202124]"
              />
            </label>
            <label className="text-xs font-semibold text-[#5f6368]">
              Minhas tarefas
              <select
                value={draft.linkedTaskListId}
                onChange={(event) => update({ linkedTaskListId: event.target.value })}
                className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm text-[#202124]"
              >
                <option value="">Sem lista vinculada</option>
                {noteLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <label className="mt-4 block text-xs font-semibold text-[#5f6368]">
          Usuario ou funcionario
          <select
            value={draft.assignedTo}
            onChange={(event) => update({ assignedTo: event.target.value })}
            className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm text-[#202124]"
          >
            <option value="">Geral</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>

        {draft.mode === "event" ? (
          <>
            <OpenStreetAddressInput
              value={draft.location}
              fallbackSuggestions={addressSuggestions}
              onChange={(location) => update({ location })}
              placeholder="Adicionar localizacao"
            />
            <textarea
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
              className="mt-3 min-h-24 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm"
              placeholder="Adicionar descricao"
            />
            <label className="mt-3 block rounded-lg border border-dashed border-[#dadce0] px-3 py-3 text-sm text-[#5f6368]">
              Anexo
              <input
                type="file"
                className="mt-2 block w-full text-xs"
                onChange={(event) => update({ attachmentName: event.target.files?.[0]?.name ?? "" })}
              />
              {draft.attachmentName ? <span className="mt-1 block text-xs">{draft.attachmentName}</span> : null}
            </label>
            <select
              value={draft.visibility}
              onChange={(event) => update({ visibility: event.target.value as CalendarDraft["visibility"] })}
              className="mt-3 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm"
            >
              <option value="default">Visibilidade padrao</option>
              <option value="public">Publico</option>
              <option value="private">Particular</option>
            </select>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <select
                value={draft.reminder}
                onChange={(event) => update({ reminder: event.target.value })}
                className="rounded-lg border border-[#dadce0] px-3 py-2 text-sm"
              >
                {["Quando o evento comeca", "5 minutos antes", "10 minutos antes", "15 minutos antes", "30 minutos antes", "1 hora antes", "1 dia antes", "Personalizar..."].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {draft.reminder === "Personalizar..." ? (
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                  <input
                    value={draft.reminderCustomAmount}
                    onChange={(event) => update({ reminderCustomAmount: event.target.value })}
                    className="rounded-lg border border-[#dadce0] px-3 py-2 text-sm"
                    placeholder="Qtd."
                  />
                  <select
                    value={draft.reminderCustomUnit}
                    onChange={(event) => update({ reminderCustomUnit: event.target.value as CalendarDraft["reminderCustomUnit"] })}
                    className="rounded-lg border border-[#dadce0] px-2 py-2 text-sm"
                  >
                    <option value="minutes">min</option>
                    <option value="hours">horas</option>
                    <option value="days">dias</option>
                    <option value="weeks">semanas</option>
                  </select>
                  <select
                    value={draft.reminderChannel}
                    onChange={(event) => update({ reminderChannel: event.target.value as CalendarDraft["reminderChannel"] })}
                    className="rounded-lg border border-[#dadce0] px-2 py-2 text-sm"
                  >
                    <option value="app">App</option>
                    <option value="email">Email</option>
                  </select>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {draft.mode === "booking" ? (
          <p className="mt-4 rounded-lg bg-[#e8f0fe] px-3 py-3 text-sm text-[#1967d2]">
            Agendamento de horario associado ao usuario selecionado. Use o horario acima para definir a janela disponivel.
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-[#f1f3f4]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="rounded-lg bg-[#1a73e8] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomRepeatEditor({
  draft,
  onChange,
  onClose,
}: {
  draft: CalendarDraft;
  onChange: (next: Partial<CalendarDraft>) => void;
  onClose: () => void;
}) {
  const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];
  const custom = draft.customRepeat;

  function updateCustom(next: Partial<CalendarDraft["customRepeat"]>) {
    onChange({ customRepeat: { ...custom, ...next } });
  }

  return (
    <div className="mt-4 rounded-2xl border border-[#dadce0] bg-[#f8fafd] p-4">
      <p className="mb-3 text-sm font-semibold">Recorrencia personalizada</p>
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <label className="text-xs font-semibold text-[#5f6368]">
          Repetir a cada
          <input
            value={custom.every}
            onChange={(event) => updateCustom({ every: event.target.value })}
            className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-[#5f6368]">
          Periodo
          <select
            value={custom.unit}
            onChange={(event) => updateCustom({ unit: event.target.value as CalendarDraft["customRepeat"]["unit"] })}
            className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm"
          >
            <option value="dia">dia</option>
            <option value="semana">semana</option>
            <option value="mes">mes</option>
            <option value="ano">ano</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        {weekDays.map((day, index) => (
          <button
            key={`${day}-${index}`}
            type="button"
            onClick={() => {
              const value = String(index);
              updateCustom({
                weekdays: custom.weekdays.includes(value)
                  ? custom.weekdays.filter((item) => item !== value)
                  : [...custom.weekdays, value],
              });
            }}
            className={`h-8 w-8 rounded-full text-xs ${custom.weekdays.includes(String(index)) ? "bg-[#1a73e8] text-white" : "bg-white"}`}
          >
            {day}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2 text-sm">
        {[
          ["never", "Nunca"],
          ["on", "Em"],
          ["after", "Apos"],
        ].map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              checked={custom.ends === value}
              onChange={() => updateCustom({ ends: value as CalendarDraft["customRepeat"]["ends"] })}
              className="accent-[#1a73e8]"
            />
            {label}
            {value === "on" && custom.ends === "on" ? (
              <input type="date" value={custom.endDate} onChange={(event) => updateCustom({ endDate: event.target.value })} className="rounded border border-[#dadce0] px-2 py-1" />
            ) : null}
            {value === "after" && custom.ends === "after" ? (
              <input value={custom.occurrences} onChange={(event) => updateCustom({ occurrences: event.target.value })} className="w-20 rounded border border-[#dadce0] px-2 py-1" placeholder="12" />
            ) : null}
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm hover:bg-white">
          Cancelar
        </button>
        <button type="button" onClick={onClose} className="rounded-lg bg-[#1a73e8] px-3 py-2 text-sm font-semibold text-white">
          Concluir
        </button>
      </div>
    </div>
  );
}

function AppointmentDetailsDialog({
  appointment,
  onClose,
  onEdit,
  onDelete,
  onEmail,
}: {
  appointment: Appointment;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onEmail: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-28">
      <div className="w-[520px] rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[#5f6368]">Agenda criada</p>
            <h2 className="mt-1 text-2xl font-semibold text-[#202124]">{appointment.title || "(Sem titulo)"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-sm hover:bg-[#f1f3f4]">
            x
          </button>
        </div>

        <div className="space-y-3 text-sm text-[#3c4043]">
          <p>
            <span className="font-semibold">Quando:</span> {formatCalendarEventTime(appointment.starts_at, appointment.ends_at)}
            {" - "}
            {new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date(appointment.starts_at))}
          </p>
          <p>
            <span className="font-semibold">Tipo:</span> {appointmentTypeLabels[appointment.appointment_type]}
          </p>
          <p>
            <span className="font-semibold">Responsavel:</span> {appointment.users?.name ?? "Geral"}
          </p>
          {appointment.location_text ? (
            <p>
              <span className="font-semibold">Local:</span> {appointment.location_text}
            </p>
          ) : null}
          {appointment.description ? (
            <p>
              <span className="font-semibold">Descricao:</span> {appointment.description}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onEmail} className="rounded-lg border border-[#dadce0] px-4 py-2 text-sm hover:bg-[#f1f3f4]">
            Enviar por e-mail
          </button>
          <button type="button" onClick={onDelete} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            Excluir
          </button>
          <button type="button" onClick={onEdit} className="rounded-lg bg-[#1a73e8] px-5 py-2 text-sm font-semibold text-white">
            Editar
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailGuestsDialog({
  appointment,
  draft,
  onChange,
  onClose,
}: {
  appointment: Appointment;
  draft: EmailDraft;
  onChange: (draft: EmailDraft) => void;
  onClose: () => void;
}) {
  function update(next: Partial<EmailDraft>) {
    onChange({ ...draft, ...next });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/20 pt-32">
      <div className="w-[560px] rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-[#5f6368]">Enviar e-mail para os convidados</p>
            <h2 className="mt-1 text-xl font-semibold">{appointment.title || "Agenda ImobiFlow"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-sm hover:bg-[#f1f3f4]">
            x
          </button>
        </div>

        <label className="block text-xs font-semibold text-[#5f6368]">
          Adicionar emails ou nomes
          <input
            value={draft.recipients}
            onChange={(event) => update({ recipients: event.target.value })}
            className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm text-[#202124]"
            placeholder="nome@email.com, Maria..."
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.copyMe}
            onChange={(event) => update({ copyMe: event.target.checked })}
            className="h-4 w-4 accent-[#1a73e8]"
          />
          Enviar copia para mim
        </label>
        <label className="mt-3 block text-xs font-semibold text-[#5f6368]">
          Assunto
          <input
            value={draft.subject}
            onChange={(event) => update({ subject: event.target.value })}
            className="mt-1 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm text-[#202124]"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-[#5f6368]">
          Mensagem
          <textarea
            value={draft.message}
            onChange={(event) => update({ message: event.target.value })}
            className="mt-1 min-h-32 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-sm text-[#202124]"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-[#f1f3f4]">
            Cancelar
          </button>
          <a
            href={mailtoUrl(draft)}
            className="rounded-lg bg-[#1a73e8] px-5 py-2 text-sm font-semibold text-white"
            onClick={onClose}
          >
            Enviar e-mail
          </a>
        </div>
      </div>
    </div>
  );
}

function CalendarPanelButton({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
        active ? "bg-[#d3e3fd] shadow-sm" : "hover:bg-black/5"
      }`}
    >
      {children}
    </button>
  );
}

function CalendarUtilityPanel({
  activePanel,
  noteLists,
  quickTasks,
  employees,
  appointments,
  onClose,
  onCreateNoteList,
  onUpdateNoteList,
  onDeleteNoteList,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
}: {
  activePanel: CalendarPanel;
  noteLists: NoteList[];
  quickTasks: QuickTask[];
  employees: Array<{ id: string; name: string; email: string; role?: string }>;
  appointments: Appointment[];
  onClose: () => void;
  onCreateNoteList: () => void;
  onUpdateNoteList: (list: NoteList) => void;
  onDeleteNoteList: (listId: string) => void;
  onCreateTask: () => void;
  onUpdateTask: (task: QuickTask) => void;
  onDeleteTask: (taskId: string) => void;
  onMoveTask: (taskId: string, targetId: string) => void;
}) {
  const title = {
    notes: "Notas e listas",
    tasks: "Tarefas",
    people: "Funcionarios",
    maps: "Rotas e enderecos",
  }[activePanel];

  return (
    <aside className="h-full overflow-y-auto border-l border-[#dadce0] bg-white px-4 py-4 shadow-[-10px_0_24px_rgba(60,64,67,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[#202124]">{title}</p>
          <p className="text-xs text-[#5f6368]">Painel rapido da agenda ImobiFlow.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-lg hover:bg-black/5">
          x
        </button>
      </div>

      {activePanel === "notes" ? (
        <NotesPanel
          noteLists={noteLists}
          onCreateNoteList={onCreateNoteList}
          onUpdateNoteList={onUpdateNoteList}
          onDeleteNoteList={onDeleteNoteList}
        />
      ) : null}

      {activePanel === "tasks" ? (
        <TasksPanel
          tasks={quickTasks}
          employees={employees}
          onCreateTask={onCreateTask}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onMoveTask={onMoveTask}
        />
      ) : null}

      {activePanel === "people" ? <PeoplePanel employees={employees} quickTasks={quickTasks} noteLists={noteLists} /> : null}

      {activePanel === "maps" ? <MapsPanel appointments={appointments} quickTasks={quickTasks} /> : null}
    </aside>
  );
}

function NotesPanel({
  noteLists,
  onCreateNoteList,
  onUpdateNoteList,
  onDeleteNoteList,
}: {
  noteLists: NoteList[];
  onCreateNoteList: () => void;
  onUpdateNoteList: (list: NoteList) => void;
  onDeleteNoteList: (listId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onCreateNoteList}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1a73e8] text-sm font-semibold text-white shadow-sm hover:bg-[#1558b0]"
      >
        <Plus className="h-4 w-4" />
        Criar nova nota ou lista
      </button>

      {noteLists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#dadce0] p-4 text-sm text-[#5f6368]">
          Nenhuma lista criada. Clique no botao acima para criar uma lista com checkboxes.
        </div>
      ) : null}

      {noteLists.map((list) => (
        <div key={list.id} className={`rounded-2xl border border-[#dadce0] bg-[#fff8e1] p-3 shadow-sm ${list.archived ? "opacity-60" : ""}`}>
          <div className="mb-3 flex items-start gap-2">
            <input
              value={list.title}
              onChange={(event) => onUpdateNoteList({ ...list, title: event.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none focus:border-[#dadce0] focus:bg-white"
              placeholder="Nome da lista"
            />
            <div className="group relative">
              <button type="button" className="rounded-full p-1 hover:bg-black/10" title="Opcoes da lista">
                <MoreVertical className="h-4 w-4" />
              </button>
              <div className="absolute right-0 z-20 hidden w-36 rounded-lg border border-[#dadce0] bg-white p-1 text-xs shadow-lg group-hover:block">
                <button
                  type="button"
                  onClick={() => onUpdateNoteList({ ...list, archived: true })}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-[#f1f3f4]"
                >
                  <Archive className="h-3 w-3" />
                  Arquivar
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteNoteList(list.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Excluir lista
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {list.items.map((item) => (
              <label key={item.id} className="flex items-center gap-2 rounded-lg bg-white/60 px-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(event) =>
                    onUpdateNoteList({
                      ...list,
                      items: list.items.map((current) =>
                        current.id === item.id ? { ...current, done: event.target.checked } : current,
                      ),
                    })
                  }
                  className="h-4 w-4 accent-[#1a73e8]"
                />
                <input
                  value={item.text}
                  onChange={(event) =>
                    onUpdateNoteList({
                      ...list,
                      items: list.items.map((current) =>
                        current.id === item.id ? { ...current, text: event.target.value } : current,
                      ),
                    })
                  }
                  className={`min-w-0 flex-1 bg-transparent outline-none ${item.done ? "text-[#5f6368] line-through" : ""}`}
                  placeholder="Item da lista"
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateNoteList({
                ...list,
                items: [...list.items, { id: createClientId(), text: "", done: false }],
              })
            }
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#dadce0] bg-white/70 px-3 py-2 text-xs font-medium text-[#3c4043] hover:bg-white"
          >
            <Plus className="h-3 w-3" />
            Adicionar nota
          </button>

          <button
            type="button"
            onClick={() => onUpdateNoteList({ ...list, archived: false })}
            className="mt-2 w-full rounded-lg bg-[#188038] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0b6b2f]"
          >
            Concluir lista
          </button>
        </div>
      ))}
    </div>
  );
}

function TasksPanel({
  tasks,
  employees,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
}: {
  tasks: QuickTask[];
  employees: Array<{ id: string; name: string; email: string; role?: string }>;
  onCreateTask: () => void;
  onUpdateTask: (task: QuickTask) => void;
  onDeleteTask: (taskId: string) => void;
  onMoveTask: (taskId: string, targetId: string) => void;
}) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [sortLabel, setSortLabel] = useState("Minha ordem");
  const visibleTasks = useMemo(() => sortQuickTasks(tasks, sortLabel), [tasks, sortLabel]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCreateTask}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1a73e8] text-sm font-semibold text-white shadow-sm hover:bg-[#1558b0]"
        >
          <Plus className="h-4 w-4" />
          Criar tarefa
        </button>
        <div className="group relative">
          <button type="button" className="h-11 rounded-xl border border-[#dadce0] px-3 hover:bg-[#f1f3f4]" title="Ordenar e opcoes">
            <MoreVertical className="h-4 w-4" />
          </button>
          <div className="absolute right-0 z-20 hidden w-48 rounded-xl border border-[#dadce0] bg-white p-1 text-xs shadow-lg group-hover:block">
            {["Minha ordem", "Data", "Prazo", "Marcadas com estrela", "Titulo", "Renomear lista", "Imprimir lista"].map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setSortLabel(item)}
                className="block w-full rounded px-3 py-2 text-left hover:bg-[#f1f3f4]"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#dadce0] p-4 text-sm text-[#5f6368]">
          Nenhuma tarefa criada. Crie uma tarefa com titulo, detalhes, prazo, responsavel e endereco.
        </div>
      ) : null}

      {visibleTasks.map((task) => (
        <div
          key={task.id}
          draggable
          onDragStart={() => setDraggingTaskId(task.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (draggingTaskId && draggingTaskId !== task.id) onMoveTask(draggingTaskId, task.id);
            setDraggingTaskId(null);
          }}
          className={`rounded-2xl border border-[#dadce0] bg-white p-3 shadow-sm ${task.done ? "opacity-60" : ""}`}
        >
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={task.done}
              onChange={(event) => onUpdateTask({ ...task, done: event.target.checked })}
              className="mt-2 h-4 w-4 accent-[#1a73e8]"
              title="Concluir tarefa"
            />
            <div className="min-w-0 flex-1">
              <input
                value={task.title}
                onChange={(event) => onUpdateTask({ ...task, title: event.target.value })}
                className="w-full rounded-lg border border-transparent px-2 py-1 text-sm font-semibold outline-none focus:border-[#dadce0]"
                placeholder="Titulo da tarefa"
              />
              <textarea
                value={task.details}
                onChange={(event) => onUpdateTask({ ...task, details: event.target.value })}
                className="mt-2 min-h-16 w-full resize-none rounded-lg border border-[#dadce0] px-3 py-2 text-xs outline-none focus:border-[#1a73e8]"
                placeholder="Detalhes desta tarefa"
              />
            </div>
            <button type="button" onClick={() => onUpdateTask({ ...task, starred: !task.starred })} className="rounded-full p-1 hover:bg-black/5">
              <Star className={`h-4 w-4 ${task.starred ? "fill-[#fbbc04] text-[#fbbc04]" : "text-[#5f6368]"}`} />
            </button>
          </div>

          <input
            value={task.address}
            onChange={(event) => onUpdateTask({ ...task, address: event.target.value })}
            className="mt-3 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-xs outline-none focus:border-[#1a73e8]"
            placeholder="Endereco para abrir no Google Maps ou Waze"
          />

          <select
            value={task.assigneeId ?? ""}
            onChange={(event) => onUpdateTask({ ...task, assigneeId: event.target.value || null })}
            className="mt-2 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-xs outline-none focus:border-[#1a73e8]"
          >
            <option value="">Sem responsavel</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => onUpdateTask({ ...task, dueAt: dateInputForOffset(0) })} className="rounded-full bg-[#e8f0fe] px-3 py-1 text-[#1967d2]">
              Hoje
            </button>
            <button type="button" onClick={() => onUpdateTask({ ...task, dueAt: dateInputForOffset(1) })} className="rounded-full bg-[#e8f0fe] px-3 py-1 text-[#1967d2]">
              Amanha
            </button>
            <input
              type="datetime-local"
              value={task.dueAt ?? ""}
              onChange={(event) => onUpdateTask({ ...task, dueAt: event.target.value || null })}
              className="rounded-full border border-[#dadce0] px-3 py-1"
              aria-label="Data e hora"
            />
            <button
              type="button"
              onClick={() => onUpdateTask({ ...task, repeating: !task.repeating })}
              className={`rounded-full px-3 py-1 ${task.repeating ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#f1f3f4] text-[#3c4043]"}`}
            >
              Repetir
            </button>
            <button type="button" onClick={() => onUpdateTask({ ...task, done: true })} className="rounded-full bg-[#188038] px-3 py-1 text-white">
              Concluir
            </button>
            <button type="button" onClick={() => onDeleteTask(task.id)} className="rounded-full bg-red-50 px-3 py-1 text-red-600">
              Excluir
            </button>
          </div>

          {task.address ? (
            <div className="mt-3 flex gap-2 text-xs">
              <a href={googleMapsUrl(task.address)} target="_blank" rel="noreferrer" className="rounded-full border border-[#dadce0] px-3 py-1 text-[#1967d2]">
                Abrir Google Maps
              </a>
              <a href={wazeUrl(task.address)} target="_blank" rel="noreferrer" className="rounded-full border border-[#dadce0] px-3 py-1 text-[#1967d2]">
                Abrir Waze
              </a>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PeoplePanel({
  employees,
  quickTasks,
  noteLists,
}: {
  employees: Array<{ id: string; name: string; email: string; role?: string }>;
  quickTasks: QuickTask[];
  noteLists: NoteList[];
}) {
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[#f1f3f4] p-3 text-xs text-[#5f6368]">
        Escolha o funcionario ou usuario da imobiliaria para compartilhar tarefas e listas criadas.
      </div>
      {employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#dadce0] p-4 text-sm text-[#5f6368]">
          Nenhum funcionario carregado ainda. Quando os usuarios forem convidados, eles aparecerao aqui.
        </div>
      ) : null}
      {employees.map((employee) => (
        <label key={employee.id} className="flex items-center gap-3 rounded-xl border border-[#dadce0] bg-white p-3 text-sm">
          <input
            type="checkbox"
            checked={selectedPeople.includes(employee.id)}
            onChange={(event) =>
              setSelectedPeople((current) =>
                event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id),
              )
            }
            className="h-4 w-4 accent-[#1a73e8]"
          />
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d3e3fd] font-semibold text-[#1967d2]">
            {employee.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{employee.name}</span>
            <span className="block truncate text-xs text-[#5f6368]">{employee.email}</span>
          </span>
        </label>
      ))}
      <button
        type="button"
        className="w-full rounded-xl bg-[#1a73e8] px-3 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={selectedPeople.length === 0}
      >
        Enviar {quickTasks.length} tarefa(s) e {noteLists.length} lista(s)
      </button>
    </div>
  );
}

function MapsPanel({ appointments, quickTasks }: { appointments: Appointment[]; quickTasks: QuickTask[] }) {
  const routes = useMemo(() => {
    const appointmentRoutes = appointments.filter((appointment) => appointment.location_text);
    const taskRoutes = quickTasks.filter((task) => task.address);
    return [
      ...appointmentRoutes.map((appointment) => ({
      id: appointment.id,
      title: appointment.title || "Compromisso",
      subtitle: formatPanelDateTime(appointment.starts_at),
      address: appointment.location_text ?? "",
      })),
      ...taskRoutes.map((task) => ({
      id: task.id,
      title: task.title || "Tarefa",
      subtitle: task.dueAt ? formatPanelDateTime(task.dueAt) : "Sem data definida",
      address: task.address,
      })),
    ];
  }, [appointments, quickTasks]);
  const [selectedRouteId, setSelectedRouteId] = useState(routes[0]?.id ?? "");
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [mapMessage, setMapMessage] = useState("Selecione um endereco para ver no mapa.");
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null;

  useEffect(() => {
    if (!selectedRouteId && routes[0]?.id) {
      setSelectedRouteId(routes[0].id);
    } else if (selectedRouteId && routes.length > 0 && !routes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes, selectedRouteId]);

  useEffect(() => {
    if (!selectedRoute?.address) {
      setDestination(null);
      setRouteSummary(null);
      setMapMessage("Adicione endereco em uma tarefa ou compromisso para visualizar a rota.");
      return;
    }

    const controller = new AbortController();
    setIsRouteLoading(true);
    setMapMessage("Localizando endereco no OpenStreetMap...");
    void geocodeAddress(selectedRoute.address, controller.signal)
      .then(async (point) => {
        if (!point) {
          setDestination(null);
          setRouteSummary(null);
          setMapMessage("Nao encontramos esse endereco. Complete rua, numero, cidade e estado.");
          return;
        }

        setDestination(point);
        if (!origin) {
          setRouteSummary(null);
          setMapMessage("Destino localizado. Use sua localizacao para calcular distancia e tempo de rota.");
          return;
        }

        setMapMessage("Calculando rota via OSRM...");
        const summary = await calculateOsrmRoute(origin, point, controller.signal);
        setRouteSummary(summary);
        setMapMessage(summary ? "Rota calculada com OpenStreetMap + OSRM." : "Nao foi possivel calcular a rota agora.");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMapMessage("Nao foi possivel consultar o mapa agora.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsRouteLoading(false);
      });

    return () => controller.abort();
  }, [origin, selectedRoute]);

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMapMessage("Seu navegador nao liberou geolocalizacao.");
      return;
    }

    setIsRouteLoading(true);
    setMapMessage("Solicitando sua localizacao...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Sua localizacao",
        });
        setMapMessage("Localizacao capturada. Calculando rota...");
        setIsRouteLoading(false);
      },
      () => {
        setMapMessage("Permita acesso a localizacao para calcular a rota dentro do sistema.");
        setIsRouteLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-3">
      {routes.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[#dadce0] bg-white shadow-sm">
          <OpenStreetRouteMap
            destination={destination}
            origin={origin}
            routeSummary={routeSummary}
          />
          <div className="space-y-3 border-t border-[#dadce0] p-3 text-xs text-[#5f6368]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{isRouteLoading ? "Carregando rota..." : mapMessage}</span>
              <button type="button" onClick={useCurrentLocation} className="rounded-full border border-[#dadce0] px-3 py-1 font-semibold text-[#1967d2]">
                Usar minha localizacao
              </button>
            </div>
            {routeSummary ? (
              <div className="grid grid-cols-2 gap-2 text-[#202124]">
                <span className="rounded-xl bg-[#f1f3f4] px-3 py-2">
                  <strong>{routeSummary.distanceKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km</strong>
                  <br />
                  distancia estimada
                </span>
                <span className="rounded-xl bg-[#f1f3f4] px-3 py-2">
                  <strong>{Math.round(routeSummary.durationMin)} min</strong>
                  <br />
                  tempo estimado
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {routes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#dadce0] p-4 text-sm text-[#5f6368]">
          Adicione endereco em uma tarefa ou compromisso para abrir Google Maps ou Waze com o endereco pronto.
        </div>
      ) : null}

      {routes.map((route) => (
        <RouteCard
          key={route.id}
          title={route.title}
          subtitle={route.subtitle}
          address={route.address}
          selected={route.id === selectedRoute?.id}
          onSelect={() => setSelectedRouteId(route.id)}
          destination={route.id === selectedRoute?.id ? destination : null}
        />
      ))}
    </div>
  );
}

function OpenStreetRouteMap({
  destination,
  origin,
  routeSummary,
}: {
  destination: GeoPoint | null;
  origin: GeoPoint | null;
  routeSummary: RouteSummary | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNamespace.Map | null>(null);
  const layersRef = useRef<LeafletNamespace.Layer[]>([]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current) return;
      const L = leaflet.default ?? leaflet;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([-23.5505, -46.6333], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      layersRef.current.forEach((layer) => layer.removeFrom(map));
      layersRef.current = [];
      const bounds: LeafletNamespace.LatLngExpression[] = [];

      if (routeSummary?.geometry.length) {
        const line = L.polyline(routeSummary.geometry.map((point) => [point.lat, point.lng]), {
          color: "#1a73e8",
          weight: 5,
          opacity: 0.86,
        }).addTo(map);
        layersRef.current.push(line);
        routeSummary.geometry.forEach((point) => bounds.push([point.lat, point.lng]));
      }

      if (origin) {
        const marker = L.marker([origin.lat, origin.lng], {
          icon: L.divIcon({
            className: "",
            html: '<span style="display:block;width:18px;height:18px;border-radius:999px;background:#1a73e8;border:3px solid white;box-shadow:0 1px 8px rgba(0,0,0,.3)"></span>',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
        }).addTo(map).bindPopup(origin.label ?? "Origem");
        layersRef.current.push(marker);
        bounds.push([origin.lat, origin.lng]);
      }

      if (destination) {
        const marker = L.marker([destination.lat, destination.lng], {
          icon: L.divIcon({
            className: "",
            html: '<span style="display:block;width:22px;height:22px;border-radius:999px;background:#ea4335;border:3px solid white;box-shadow:0 1px 8px rgba(0,0,0,.3)"></span>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
        }).addTo(map).bindPopup(destination.label ?? "Destino");
        layersRef.current.push(marker);
        bounds.push([destination.lat, destination.lng]);
      }

      if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [24, 24] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      }
      window.setTimeout(() => map.invalidateSize(), 60);
    });

    return () => {
      cancelled = true;
    };
  }, [destination, origin, routeSummary]);

  return <div ref={containerRef} className="h-64 w-full bg-[#eef3f8]" />;
}

function RouteCard({
  title,
  subtitle,
  address,
  selected,
  destination,
  onSelect,
}: {
  title: string;
  subtitle: string;
  address: string;
  selected: boolean;
  destination: GeoPoint | null;
  onSelect: () => void;
}) {
  const mapsHref = destination ? googleMapsUrlFromPoint(destination) : googleMapsUrl(address);
  const wazeHref = destination ? wazeUrlFromPoint(destination) : wazeUrl(address);

  return (
    <div className={`rounded-2xl border bg-white p-3 text-sm shadow-sm ${selected ? "border-[#1a73e8] ring-2 ring-[#d3e3fd]" : "border-[#dadce0]"}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-xs text-[#5f6368]">{subtitle}</p>
      <button type="button" onClick={onSelect} className="mt-2 block w-full rounded-lg bg-[#e8f0fe] px-3 py-2 text-left text-[#1967d2]">
        {address}
      </button>
      <div className="mt-3 flex gap-2 text-xs">
        <a href={mapsHref} target="_blank" rel="noreferrer" className="rounded-full border border-[#dadce0] px-3 py-1 text-[#1967d2]">
          Google Maps
        </a>
        <a href={wazeHref} target="_blank" rel="noreferrer" className="rounded-full border border-[#dadce0] px-3 py-1 text-[#1967d2]">
          Waze
        </a>
      </div>
    </div>
  );
}

function AgendaGroup({
  title,
  items,
  selectedItems,
  description,
  muted,
  isOpen = true,
  onToggle,
  onItemToggle,
}: {
  title: string;
  items: AgendaFilterOption[];
  selectedItems: AgendaFilterKey[];
  description?: string;
  muted?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  onItemToggle: (filter: AgendaFilterKey) => void;
}) {
  return (
    <div>
      <button type="button" onClick={onToggle} className="mb-2 flex w-full items-center justify-between">
        <p className="text-sm font-semibold text-[#202124]">{title}</p>
        <ChevronDown className={`h-4 w-4 text-[#202124] transition ${isOpen ? "" : "rotate-180"}`} />
      </button>
      {isOpen ? (
        <div className="space-y-2">
          {description ? <p className="mb-3 text-xs text-[#5f6368]">{description}</p> : null}
          {items.map((item, index) => {
            const checked = selectedItems.includes(item.key);
            return (
              <label key={item.key} className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-1.5 text-sm hover:bg-black/5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onItemToggle(item.key)}
                  className="sr-only"
                />
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[11px] text-white ${
                  checked ? (muted ? "bg-[#0b8043]" : calendarColor(index)) : "border border-[#dadce0] bg-white text-transparent"
                }`}>
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-[#202124]">
                    <span className="truncate">{item.label}</span>
                    <span className="text-xs text-[#5f6368]">{item.count}</span>
                  </span>
                  <span className="block text-[11px] text-[#5f6368]">{item.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MapPinIcon() {
  return (
    <span className="relative flex h-5 w-5 items-center justify-center">
      <span className="absolute h-4 w-4 rounded-full bg-[#34a853]" />
      <span className="absolute h-4 w-4 translate-x-1 rounded-full bg-[#4285f4] opacity-90" />
      <span className="absolute h-4 w-4 -translate-y-1 rounded-full bg-[#fbbc04] opacity-90" />
    </span>
  );
}

function AppointmentForm({
  leads,
  properties,
  assignedTo,
  onCancel,
  onCreated,
}: {
  leads: Lead[];
  properties: Property[];
  assignedTo?: string;
  onCancel: () => void;
  onCreated: (appointment: Appointment) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await createAppointment({
        appointment_type: formData.get("appointment_type") as Appointment["appointment_type"],
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        location_text: String(formData.get("location_text") ?? ""),
        starts_at: toIsoDateTime(String(formData.get("starts_at") ?? "")),
        ends_at: toOptionalIsoDateTime(String(formData.get("ends_at") ?? "")),
        reminder_at: toOptionalIsoDateTime(String(formData.get("reminder_at") ?? "")),
        lead_id: String(formData.get("lead_id") ?? ""),
        property_id: String(formData.get("property_id") ?? ""),
        assigned_to: assignedTo,
      });
      onCreated(response.appointment);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel criar compromisso.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Novo compromisso</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Vincule a visita a um lead e a um imovel quando houver dados reais cadastrados.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>

      {formError ? <p className="mb-3 text-sm text-destructive">{formError}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Titulo">
          <input name="title" required className="form-input" placeholder="Visita com cliente" />
        </Field>
        <Field label="Tipo">
          <select name="appointment_type" className="form-input" defaultValue="visit">
            {Object.entries(appointmentTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Inicio">
          <input name="starts_at" type="datetime-local" required className="form-input" />
        </Field>
        <Field label="Fim">
          <input name="ends_at" type="datetime-local" className="form-input" />
        </Field>
        <Field label="Lead">
          <select name="lead_id" className="form-input" defaultValue="">
            <option value="">Sem lead vinculado</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Imovel">
          <select name="property_id" className="form-input" defaultValue="">
            <option value="">Sem imovel vinculado</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.code ? `${property.code} - ` : ""}
                {property.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Local">
          <input name="location_text" className="form-input" placeholder="Endereco ou ponto de encontro" />
        </Field>
        <Field label="Lembrete">
          <input name="reminder_at" type="datetime-local" className="form-input" />
        </Field>
      </div>
      <label className="mt-3 block text-xs font-medium text-muted-foreground">
        Observacoes
        <textarea name="description" rows={3} className="form-input mt-1" />
      </label>
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Criar compromisso
        </Button>
      </div>
    </form>
  );
}

function RentalForm({
  leads,
  properties,
  onCancel,
  onCreated,
}: {
  leads: Lead[];
  properties: Property[];
  onCancel: () => void;
  onCreated: (rental: RentalAgreement) => void;
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await createRental({
        property_id: String(formData.get("property_id") ?? ""),
        owner_id: selectedProperty?.owner_id ?? undefined,
        lead_id: String(formData.get("lead_id") ?? ""),
        tenant_name: String(formData.get("tenant_name") ?? ""),
        tenant_document: String(formData.get("tenant_document") ?? ""),
        tenant_email: String(formData.get("tenant_email") ?? ""),
        tenant_phone: String(formData.get("tenant_phone") ?? ""),
        starts_at: String(formData.get("starts_at") ?? ""),
        ends_at: String(formData.get("ends_at") ?? ""),
        monthly_amount_cents: parseMoneyToCents(String(formData.get("monthly_amount") ?? "")),
        condominium_fee_cents: parseMoneyToCents(String(formData.get("condominium_fee") ?? "")),
        iptu_cents: parseMoneyToCents(String(formData.get("iptu") ?? "")),
        insurance_cents: parseMoneyToCents(String(formData.get("insurance") ?? "")),
        due_day: Number(formData.get("due_day") ?? 10),
        adjustment_index: String(formData.get("adjustment_index") ?? "ipca"),
        guarantee_type: String(formData.get("guarantee_type") ?? ""),
        commission_type: formData.get("commission_type") as "percentage" | "fixed",
        commission_rate: Number(formData.get("commission_rate") ?? 10),
        commission_fixed_cents: parseMoneyToCents(String(formData.get("commission_fixed") ?? "")),
        operational_fee_cents: parseMoneyToCents(String(formData.get("operational_fee") ?? "")),
        operational_fee_payer: formData.get("operational_fee_payer") as "company" | "tenant" | "owner",
        preferred_payment_method: formData.get("preferred_payment_method") as "pix" | "boleto" | "hybrid" | "manual",
        generate_first_charge: formData.get("generate_first_charge") === "on",
        first_due_date: String(formData.get("first_due_date") ?? ""),
        notes: String(formData.get("notes") ?? ""),
      });
      onCreated(response.rental);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel criar locacao.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Nova locacao</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ao salvar, o sistema cria contrato de locacao, parte inquilina, registro de locacao e
            prepara a primeira cobranca.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>

      {formError ? <p className="mb-3 text-sm text-destructive">{formError}</p> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Imovel">
          <select
            name="property_id"
            required
            className="form-input"
            value={selectedPropertyId}
            onChange={(event) => setSelectedPropertyId(event.target.value)}
          >
            <option value="">Selecione</option>
            {properties
              .filter((property) => property.status !== "rented" && property.status !== "archived")
              .map((property) => (
                <option key={property.id} value={property.id}>
                  {property.code ? `${property.code} - ` : ""}
                  {property.title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Lead vinculado">
          <select name="lead_id" className="form-input" defaultValue="">
            <option value="">Sem lead vinculado</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Inquilino">
          <input name="tenant_name" required className="form-input" placeholder="Nome completo" />
        </Field>
        <Field label="CPF/CNPJ">
          <input name="tenant_document" className="form-input" />
        </Field>
        <Field label="E-mail">
          <input name="tenant_email" type="email" className="form-input" />
        </Field>
        <Field label="Telefone">
          <input name="tenant_phone" className="form-input" />
        </Field>
        <Field label="Inicio">
          <input name="starts_at" type="date" required className="form-input" />
        </Field>
        <Field label="Fim">
          <input name="ends_at" type="date" className="form-input" />
        </Field>
        <Field label="Dia de vencimento">
          <input name="due_day" type="number" min={1} max={31} defaultValue={10} className="form-input" />
        </Field>
        <Field label="Aluguel">
          <input
            name="monthly_amount"
            required
            inputMode="decimal"
            className="form-input"
            defaultValue={selectedProperty?.rent_price_cents ? formatMoneyInput(selectedProperty.rent_price_cents) : ""}
          />
        </Field>
        <Field label="Condominio">
          <input name="condominium_fee" inputMode="decimal" className="form-input" />
        </Field>
        <Field label="IPTU">
          <input name="iptu" inputMode="decimal" className="form-input" />
        </Field>
        <Field label="Seguro">
          <input name="insurance" inputMode="decimal" className="form-input" />
        </Field>
        <Field label="Indice de reajuste">
          <select name="adjustment_index" defaultValue="ipca" className="form-input">
            <option value="ipca">IPCA</option>
            <option value="igpm">IGP-M</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        <Field label="Garantia">
          <input name="guarantee_type" className="form-input" placeholder="Caucao, fiador, seguro..." />
        </Field>
        <Field label="Comissao">
          <select name="commission_type" defaultValue="percentage" className="form-input">
            <option value="percentage">Percentual</option>
            <option value="fixed">Valor fixo</option>
          </select>
        </Field>
        <Field label="% comissao">
          <input name="commission_rate" type="number" step="0.01" defaultValue={10} className="form-input" />
        </Field>
        <Field label="Comissao fixa">
          <input name="commission_fixed" inputMode="decimal" className="form-input" />
        </Field>
        <Field label="Taxa operacional">
          <input name="operational_fee" inputMode="decimal" className="form-input" placeholder="3,79" />
        </Field>
        <Field label="Responsavel pela taxa">
          <select name="operational_fee_payer" defaultValue="company" className="form-input">
            <option value="company">Imobiliaria</option>
            <option value="tenant">Inquilino</option>
            <option value="owner">Proprietario</option>
          </select>
        </Field>
        <Field label="Pagamento preferido">
          <select name="preferred_payment_method" defaultValue="pix" className="form-input">
            <option value="pix">PIX</option>
            <option value="boleto">Boleto</option>
            <option value="hybrid">PIX + boleto</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        <Field label="Primeiro vencimento">
          <input name="first_due_date" type="date" className="form-input" />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <input name="generate_first_charge" type="checkbox" defaultChecked className="h-4 w-4 accent-primary" />
        Preparar primeira cobranca automaticamente
      </label>
      <label className="mt-3 block text-xs font-medium text-muted-foreground">
        Observacoes
        <textarea name="notes" rows={3} className="form-input mt-1" />
      </label>
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Criar locacao
        </Button>
      </div>
    </form>
  );
}

function AppointmentCard({
  appointment,
  runningAction,
  onStatusChange,
}: {
  appointment: Appointment;
  runningAction: string | null;
  onStatusChange: (appointment: Appointment, status: Appointment["status"]) => void;
}) {
  const property = firstRelation(appointment.properties);
  const lead = firstRelation(appointment.leads);

  return (
    <article className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={appointmentStatusLabels[appointment.status]} status={appointment.status} />
          <span className="text-xs text-muted-foreground">
            {appointmentTypeLabels[appointment.appointment_type]}
          </span>
        </div>
        <h3 className="mt-2 text-sm font-semibold">{appointment.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDateTime(appointment.starts_at)}
          {appointment.location_text ? ` · ${appointment.location_text}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {lead ? (
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3 w-3" />
              {lead.name}
            </span>
          ) : null}
          {property ? (
            <span className="inline-flex items-center gap-1">
              <Home className="h-3 w-3" />
              {property.title}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {appointment.status === "scheduled" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={runningAction === `${appointment.id}:confirmed`}
            onClick={() => onStatusChange(appointment, "confirmed")}
          >
            Confirmar
          </Button>
        ) : null}
        {!["completed", "cancelled"].includes(appointment.status) ? (
          <Button
            type="button"
            size="sm"
            disabled={runningAction === `${appointment.id}:completed`}
            onClick={() => onStatusChange(appointment, "completed")}
          >
            Concluir
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function RentalCard({
  rental,
  runningAction,
  onGenerateCharge,
}: {
  rental: RentalAgreement;
  runningAction: string | null;
  onGenerateCharge: (rental: RentalAgreement) => void;
}) {
  const property = firstRelation(rental.properties);
  const owner = firstRelation(rental.property_owners);
  const tenant = firstRelation(rental.contract_parties);
  const isGenerating = runningAction === `rental-charge:${rental.id}`;

  return (
    <article className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge label={rentalStatusLabels[rental.status]} status={rental.status} />
        <span className="text-sm font-semibold">{formatMoney(rental.monthly_amount_cents)}</span>
      </div>
      <h3 className="mt-3 text-sm font-semibold">{property?.title ?? "Imovel da locacao"}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Inquilino: {tenant?.name ?? "sem inquilino"} · vencimento dia {rental.due_day}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Proprietario: {owner?.name ?? "nao vinculado"} · reajuste {rental.adjustment_index.toUpperCase()}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Inicio {formatDate(rental.starts_at)}
        {rental.ends_at ? ` · fim ${formatDate(rental.ends_at)}` : ""}
      </p>
      {rental.next_charge_due_date ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-600">
          <Clock3 className="h-3 w-3" />
          Proxima cobranca: {formatDate(rental.next_charge_due_date)}
        </p>
      ) : null}
      {rental.status === "active" ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isGenerating}
            onClick={() => onGenerateCharge(rental)}
          >
            {isGenerating ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <WalletCards className="mr-2 h-3.5 w-3.5" />
            )}
            Gerar próxima cobrança
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: number | string;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function StatusBadge({ label, status }: { label: string; status: string }) {
  const tone = ["completed", "active", "confirmed"].includes(status)
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
    : ["cancelled", "no_show", "overdue"].includes(status)
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-amber-500/30 bg-amber-500/10 text-amber-600";

  return <span className={`inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium ${tone}`}>{label}</span>;
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString();
}

function toOptionalIsoDateTime(value: string) {
  return value ? toIsoDateTime(value) : undefined;
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const number = Number(normalized || 0);
  return Math.max(0, Math.round(number * 100));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function formatMoneyShort(value: number) {
  if (value === 0) return "R$ 0";
  return formatMoney(value);
}

function formatMoneyInput(value: number) {
  return (value / 100).toFixed(2).replace(".", ",");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

function buildWeekDays(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function buildMonthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatAgendaHour(hour: number) {
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour} PM`;
}

function weekdayShort(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
}

function formatCalendarEventTime(startsAt: string, endsAt: string | null | undefined) {
  const start = new Date(startsAt);
  const startText = `${start.getHours()}h`;
  if (!endsAt) return startText;
  const end = new Date(endsAt);
  return `${startText} - ${end.getHours()}h`;
}

function calendarColor(index: number) {
  return ["bg-[#039be5]", "bg-[#33b679]", "bg-[#4285f4]", "bg-[#f4511e]"][index % 4] ?? "bg-[#039be5]";
}

function appointmentDurationHours(appointment: Appointment) {
  const start = new Date(appointment.starts_at);
  const end = appointment.ends_at ? new Date(appointment.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
  return Math.max(0.5, (end.getTime() - start.getTime()) / (60 * 60 * 1000));
}

function calendarDraftHeight(draft: CalendarDraft) {
  const start = new Date(draft.startsAt);
  const end = new Date(draft.endsAt);
  return Math.max(28, ((end.getTime() - start.getTime()) / (60 * 60 * 1000)) * 64 - 4);
}

function appointmentsOverlap(left: Appointment, right: Appointment) {
  const leftStart = new Date(left.starts_at).getTime();
  const leftEnd = left.ends_at ? new Date(left.ends_at).getTime() : leftStart + 60 * 60 * 1000;
  const rightStart = new Date(right.starts_at).getTime();
  const rightEnd = right.ends_at ? new Date(right.ends_at).getTime() : rightStart + 60 * 60 * 1000;
  return leftStart < rightEnd && rightStart < leftEnd;
}

function layoutTimedEventsForDay(appointments: Appointment[], date: Date) {
  const dayAppointments = appointments
    .filter((appointment) => {
      const start = new Date(appointment.starts_at);
      return isSameCalendarDay(start, date) && !Boolean(appointment.metadata?.all_day);
    })
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());

  return dayAppointments.map((appointment) => {
    const overlapping = dayAppointments.filter((item) => appointmentsOverlap(item, appointment));
    const overlapIds = overlapping.map((item) => item.id).sort();
    const lane = Math.max(0, overlapIds.indexOf(appointment.id));
    return {
      appointment,
      startHour: new Date(appointment.starts_at).getHours(),
      lane,
      laneCount: Math.max(1, overlapIds.length),
    };
  });
}

function createCalendarDraft(start: Date, end: Date, assignedTo: string, mode: QuickScheduleMode): CalendarDraft {
  return {
    mode,
    title: "",
    startsAt: toDatetimeLocalValue(start),
    endsAt: toDatetimeLocalValue(end),
    allDay: false,
    repeat: "Nao se repete",
    assignedTo,
    location: "",
    description: "",
    attachmentName: "",
    visibility: "default",
    reminder: "10 minutos antes",
    reminderChannel: "app",
    reminderCustomAmount: "10",
    reminderCustomUnit: "minutes",
    dueDate: toDateInputValue(start),
    linkedTaskListId: "",
    customRepeat: {
      every: "1",
      unit: "semana",
      weekdays: [String(start.getDay())],
      ends: "never",
      endDate: toDateInputValue(start),
      occurrences: "12",
    },
  };
}

function createCalendarDraftFromAppointment(appointment: Appointment): CalendarDraft {
  const start = new Date(appointment.starts_at);
  const end = appointment.ends_at ? new Date(appointment.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
  const metadataMode = typeof appointment.metadata?.calendar_mode === "string" ? appointment.metadata.calendar_mode : null;
  const mode: QuickScheduleMode =
    metadataMode === "task" || metadataMode === "booking" || metadataMode === "event"
      ? metadataMode
      : appointment.appointment_type === "follow_up"
        ? "task"
        : appointment.appointment_type === "visit"
          ? "booking"
          : "event";
  return {
    ...createCalendarDraft(start, end, appointment.assigned_to ?? "", mode),
    appointmentId: appointment.id,
    title: appointment.title,
    description: appointment.description ?? "",
    location: appointment.location_text ?? "",
    allDay: Boolean(appointment.metadata?.all_day),
  };
}

function defaultDraftTitle(mode: QuickScheduleMode) {
  if (mode === "task") return "Nova tarefa";
  if (mode === "booking") return "Agendamento de horario";
  return "Novo evento";
}

function toDatetimeLocalValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekdayLong(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
}

function ordinalWeekOfMonth(date: Date) {
  const occurrence = Math.ceil(date.getDate() / 7);
  return `${occurrence}o`;
}

function calculateReminderAt(startsAt: string, reminder: string) {
  const start = new Date(startsAt);
  const minutes = reminder.includes("5 minutos")
    ? 5
    : reminder.includes("10 minutos")
      ? 10
      : reminder.includes("15 minutos")
        ? 15
        : reminder.includes("30 minutos")
          ? 30
          : reminder.includes("1 hora")
            ? 60
            : reminder.includes("1 dia")
              ? 1440
              : 0;
  if (!minutes) return undefined;
  return new Date(start.getTime() - minutes * 60 * 1000).toISOString();
}

function formatSidebarAgendaDay(day: Date, appointments: Appointment[]) {
  const count = appointments.filter((appointment) => isSameCalendarDay(new Date(appointment.starts_at), day)).length;
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit" }).format(day).replace(".", "");
  return count > 0 ? `${label} - ${count} agenda(s)` : `${label} - livre`;
}

function buildFutureAgendaLabels(appointments: Appointment[]) {
  const now = new Date();
  const future = appointments
    .filter((appointment) => new Date(appointment.starts_at) > now)
    .slice(0, 5)
    .map((appointment) => `${appointment.title} - ${formatDateTime(appointment.starts_at)}`);
  return future.length > 0 ? future : ["Nenhuma agenda futura"];
}

function buildAgendaFilterOptions(appointments: Appointment[]): AgendaFilterOption[] {
  return [
    {
      key: "events",
      label: "Eventos",
      description: "Reuniões, retornos, vistorias e assinaturas.",
      count: appointments.filter((appointment) => agendaModeForAppointment(appointment) === "events").length,
    },
    {
      key: "tasks",
      label: "Tarefas",
      description: "Follow-ups e tarefas operacionais.",
      count: appointments.filter((appointment) => agendaModeForAppointment(appointment) === "tasks").length,
    },
    {
      key: "bookings",
      label: "Agendamentos de horário",
      description: "Visitas e horários reservados.",
      count: appointments.filter((appointment) => agendaModeForAppointment(appointment) === "bookings").length,
    },
    {
      key: "scheduled",
      label: "Agendadas",
      description: "Itens ainda aguardando execução.",
      count: appointments.filter((appointment) => appointment.status === "scheduled" || appointment.status === "rescheduled").length,
    },
    {
      key: "confirmed",
      label: "Confirmadas",
      description: "Itens confirmados pela equipe.",
      count: appointments.filter((appointment) => appointment.status === "confirmed").length,
    },
    {
      key: "completed",
      label: "Concluídas",
      description: "Itens já realizados.",
      count: appointments.filter((appointment) => appointment.status === "completed").length,
    },
  ];
}

function filterAppointmentsByAgendaFilters(appointments: Appointment[], filters: AgendaFilterKey[]) {
  if (filters.length === 0) return [];
  const enabledTypes = new Set(filters.filter((filter) => ["events", "tasks", "bookings"].includes(filter)));
  const enabledStatuses = new Set(filters.filter((filter) => ["scheduled", "confirmed", "completed"].includes(filter)));

  return appointments.filter((appointment) => {
    const typeAllowed = enabledTypes.has(agendaModeForAppointment(appointment));
    const statusKey = agendaStatusFilterForAppointment(appointment);
    const statusAllowed = statusKey ? enabledStatuses.has(statusKey) : true;
    return typeAllowed && statusAllowed;
  });
}

function agendaModeForAppointment(appointment: Appointment): Extract<AgendaFilterKey, "events" | "tasks" | "bookings"> {
  const metadataMode = typeof appointment.metadata?.calendar_mode === "string" ? appointment.metadata.calendar_mode : null;
  if (metadataMode === "task") return "tasks";
  if (metadataMode === "booking") return "bookings";
  if (appointment.appointment_type === "follow_up") return "tasks";
  if (appointment.appointment_type === "visit") return "bookings";
  return "events";
}

function agendaStatusFilterForAppointment(appointment: Appointment): Extract<AgendaFilterKey, "scheduled" | "confirmed" | "completed"> | null {
  if (appointment.status === "confirmed") return "confirmed";
  if (appointment.status === "completed") return "completed";
  if (appointment.status === "scheduled" || appointment.status === "rescheduled") return "scheduled";
  return null;
}

function filterAppointmentsForSearch(appointments: Appointment[], query: string) {
  if (!query.trim()) return appointments;
  return appointments.filter((appointment) =>
    searchMatches(
      [
        appointment.title,
        appointment.description,
        appointment.location_text,
        appointment.users?.name,
        appointment.users?.email,
        appointment.leads?.name,
        appointment.properties?.title,
        appointment.properties?.code,
      ],
      query,
    ),
  );
}

function searchMatches(values: Array<string | null | undefined>, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return values.some((value) => normalizeSearchText(value ?? "").includes(normalizedQuery));
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function buildAddressSuggestions(appointments: Appointment[], rentals: RentalAgreement[]) {
  const suggestions = new Set<string>();
  appointments.forEach((appointment) => {
    if (appointment.location_text) suggestions.add(appointment.location_text);
    const propertyAddress = formatPropertyAddress(appointment.properties);
    if (propertyAddress) suggestions.add(propertyAddress);
  });
  rentals.forEach((rental) => {
    if (rental.properties?.title) suggestions.add(rental.properties.title);
  });
  return [...suggestions].slice(0, 20);
}

function formatPropertyAddress(property: Appointment["properties"]) {
  if (!property) return "";
  return [property.street, property.number, property.neighborhood, property.city, property.state]
    .filter(Boolean)
    .join(", ");
}

function isDateInsideRange(date: Date, start: Date, end: Date) {
  const current = stripTime(date).getTime();
  const first = stripTime(start).getTime();
  const last = stripTime(end).getTime();
  return current >= Math.min(first, last) && current <= Math.max(first, last);
}

function stripTime(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function buildAppointmentEmailMessage(appointment: Appointment) {
  const lines = [
    `Olá,`,
    ``,
    `Segue agenda criada no ImobiFlow: ${appointment.title || "(Sem titulo)"}.`,
    `Data e horário: ${formatDateTime(appointment.starts_at)}${appointment.ends_at ? ` até ${formatDateTime(appointment.ends_at)}` : ""}.`,
  ];
  if (appointment.location_text) lines.push(`Local: ${appointment.location_text}.`);
  if (appointment.description) lines.push(`Descrição: ${appointment.description}`);
  lines.push("", "Obrigado.");
  return lines.join("\n");
}

function mailtoUrl(draft: EmailDraft) {
  const recipients = draft.recipients
    .split(/[;,]/)
    .map((value) => value.trim())
    .filter((value) => value.includes("@"))
    .join(",");
  const params = new URLSearchParams({
    subject: draft.subject,
    body: `${draft.message}${draft.copyMe ? "\n\nEnviar copia para mim: sim" : ""}`,
  });
  return `mailto:${recipients}?${params.toString()}`;
}

function createClientId() {
  return typeof window !== "undefined" && window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateInputForOffset(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(offsetDays === 0 ? Math.max(date.getHours() + 1, 9) : 9, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:00`;
}

function moveItemBefore<T extends { id: string }>(items: T[], itemId: string, targetId: string) {
  const next = [...items];
  const itemIndex = next.findIndex((item) => item.id === itemId);
  const targetIndex = next.findIndex((item) => item.id === targetId);
  if (itemIndex < 0 || targetIndex < 0) return items;

  const [item] = next.splice(itemIndex, 1);
  const adjustedTargetIndex = next.findIndex((current) => current.id === targetId);
  next.splice(adjustedTargetIndex, 0, item);
  return next;
}

function sortQuickTasks(tasks: QuickTask[], sortLabel: string) {
  const next = [...tasks];

  if (sortLabel === "Titulo" || sortLabel === "Renomear lista") {
    return next.sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
  }

  if (sortLabel === "Data" || sortLabel === "Prazo") {
    return next.sort((left, right) => (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999"));
  }

  if (sortLabel === "Marcadas com estrela") {
    return next.sort((left, right) => Number(right.starred) - Number(left.starred));
  }

  return tasks;
}

function googleMapsUrl(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

function googleMapsUrlFromPoint(point: GeoPoint) {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&travelmode=driving`;
}

function wazeUrl(address: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

function wazeUrlFromPoint(point: GeoPoint) {
  return `https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`;
}

async function searchOpenStreetAddresses(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("q", query);

  const response = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const results = (await response.json()) as Array<{ place_id: number; display_name: string }>;
  return results.map((result) => ({
    id: String(result.place_id),
    label: result.display_name,
  }));
}

async function geocodeAddress(address: string, signal?: AbortSignal): Promise<GeoPoint | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("q", address);

  const response = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const [result] = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!result) return null;
  return {
    lat: Number(result.lat),
    lng: Number(result.lon),
    label: result.display_name,
  };
}

async function calculateOsrmRoute(origin: GeoPoint, destination: GeoPoint, signal?: AbortSignal): Promise<RouteSummary | null> {
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    routes?: Array<{
      distance: number;
      duration: number;
      geometry?: { coordinates?: Array<[number, number]> };
    }>;
  };
  const route = data.routes?.[0];
  if (!route?.geometry?.coordinates) return null;
  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    geometry: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  };
}

function formatPanelDateTime(value: string) {
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: value.includes("T") ? "short" : undefined,
  }).format(date);
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

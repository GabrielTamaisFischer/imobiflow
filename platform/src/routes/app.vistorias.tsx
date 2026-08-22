import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Home,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import {
  createInspection,
  createInspectionItem,
  createInspectionMedia,
  createInspectionRoom,
  deleteInspection,
  listInspections,
  loadInspectionRooms,
  updateInspectionItem,
  updateInspectionRoom,
  type Inspection,
  type InspectionInput,
  type InspectionItem,
  type InspectionMedia,
  type InspectionRoom,
} from "@/product/inspections";
import { getModuleByKey } from "@/product/app-modules";
import { listAllProperties, type Property, type PropertySummary } from "@/product/real-estate";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/vistorias")({
  component: InspectionsPage,
});

const typeLabels = {
  entry: "Entrada",
  exit: "Saída",
  maintenance: "Manutenção",
  periodic: "Periódica",
};

const statusLabels = {
  draft: "Rascunho",
  scheduled: "Agendada",
  in_progress: "Em andamento",
  waiting_signature: "Aguardando assinatura",
  completed: "Concluída",
  cancelled: "Cancelada",
  archived: "Arquivada",
};

const conditionLabels = {
  excellent: "Excelente",
  good: "Bom",
  regular: "Regular",
  poor: "Ruim",
  damaged: "Danificado",
  not_checked: "Não verificado",
};

const defaultRoomChecklists: Record<string, string[]> = {
  Entrada: ["Porta de entrada", "Fechadura", "Olho mágico", "Campainha", "Interfone", "Pintura da parede", "Piso"],
  Sala: [
    "Pintura da parede",
    "Piso",
    "Teto",
    "Porta",
    "Janelas",
    "Tomadas",
    "Interruptores",
    "Iluminação",
    "Ar-condicionado",
    "Rede de proteção",
  ],
  Sacada: ["Piso", "Guarda-corpo", "Fechamento de vidro", "Ralo", "Tomadas", "Iluminação", "Tela ou rede de proteção"],
  Cozinha: [
    "Pintura da parede",
    "Revestimento",
    "Piso",
    "Teto",
    "Pia",
    "Torneira",
    "Sifão",
    "Gabinete",
    "Armários",
    "Tomadas",
    "Interruptores",
    "Fogão",
    "Microondas",
    "Hidráulica",
  ],
  Quarto: [
    "Pintura da parede",
    "Piso",
    "Teto",
    "Porta",
    "Janelas",
    "Tomadas",
    "Interruptores",
    "Iluminação",
    "Armários",
    "Persiana",
  ],
  Suíte: [
    "Pintura da parede",
    "Piso",
    "Teto",
    "Porta",
    "Janelas",
    "Tomadas",
    "Interruptores",
    "Armários",
    "Ar-condicionado",
    "Banheiro da suíte",
  ],
  Banheiro: [
    "Pintura da parede",
    "Revestimento",
    "Piso",
    "Teto",
    "Porta",
    "Vaso sanitário",
    "Descarga",
    "Pia",
    "Torneira",
    "Gabinete",
    "Espelho",
    "Box",
    "Chuveiro",
    "Ralos",
    "Registros",
    "Hidráulica",
  ],
  Lavabo: ["Pintura da parede", "Piso", "Teto", "Porta", "Vaso sanitário", "Descarga", "Pia", "Torneira", "Espelho"],
  "Área de serviço": ["Pintura da parede", "Piso", "Teto", "Tanque", "Torneira", "Ralo", "Tomadas", "Hidráulica"],
  Garagem: ["Vaga", "Portão", "Controle de acesso", "Piso", "Pintura", "Iluminação"],
  "Entrega de chaves e acessórios": [
    "Chaves do imóvel",
    "Chave da correspondência",
    "Controles da garagem",
    "Senha atual da fechadura eletrônica",
    "Fechadura eletrônica",
    "Iluminação do imóvel",
    "Torneiras",
    "Chuveiros",
    "Descarga dos vasos sanitários",
    "Janelas",
  ],
};

const defaultInspectionSummary =
  "Este relatório de vistoria tem por objetivo retratar o estado de conservação e funcionamento do imóvel na data de sua realização, com base em observação visual dos ambientes, acabamentos, acessórios e funcionamento aparente dos itens acessíveis. Itens sem acesso, sem teste ou sem informação suficiente devem permanecer expressamente indicados no checklist. As fotos e anexos integram o laudo.";

function InspectionsPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("inspections");
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [roomsByInspection, setRoomsByInspection] = useState<Record<string, InspectionRoom[]>>({});
  const [itemsByInspection, setItemsByInspection] = useState<Record<string, InspectionItem[]>>({});
  const [mediaByInspection, setMediaByInspection] = useState<Record<string, InspectionMedia[]>>({});
  const [isInspectionsLoading, setIsInspectionsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshInspections() {
    setIsInspectionsLoading(true);
    setError(null);

    try {
      const [inspectionsResponse, propertiesResponse] = await Promise.all([
        listInspections(),
        listAllProperties(),
      ]);
      setInspections(inspectionsResponse.inspections);
      setProperties(propertiesResponse.properties);

      const roomPairs = await Promise.all(
        inspectionsResponse.inspections.slice(0, 6).map(async (inspection) => {
          const response = await loadInspectionRooms(inspection.id);
          return [inspection.id, response] as const;
        }),
      );
      setRoomsByInspection(
        Object.fromEntries(roomPairs.map(([inspectionId, response]) => [inspectionId, response.rooms])),
      );
      setItemsByInspection(
        Object.fromEntries(roomPairs.map(([inspectionId, response]) => [inspectionId, response.items])),
      );
      setMediaByInspection(
        Object.fromEntries(roomPairs.map(([inspectionId, response]) => [inspectionId, response.media])),
      );
    } catch (inspectionError) {
      setError(
        inspectionError instanceof Error
          ? inspectionError.message
          : "Não foi possível carregar vistorias.",
      );
    } finally {
      setIsInspectionsLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshInspections();
    }
  }, [isLoading, session]);

  if (pathname !== "/app/vistorias") {
    return <Outlet />;
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Laudos e vistorias</p>
          <p className="text-sm text-muted-foreground">
            Estruture vistorias por imóvel, tipo, cômodos, condições e assinatura futura.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Nova vistoria
        </button>
      </div>

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: vistorias criadas aqui ficam apenas neste navegador.
        </div>
      ) : null}

      {showForm ? (
        <InspectionForm
          properties={properties}
          onCancel={() => setShowForm(false)}
          onCreated={async (inspection) => {
            setInspections((current) => [inspection, ...current]);
            let response = await loadInspectionRooms(inspection.id);
            if (response.rooms.length > 0 && response.items.length === 0) {
              await seedInspectionChecklist(inspection.id, response.rooms);
              response = await loadInspectionRooms(inspection.id);
            }
            setRoomsByInspection((current) => ({ ...current, [inspection.id]: response.rooms }));
            setItemsByInspection((current) => ({ ...current, [inspection.id]: response.items }));
            setMediaByInspection((current) => ({ ...current, [inspection.id]: response.media }));
            setShowForm(false);
          }}
        />
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isInspectionsLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando vistorias...
        </section>
      ) : inspections.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma vistoria criada"
          description="Crie uma vistoria vinculada a um imóvel real. Cômodos padrão serão preparados para iniciar o laudo."
          actionLabel="Criar vistoria"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {inspections.map((inspection) => (
            <InspectionCard
              key={inspection.id}
              inspection={inspection}
              rooms={roomsByInspection[inspection.id] ?? []}
              items={itemsByInspection[inspection.id] ?? []}
              media={mediaByInspection[inspection.id] ?? []}
              onCreateRoom={async (name) => {
                const response = await createInspectionRoom(inspection.id, { name });
                setRoomsByInspection((current) => ({
                  ...current,
                  [inspection.id]: [...(current[inspection.id] ?? []), response.room],
                }));
              }}
              onUpdateRoom={async (roomId, general_condition) => {
                const response = await updateInspectionRoom(inspection.id, roomId, { general_condition });
                setRoomsByInspection((current) => ({
                  ...current,
                  [inspection.id]: (current[inspection.id] ?? []).map((room) =>
                    room.id === roomId ? response.room : room,
                  ),
                }));
              }}
              onCreateItem={async (input) => {
                const response = await createInspectionItem(inspection.id, input);
                setItemsByInspection((current) => ({
                  ...current,
                  [inspection.id]: [...(current[inspection.id] ?? []), response.item],
                }));
              }}
              onUpdateItem={async (itemId, input) => {
                const response = await updateInspectionItem(inspection.id, itemId, input);
                setItemsByInspection((current) => ({
                  ...current,
                  [inspection.id]: (current[inspection.id] ?? []).map((item) =>
                    item.id === itemId ? response.item : item,
                  ),
                }));
              }}
              onCreateMedia={async (input) => {
                const response = await createInspectionMedia(inspection.id, input);
                setMediaByInspection((current) => ({
                  ...current,
                  [inspection.id]: [...(current[inspection.id] ?? []), response.media],
                }));
              }}
              onCreateExitInspection={async () => {
                const response = await createInspection({
                  property_id: inspection.property_id,
                  inspection_type: "exit",
                  status: "draft",
                  title: `Vistoria de saída - ${inspection.properties?.code ?? inspection.properties?.title ?? inspection.title}`,
                  summary: `${defaultInspectionSummary}\n\nLaudo final para comparação com a vistoria de entrada, conferindo conservação, funcionamento aparente, acessórios, fotos e eventuais reparos de responsabilidade a apurar.`,
                  tenant_name: inspection.tenant_name ?? undefined,
                  tenant_document: inspection.tenant_document ?? undefined,
                  owner_name: inspection.owner_name ?? undefined,
                  create_default_rooms: true,
                });
                let roomResponse = await loadInspectionRooms(response.inspection.id);
                await seedInspectionChecklist(response.inspection.id, roomResponse.rooms);
                roomResponse = await loadInspectionRooms(response.inspection.id);
                setInspections((current) => [response.inspection, ...current]);
                setRoomsByInspection((current) => ({ ...current, [response.inspection.id]: roomResponse.rooms }));
                setItemsByInspection((current) => ({ ...current, [response.inspection.id]: roomResponse.items }));
                setMediaByInspection((current) => ({ ...current, [response.inspection.id]: roomResponse.media }));
              }}
              onDelete={async () => {
                if (!window.confirm("Excluir esta vistoria e todos os registros vinculados?")) return;
                await deleteInspection(inspection.id);
                setInspections((current) => current.filter((item) => item.id !== inspection.id));
              }}
            />
          ))}
        </section>
      )}
    </ModulePage>
  );
}

function InspectionForm({
  properties,
  onCancel,
  onCreated,
}: {
  properties: PropertySummary[];
  onCancel: () => void;
  onCreated: (inspection: Inspection) => void | Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propertySearch, setPropertySearch] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const eligibleProperties = properties.filter(propertySupportsInspection);
  const normalizedSearch = propertySearch.trim().toLowerCase();
  const filteredProperties = eligibleProperties.filter((property) => {
    const searchable = [property.code, property.title, property.neighborhood, property.city]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return !normalizedSearch || searchable.includes(normalizedSearch);
  });
  const selectedProperty = eligibleProperties.find((property) => property.id === selectedPropertyId);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const scheduledAt = String(form.get("scheduled_at") ?? "");
    const input: InspectionInput = {
      property_id: selectedPropertyId || String(form.get("property_id") ?? ""),
      inspection_type: String(form.get("inspection_type") ?? "entry") as InspectionInput["inspection_type"],
      status: String(form.get("status") ?? "draft") as InspectionInput["status"],
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      title:
        String(form.get("title") ?? "") ||
        `${String(form.get("inspection_type") ?? "entry") === "exit" ? "Vistoria de saída" : "Vistoria de entrada"} - ${
          selectedProperty?.code ?? selectedProperty?.title ?? "imóvel"
        }`,
      summary: String(form.get("summary") ?? "") || defaultInspectionSummary,
      tenant_name: String(form.get("tenant_name") ?? ""),
      tenant_document: String(form.get("tenant_document") ?? ""),
      owner_name: String(form.get("owner_name") ?? ""),
      create_default_rooms: true,
    };

    try {
      const response = await createInspection(input);
      await onCreated(response.inspection);
      formElement.reset();
      setPropertySearch("");
      setSelectedPropertyId("");
    } catch (inspectionError) {
      setError(inspectionError instanceof Error ? inspectionError.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Nova vistoria</h2>
          <p className="text-sm text-muted-foreground">
            Vincule a um imóvel e defina o tipo de vistoria. Fotos e assinatura entram na próxima fase.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          Cancelar
        </button>
      </div>

      {properties.length === 0 ? (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
          Cadastre um imóvel de locação ou temporada antes de criar uma vistoria operacional.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 text-sm xl:col-span-2">
          <span className="font-medium">Pesquisar imóvel por código</span>
          <input
            value={propertySearch}
            onChange={(event) => setPropertySearch(event.target.value)}
            placeholder="Digite o código único, bairro ou título"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input name="property_id" type="hidden" value={selectedPropertyId} />
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border bg-background p-2">
            {filteredProperties.length > 0 ? (
              filteredProperties.slice(0, 8).map((property) => (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => setSelectedPropertyId(property.id)}
                  className={`w-full rounded-md border p-3 text-left transition ${
                    selectedPropertyId === property.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <p className="text-sm font-semibold">{property.code || "Sem código"} · {property.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[property.neighborhood, property.city, property.state].filter(Boolean).join(", ") || "Localização não informada"}
                  </p>
                </button>
              ))
            ) : (
              <p className="p-2 text-xs text-muted-foreground">
                Nenhum imóvel com locação ou temporada encontrado com esse termo.
              </p>
            )}
          </div>
        </div>
        <Field label="Título" name="title" placeholder="Vistoria de entrada" />
        <Field label="Agendamento" name="scheduled_at" type="datetime-local" />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tipo</span>
          <select
            name="inspection_type"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue="entry"
          >
            <option value="entry">Entrada</option>
            <option value="exit">Saída</option>
            <option value="maintenance">Manutenção</option>
            <option value="periodic">Periódica</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Status</span>
          <select
            name="status"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue="draft"
          >
            <option value="draft">Rascunho</option>
            <option value="scheduled">Agendada</option>
            <option value="in_progress">Em andamento</option>
          </select>
        </label>
        <Field label="Locatário" name="tenant_name" />
        <Field label="Documento do locatário" name="tenant_document" />
        <Field label="Proprietário no laudo" name="owner_name" />
      </div>

      <label className="mt-3 block space-y-1 text-sm">
        <span className="font-medium">Resumo inicial</span>
        <textarea
          name="summary"
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Objetivo da vistoria, contexto da locação, observações iniciais."
        />
      </label>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSaving || !selectedPropertyId}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Salvar vistoria
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function propertySupportsInspection(property: Property | PropertySummary) {
  const commercialTerms = "commercial_terms_json" in property ? property.commercial_terms_json ?? {} : {};
  const publicationSettings = "publication_settings_json" in property ? property.publication_settings_json ?? {} : {};
  const operationValue = String(property.operation ?? "").toLowerCase();
  const operationHints = [
    operationValue,
    String(commercialTerms.operation ?? ""),
    String(commercialTerms.transaction ?? ""),
    String(commercialTerms.transaction_type ?? ""),
    String(publicationSettings.operation ?? ""),
    String(publicationSettings.transaction ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  const hasRentalOperation =
    operationValue === "rent" ||
    operationValue === "both" ||
    operationHints.includes("loca") ||
    operationHints.includes("rent") ||
    operationHints.includes("temporada") ||
    operationHints.includes("season");

  const hasRentalValues =
    Boolean(property.rent_price_cents) ||
    Boolean(Number(commercialTerms.rent_price_cents ?? 0)) ||
    Boolean(Number(commercialTerms.original_rent_price_cents ?? 0)) ||
    Boolean(Number(commercialTerms.final_rent_price_cents ?? 0)) ||
    Boolean(Number(commercialTerms.season_price_cents ?? 0));

  const hasRentalNotes =
    Boolean(String(commercialTerms.rent_notes ?? "").trim()) ||
    Boolean(String(commercialTerms.season_notes ?? "").trim());

  return property.status !== "archived" && (hasRentalOperation || hasRentalValues || hasRentalNotes);
}

async function seedInspectionChecklist(inspectionId: string, rooms: InspectionRoom[]) {
  const createdLabels = new Set<string>();
  for (const room of rooms) {
    const labels = defaultRoomChecklists[room.name] ?? [
      "Pintura da parede",
      "Piso",
      "Teto",
      "Porta",
      "Janelas",
      "Elétrica",
      "Hidráulica",
    ];

    for (const [index, label] of labels.entries()) {
      const key = `${room.id}:${label}`;
      if (createdLabels.has(key)) continue;
      createdLabels.add(key);
      await createInspectionItem(inspectionId, {
        room_id: room.id,
        label,
        category: room.name,
        condition: "not_checked",
        notes: "",
        repair_required: false,
        position: index + 1,
      });
    }
  }
}

function InspectionCard({
  inspection,
  rooms,
  items,
  media,
  onCreateRoom,
  onUpdateRoom,
  onCreateItem,
  onUpdateItem,
  onCreateMedia,
  onCreateExitInspection,
  onDelete,
}: {
  inspection: Inspection;
  rooms: InspectionRoom[];
  items: InspectionItem[];
  media: InspectionMedia[];
  onCreateRoom: (name: string) => Promise<void>;
  onUpdateRoom: (
    roomId: string,
    general_condition: InspectionRoom["general_condition"],
  ) => Promise<void>;
  onCreateItem: (input: {
    room_id?: string;
    label: string;
    category?: string;
    condition?: InspectionItem["condition"];
    notes?: string;
    repair_required?: boolean;
  }) => Promise<void>;
  onUpdateItem: (
    itemId: string,
    input: { condition?: InspectionItem["condition"]; repair_required?: boolean },
  ) => Promise<void>;
  onCreateMedia: (input: {
    room_id?: string;
    item_id?: string;
    media_type?: InspectionMedia["media_type"];
    file_url?: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
    caption?: string;
  }) => Promise<void>;
  onCreateExitInspection: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showMediaForm, setShowMediaForm] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [isCreatingExit, setIsCreatingExit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isSavingMedia, setIsSavingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const location = [
    inspection.properties?.neighborhood,
    inspection.properties?.city,
    inspection.properties?.state,
  ]
    .filter(Boolean)
    .join(", ");

  const itemsByRoom = rooms.map((room) => ({
    ...room,
    items: items.filter((item) => item.room_id === room.id),
  }));

  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));
  const itemNameById = new Map(items.map((item) => [item.id, item.label]));

  async function handleCreateRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingRoom(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await onCreateRoom(String(form.get("room_name") ?? ""));
      formElement.reset();
      setShowRoomForm(false);
    } finally {
      setIsSavingRoom(false);
    }
  }

  async function handleCreateItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingItem(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await onCreateItem({
        room_id: String(form.get("room_id") ?? ""),
        label: String(form.get("label") ?? ""),
        category: String(form.get("category") ?? ""),
        condition: String(form.get("condition") ?? "not_checked") as InspectionItem["condition"],
        notes: String(form.get("notes") ?? ""),
        repair_required: form.get("repair_required") === "on",
      });
      formElement.reset();
      setShowItemForm(false);
    } finally {
      setIsSavingItem(false);
    }
  }

  async function handleCreateMedia(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingMedia(true);
    setMediaError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");
    const attachedFile = file instanceof File && file.size > 0 ? file : null;
    const typedUrl = String(form.get("file_url") ?? "").trim();

    try {
      const fileUrl = attachedFile ? await readFileAsDataUrl(attachedFile) : typedUrl;

      if (!fileUrl) {
        setMediaError("Selecione um arquivo ou informe uma URL para registrar.");
        return;
      }

      await onCreateMedia({
        room_id: String(form.get("room_id") ?? ""),
        item_id: String(form.get("item_id") ?? ""),
        media_type: inferMediaType(attachedFile?.type, typedUrl),
        file_url: fileUrl,
        file_name: attachedFile?.name || typedUrl.split("/").pop() || "",
        mime_type: attachedFile?.type || "",
        file_size: attachedFile?.size,
        caption: String(form.get("caption") ?? ""),
      });
      formElement.reset();
      setShowMediaForm(false);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Não foi possível registrar a mídia.");
    } finally {
      setIsSavingMedia(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {typeLabels[inspection.inspection_type]}
          </p>
          <h2 className="mt-1 line-clamp-2 text-base font-semibold">{inspection.title}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {inspection.properties?.title ?? "Imóvel não informado"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {statusLabels[inspection.status]}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowChecklist((current) => !current)}
          className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {showChecklist ? "Ocultar edição" : "Editar checklist"}
        </button>
        {inspection.inspection_type !== "exit" ? (
          <button
            type="button"
            onClick={async () => {
              setIsCreatingExit(true);
              try {
                await onCreateExitInspection();
              } finally {
                setIsCreatingExit(false);
              }
            }}
            disabled={isCreatingExit}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            {isCreatingExit ? "Criando..." : "Criar vistoria final"}
          </button>
        ) : null}
        <Link
          to="/app/vistorias/$inspectionId"
          params={{ inspectionId: inspection.id }}
          className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          Abrir laudo
        </Link>
        <button
          type="button"
          onClick={async () => {
            setIsDeleting(true);
            try {
              await onDelete();
            } finally {
              setIsDeleting(false);
            }
          }}
          disabled={isDeleting}
          className="inline-flex h-8 items-center justify-center rounded-md border border-destructive/40 px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
        >
          {isDeleting ? "Excluindo..." : "Excluir"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniInfo icon={Home} label="Imóvel" value={inspection.properties?.code ?? "Sem código"} />
        <MiniInfo icon={CalendarDays} label="Agenda" value={formatDate(inspection.scheduled_at)} />
        <MiniInfo icon={FileText} label="PDF" value={inspection.pdf_url ? "Gerado" : "Pendente"} />
      </div>

      {location ? <p className="mt-4 text-sm text-muted-foreground">{location}</p> : null}

      {showChecklist && rooms.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Ambientes e checklist</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRoomForm((current) => !current)}
                className="h-8 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                Ambiente
              </button>
              <button
                type="button"
                onClick={() => setShowItemForm((current) => !current)}
                className="h-8 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Item
              </button>
            </div>
          </div>

          {showRoomForm ? (
            <form onSubmit={handleCreateRoom} className="mb-3 flex gap-2">
              <input
                name="room_name"
                required
                placeholder="Ex: Varanda gourmet"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={isSavingRoom}
                className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                Salvar
              </button>
            </form>
          ) : null}

          {showItemForm ? (
            <form onSubmit={handleCreateItem} className="mb-3 grid gap-2 rounded-md border border-border bg-background p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  name="label"
                  required
                  placeholder="Ex: Pintura da parede"
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <select
                  name="room_id"
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  defaultValue={rooms[0]?.id ?? ""}
                >
                  <option value="">Sem ambiente</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
                <input
                  name="category"
                  placeholder="Categoria"
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <select
                  name="condition"
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  defaultValue="not_checked"
                >
                  {Object.entries(conditionLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                name="notes"
                rows={2}
                placeholder="Observações técnicas do item."
                className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input name="repair_required" type="checkbox" className="h-4 w-4" />
                  Reparo necessário
                </label>
                <button
                  type="submit"
                  disabled={isSavingItem}
                  className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  Salvar item
                </button>
              </div>
            </form>
          ) : null}

          <div className="space-y-3">
            {itemsByRoom.map((room) => (
              <div key={room.id} className="rounded-md border border-border bg-background p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">{room.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {room.items.length} item(ns) · {conditionLabels[room.general_condition]}
                    </p>
                  </div>
                  <select
                    value={room.general_condition}
                    onChange={(event) =>
                      void onUpdateRoom(
                        room.id,
                        event.currentTarget.value as InspectionRoom["general_condition"],
                      )
                    }
                    className="h-8 rounded-md border border-input bg-card px-2 text-xs outline-none"
                  >
                    {Object.entries(conditionLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {room.items.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {room.items.map((item) => (
                      <InspectionItemRow
                        key={item.id}
                        item={item}
                        onUpdate={(input) => onUpdateItem(item.id, input)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Nenhum item vistoriado neste ambiente.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : showChecklist ? (
        <div className="mt-4 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Nenhum ambiente cadastrado.
        </div>
      ) : null}

      {showChecklist && items.filter((item) => !item.room_id).length > 0 ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3">
          <p className="mb-2 text-sm font-semibold">Itens sem ambiente</p>
          <div className="space-y-2">
            {items
              .filter((item) => !item.room_id)
              .map((item) => (
                <InspectionItemRow
                  key={item.id}
                  item={item}
                  onUpdate={(input) => onUpdateItem(item.id, input)}
                />
              ))}
          </div>
        </div>
      ) : null}

      {showChecklist ? (
      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Fotos e anexos</p>
            <p className="text-xs text-muted-foreground">
              Registros vinculados à vistoria, ambiente ou item técnico.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowMediaForm((current) => !current)}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <ImagePlus className="h-4 w-4" />
            Foto/anexo
          </button>
        </div>

        {showMediaForm ? (
          <form onSubmit={handleCreateMedia} className="mb-3 grid gap-2 rounded-md border border-border bg-card p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Arquivo</span>
                <input
                  name="file"
                  type="file"
                  accept="image/*,.pdf"
                  className="block w-full text-xs file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-primary file:px-3 file:text-xs file:font-semibold file:text-primary-foreground"
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>URL do arquivo</span>
                <input
                  name="file_url"
                  type="url"
                  placeholder="https://..."
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <select
                name="room_id"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                defaultValue=""
              >
                <option value="">Sem ambiente</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
              <select
                name="item_id"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                defaultValue=""
              >
                <option value="">Sem item técnico</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              name="caption"
              rows={2}
              placeholder="Legenda ou observação do registro."
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {mediaError ? <p className="text-xs text-destructive">{mediaError}</p> : null}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingMedia}
                className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                Salvar registro
              </button>
            </div>
          </form>
        ) : null}

        {media.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {media.map((entry) => (
              <InspectionMediaCard
                key={entry.id}
                media={entry}
                roomName={entry.room_id ? roomNameById.get(entry.room_id) : undefined}
                itemName={entry.item_id ? itemNameById.get(entry.item_id) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Nenhuma foto ou anexo registrado nesta vistoria.
          </div>
        )}
      </div>
      ) : null}
    </article>
  );
}

function InspectionItemRow({
  item,
  onUpdate,
}: {
  item: InspectionItem;
  onUpdate: (input: { condition?: InspectionItem["condition"]; repair_required?: boolean }) => Promise<void>;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.label}</p>
          <p className="text-xs text-muted-foreground">
            {item.category || "Sem categoria"}
            {item.repair_required ? " · Reparo necessário" : ""}
          </p>
          {item.notes ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.notes}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void onUpdate({ repair_required: !item.repair_required })}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
              item.repair_required
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
            title="Marcar reparo"
          >
            <Wrench className="h-4 w-4" />
          </button>
          <select
            value={item.condition}
            onChange={(event) =>
              void onUpdate({ condition: event.currentTarget.value as InspectionItem["condition"] })
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none"
          >
            {Object.entries(conditionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function InspectionMediaCard({
  media,
  roomName,
  itemName,
}: {
  media: InspectionMedia;
  roomName?: string;
  itemName?: string;
}) {
  const mediaUrl = media.signed_url || media.file_url || "";
  const isImage = media.media_type === "photo" || media.mime_type?.startsWith("image/");
  const context = [roomName, itemName].filter(Boolean).join(" · ");

  return (
    <article className="overflow-hidden rounded-md border border-border bg-card">
      {isImage && mediaUrl ? (
        <img
          src={mediaUrl}
          alt={media.caption || media.file_name || "Registro da vistoria"}
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className="flex h-36 items-center justify-center bg-muted text-muted-foreground">
          <Paperclip className="h-8 w-8" />
        </div>
      )}
      <div className="space-y-1 p-3">
        <p className="line-clamp-1 text-sm font-medium">
          {media.caption || media.file_name || "Registro sem legenda"}
        </p>
        {context ? <p className="line-clamp-1 text-xs text-muted-foreground">{context}</p> : null}
        <p className="text-xs text-muted-foreground">
          {media.file_name || media.mime_type || "Arquivo"}
          {media.file_size ? ` · ${formatFileSize(media.file_size)}` : ""}
        </p>
        {!isImage && mediaUrl ? (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-xs font-medium text-primary hover:underline"
          >
            Abrir anexo
          </a>
        ) : null}
      </div>
    </article>
  );
}

function inferMediaType(mimeType?: string, url?: string): InspectionMedia["media_type"] {
  if (mimeType?.startsWith("image/")) return "photo";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (url && /\.(png|jpe?g|webp|gif|heic)$/i.test(url)) return "photo";
  return "document";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function MiniInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Home;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <Icon className="mb-2 h-4 w-4 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

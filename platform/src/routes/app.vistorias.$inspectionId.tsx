import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Home,
  Image,
  Loader2,
  PenLine,
  Plus,
  Printer,
  ShieldCheck,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import {
  createInspectionItem,
  createInspectionMedia,
  createInspectionRoom,
  createInspectionSignature,
  createInspectionSignatureInvite,
  deleteInspection,
  deleteInspectionMedia,
  generateInspectionPdf,
  getInspectionDetails,
  signInspectionSignature,
  updateInspection,
  updateInspectionItem,
  updateInspectionRoom,
  type Inspection,
  type InspectionItem,
  type InspectionMedia,
  type InspectionRoom,
  type InspectionSignature,
} from "@/product/inspections";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/vistorias/$inspectionId")({
  component: InspectionDetailPage,
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

const signerRoleLabels = {
  tenant: "Locatário",
  owner: "Proprietário",
  broker: "Corretor",
  manager: "Gestor",
  witness: "Testemunha",
};

const signatureStatusLabels = {
  pending: "Pendente",
  signed: "Assinada",
  cancelled: "Cancelada",
  expired: "Expirada",
};

const legalInspectionSummary =
  "Este relatório de vistoria tem por objetivo retratar o estado de conservação e funcionamento do imóvel na data de sua realização, em atendimento ao disposto no art. 22, inciso V, e art. 23, inciso III, da Lei nº 8.245/91. A vistoria foi realizada por observação visual da construção, acabamentos, acessórios e funcionamento aparente dos itens acessíveis, não abrangendo aspectos estruturais, fundações ou vícios ocultos. Da mesma forma que está sendo entregue ao locatário, assim deverá ser devolvido ao locador, considerando as observações, fotos e anexos registrados neste laudo.";

const keyDeliveryRoomName = "Entrega de chaves e acessórios";

const keyDeliveryChecklist = [
  "Chaves do imóvel",
  "Chave da correspondência",
  "Controles da garagem",
  "Senha atual da fechadura eletrônica",
  "Fechadura eletrônica",
  "Olho mágico da entrada social",
  "Campainha",
  "Iluminação do imóvel",
  "Torneiras",
  "Chuveiros",
  "Descarga dos vasos sanitários",
  "Janelas",
  "Vidros dos fechamentos das sacadas",
  "Ar-condicionado sala com controle",
  "Ar-condicionado varanda gourmet com controle",
  "Ar-condicionado dormitório 01 com controle",
  "Ar-condicionado dormitório 02 com controle",
  "Ar-condicionado suíte com controle",
  "TV embutida da suíte com controle",
  "Microondas",
  "Fogão embutido",
  "Persiana de enrolar",
];

const quickObservationChips = [
  "em bom estado",
  "em ótimo estado",
  "pintura nova",
  "funcionando",
  "sem vazamentos aparentes",
  "sem teste",
  "com pequenas imperfeições",
  "com manchas",
  "com furos",
  "com avaria",
  "necessita reparo",
  "vidros inteiros",
  "abrindo normalmente",
  "fechando normalmente",
];

function InspectionDetailPage() {
  const { inspectionId } = Route.useParams();
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("inspections");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [rooms, setRooms] = useState<InspectionRoom[]>([]);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [media, setMedia] = useState<InspectionMedia[]>([]);
  const [signatures, setSignatures] = useState<InspectionSignature[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isDeletingInspection, setIsDeletingInspection] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCreatingSignature, setIsCreatingSignature] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signatureForm, setSignatureForm] = useState({
    signer_name: "",
    signer_document: "",
    signer_email: "",
    signer_role: "tenant" as InspectionSignature["signer_role"],
  });

  useEffect(() => {
    if (!isLoading && session) {
      void loadDetail();
    }
  }, [isLoading, session, inspectionId]);

  async function loadDetail() {
    setIsDetailLoading(true);
    setError(null);

    try {
      const response = await getInspectionDetails(inspectionId);
      setInspection(response.inspection);
      setRooms(response.rooms);
      setItems(response.items);
      setMedia(response.media);
      setSignatures(response.signatures ?? []);
    } catch (detailError) {
      setError(
        detailError instanceof Error ? detailError.message : "Não foi possível carregar o laudo.",
      );
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function handleGeneratePdf() {
    setIsGeneratingPdf(true);
    setPdfError(null);

    try {
      const response = await generateInspectionPdf(inspectionId);
      setInspection(response.inspection);
    } catch (pdfGenerationError) {
      setPdfError(
        pdfGenerationError instanceof Error
          ? pdfGenerationError.message
          : "Não foi possível gerar o PDF do laudo.",
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function handleOpenPdf() {
    if (inspection?.pdf_url) {
      window.open(inspection.pdf_url, "_blank", "noopener,noreferrer");
      return;
    }

    setIsGeneratingPdf(true);
    setPdfError(null);
    try {
      const response = await generateInspectionPdf(inspectionId);
      setInspection(response.inspection);
      window.open(response.pdf.signed_url, "_blank", "noopener,noreferrer");
    } catch (pdfGenerationError) {
      setPdfError(
        pdfGenerationError instanceof Error
          ? pdfGenerationError.message
          : "Não foi possível abrir o PDF do laudo.",
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function handleDeleteInspection() {
    if (!window.confirm("Excluir esta vistoria e todos os ambientes, itens, anexos e assinaturas?")) return;
    setIsDeletingInspection(true);
    try {
      await deleteInspection(inspectionId);
      window.location.href = "/app/vistorias";
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir a vistoria.");
      setIsDeletingInspection(false);
    }
  }

  async function handleCreateSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingSignature(true);
    setSignatureError(null);

    try {
      const response = await createInspectionSignature(inspectionId, signatureForm);
      setInspection(response.inspection);
      setSignatures((current) => [...current, response.signature]);
      setSignatureForm({
        signer_name: "",
        signer_document: "",
        signer_email: "",
        signer_role: "tenant",
      });
    } catch (signatureCreationError) {
      setSignatureError(
        signatureCreationError instanceof Error
          ? signatureCreationError.message
          : "Não foi possível criar a assinatura.",
      );
    } finally {
      setIsCreatingSignature(false);
    }
  }

  async function handleSign(signature: InspectionSignature) {
    setSigningId(signature.id);
    setSignatureError(null);

    try {
      const response = await signInspectionSignature(inspectionId, signature.id, {
        signature_text: signature.signer_name,
        accepted_terms: true,
      });
      setInspection(response.inspection);
      setSignatures((current) =>
        current.map((item) => (item.id === response.signature.id ? response.signature : item)),
      );
    } catch (signatureSignError) {
      setSignatureError(
        signatureSignError instanceof Error
          ? signatureSignError.message
          : "Não foi possível confirmar a assinatura.",
      );
    } finally {
      setSigningId(null);
    }
  }

  async function handleOpenSignatureInvite(signature: InspectionSignature) {
    setInvitingId(signature.id);
    setSignatureError(null);
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");

    try {
      const response = await createInspectionSignatureInvite(inspectionId, signature.id);
      setSignatures((current) =>
        current.map((item) => (item.id === response.signature.id ? response.signature : item)),
      );
      if (!response.invite) throw new Error("Convite de assinatura não disponível.");
      if (popup) popup.location.href = response.invite.url_path;
      else window.location.href = response.invite.url_path;
    } catch (inviteError) {
      popup?.close();
      setSignatureError(inviteError instanceof Error ? inviteError.message : "Não foi possível gerar o convite.");
    } finally {
      setInvitingId(null);
    }
  }

  const metrics = useMemo(() => {
    const repairs = items.filter((item) => item.repair_required).length;
    const checkedItems = items.filter((item) => item.condition !== "not_checked").length;
    const damagedItems = items.filter((item) => item.condition === "damaged").length;

    return {
      rooms: rooms.length,
      items: items.length,
      checkedItems,
      repairs,
      damagedItems,
      media: media.length,
    };
  }, [items, media.length, rooms.length]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <a
          href="/app/vistorias"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Vistorias
        </a>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleOpenPdf}
            disabled={!inspection || isGeneratingPdf}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir PDF
          </button>
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={!inspection || isGeneratingPdf}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {inspection?.pdf_url ? "Gerar novo PDF" : "Gerar PDF"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!inspection}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            <Printer className="h-4 w-4" />
            Imprimir laudo
          </button>
          <button
            type="button"
            onClick={() => setIsEditMode((current) => !current)}
            disabled={!inspection}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            <PenLine className="h-4 w-4" />
            {isEditMode ? "Fechar edição" : "Editar laudo"}
          </button>
          <button
            type="button"
            onClick={handleDeleteInspection}
            disabled={!inspection || isDeletingInspection}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {isDeletingInspection ? "Excluindo..." : "Excluir vistoria"}
          </button>
        </div>
      </div>

      {isDetailLoading ? (
        <section className="flex min-h-[360px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando laudo...
        </section>
      ) : error ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </section>
      ) : inspection ? (
        <section className="space-y-4">
          <ReportHeader inspection={inspection} />
          {isEditMode ? (
            <InspectionEditor
              inspection={inspection}
              rooms={rooms}
              items={items}
              media={media}
              onInspectionUpdated={setInspection}
              onRoomCreated={(room) => setRooms((current) => [...current, room])}
              onRoomUpdated={(room) =>
                setRooms((current) => current.map((item) => (item.id === room.id ? room : item)))
              }
              onItemCreated={(item) => setItems((current) => [...current, item])}
              onItemUpdated={(item) =>
                setItems((current) => current.map((entry) => (entry.id === item.id ? item : entry)))
              }
              onMediaCreated={(entry) => setMedia((current) => [...current, entry])}
              onMediaDeleted={(mediaId) =>
                setMedia((current) => current.filter((entry) => entry.id !== mediaId))
              }
            />
          ) : null}
          {pdfError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive print:hidden">
              {pdfError}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Metric icon={Home} label="Ambientes" value={String(metrics.rooms)} />
            <Metric icon={ClipboardList} label="Itens" value={String(metrics.items)} />
            <Metric icon={CheckCircle2} label="Verificados" value={String(metrics.checkedItems)} />
            <Metric icon={Wrench} label="Reparos" value={String(metrics.repairs)} />
            <Metric icon={ShieldCheck} label="Danos" value={String(metrics.damagedItems)} />
            <Metric icon={Image} label="Mídias" value={String(metrics.media)} />
          </div>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <ReportSummary inspection={inspection} />
              <InspectionFinalDeclarations />
              <RoomsReport rooms={rooms} items={items} media={media} />
            </div>
            <aside className="space-y-4">
              <Parties inspection={inspection} />
              <SignaturePanel
                signatures={signatures}
                form={signatureForm}
                isCreating={isCreatingSignature}
                signingId={signingId}
                invitingId={invitingId}
                error={signatureError}
                onFormChange={setSignatureForm}
                onCreate={handleCreateSignature}
                onSign={handleSign}
                onInvite={handleOpenSignatureInvite}
              />
              <MediaReport media={media} rooms={rooms} items={items} />
              <PdfPreparation metrics={metrics} pdfUrl={inspection.pdf_url} />
            </aside>
          </section>
        </section>
      ) : null}
    </ModulePage>
  );
}

function InspectionEditor({
  inspection,
  rooms,
  items,
  media,
  onInspectionUpdated,
  onRoomCreated,
  onRoomUpdated,
  onItemCreated,
  onItemUpdated,
  onMediaCreated,
  onMediaDeleted,
}: {
  inspection: Inspection;
  rooms: InspectionRoom[];
  items: InspectionItem[];
  media: InspectionMedia[];
  onInspectionUpdated: (inspection: Inspection) => void;
  onRoomCreated: (room: InspectionRoom) => void;
  onRoomUpdated: (room: InspectionRoom) => void;
  onItemCreated: (item: InspectionItem) => void;
  onItemUpdated: (item: InspectionItem) => void;
  onMediaCreated: (media: InspectionMedia) => void;
  onMediaDeleted: (mediaId: string) => void;
}) {
  const [isSavingHeader, setIsSavingHeader] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState<string | null>(null);
  const [isSavingMedia, setIsSavingMedia] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  async function handleHeaderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingHeader(true);
    setEditorError(null);

    const form = new FormData(event.currentTarget);
    const scheduledAt = String(form.get("scheduled_at") ?? "");

    try {
      const response = await updateInspection(inspection.id, {
        title: String(form.get("title") ?? ""),
        status: String(form.get("status") ?? "draft") as Inspection["status"],
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : "",
        summary: String(form.get("summary") ?? ""),
        tenant_name: String(form.get("tenant_name") ?? ""),
        tenant_document: String(form.get("tenant_document") ?? ""),
        owner_name: String(form.get("owner_name") ?? ""),
      });
      onInspectionUpdated(response.inspection);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível salvar o laudo.");
    } finally {
      setIsSavingHeader(false);
    }
  }

  async function handleCreateItem(event: FormEvent<HTMLFormElement>, room: InspectionRoom) {
    event.preventDefault();
    setIsSavingItem(room.id);
    setEditorError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      const response = await createInspectionItem(inspection.id, {
        room_id: room.id,
        label: String(form.get("label") ?? ""),
        category: String(form.get("category") ?? room.name),
        condition: String(form.get("condition") ?? "not_checked") as InspectionItem["condition"],
        notes: String(form.get("notes") ?? ""),
        repair_required: form.get("repair_required") === "on",
      });
      onItemCreated(response.item);
      formElement.reset();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível adicionar o item.");
    } finally {
      setIsSavingItem(null);
    }
  }

  async function handleCreateMedia(event: FormEvent<HTMLFormElement>, room: InspectionRoom) {
    event.preventDefault();
    setIsSavingMedia(room.id);
    setEditorError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const files = form.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
    const caption = String(form.get("caption") ?? "");

    try {
      if (files.length === 0) {
        setEditorError("Selecione uma ou mais fotos, imagens da galeria ou anexos.");
        return;
      }

      for (const file of files) {
        const response = await createInspectionMedia(inspection.id, {
          room_id: room.id,
          media_type: inferMediaType(file.type, file.name),
          file_url: await readFileAsDataUrl(file),
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
          caption,
        });
        onMediaCreated(response.media);
      }
      formElement.reset();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível anexar os arquivos.");
    } finally {
      setIsSavingMedia(null);
    }
  }

  async function handleDeleteMedia(mediaId: string) {
    if (!window.confirm("Excluir esta foto ou anexo da vistoria?")) return;
    await deleteInspectionMedia(inspection.id, mediaId);
    onMediaDeleted(mediaId);
  }

  async function handleApplyLegalSummary() {
    setIsSavingHeader(true);
    setEditorError(null);

    try {
      const response = await updateInspection(inspection.id, {
        summary: mergeSummaryText(inspection.summary, legalInspectionSummary),
      });
      onInspectionUpdated(response.inspection);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível aplicar o resumo padrão.");
    } finally {
      setIsSavingHeader(false);
    }
  }

  async function handleGenerateExitSummary() {
    setIsSavingHeader(true);
    setEditorError(null);

    try {
      const response = await updateInspection(inspection.id, {
        summary: mergeSummaryText(inspection.summary, buildExitInspectionSummary(items)),
      });
      onInspectionUpdated(response.inspection);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível gerar o resumo de saída.");
    } finally {
      setIsSavingHeader(false);
    }
  }

  async function handleAddKeyDeliveryChecklist() {
    setIsSavingHeader(true);
    setEditorError(null);

    try {
      let keyRoom = rooms.find((room) => normalizeComparable(room.name) === normalizeComparable(keyDeliveryRoomName));

      if (!keyRoom) {
        const response = await createInspectionRoom(inspection.id, {
          name: keyDeliveryRoomName,
          position: rooms.length,
          general_condition: "not_checked",
          notes:
            "Checklist de entrega de chaves, controles, acessórios e funcionamento aparente informado no ato da vistoria.",
        });
        keyRoom = response.room;
        onRoomCreated(response.room);
      }

      const existingLabels = new Set(
        items
          .filter((item) => item.room_id === keyRoom?.id)
          .map((item) => normalizeComparable(item.label)),
      );

      for (const label of keyDeliveryChecklist) {
        if (existingLabels.has(normalizeComparable(label))) continue;

        const response = await createInspectionItem(inspection.id, {
          room_id: keyRoom.id,
          label,
          category: "Entrega de chaves",
          condition: "not_checked",
          notes: buildTechnicalItemNote({
            label,
            condition: "not_checked",
            notes: "",
            repair_required: false,
          }),
          repair_required: false,
        });
        onItemCreated(response.item);
      }

      const response = await updateInspection(inspection.id, {
        summary: mergeSummaryText(
          inspection.summary,
          "Incluído checklist de entrega de chaves e acessórios para conferência de controles, chaves, fechaduras, equipamentos e funcionamento aparente dos itens entregues ao locatário.",
        ),
      });
      onInspectionUpdated(response.inspection);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível adicionar o termo de chaves.");
    } finally {
      setIsSavingHeader(false);
    }
  }

  async function handleGenerateRoomSummary(room: InspectionRoom) {
    setIsSavingItem(room.id);
    setEditorError(null);

    try {
      const response = await updateInspectionRoom(inspection.id, room.id, {
        name: room.name,
        notes: buildRoomTechnicalSummary(room, items.filter((item) => item.room_id === room.id)),
      });
      onRoomUpdated(response.room);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível gerar o resumo do cômodo.");
    } finally {
      setIsSavingItem(null);
    }
  }

  async function handleAppendQuickObservation(item: InspectionItem, observation: string) {
    setIsSavingItem(item.id);
    setEditorError(null);

    try {
      const response = await updateInspectionItem(inspection.id, item.id, {
        notes: appendObservation(item.notes, observation),
      });
      onItemUpdated(response.item);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível adicionar a observação.");
    } finally {
      setIsSavingItem(null);
    }
  }

  async function handleGenerateTechnicalNote(item: InspectionItem) {
    setIsSavingItem(item.id);
    setEditorError(null);

    try {
      const response = await updateInspectionItem(inspection.id, item.id, {
        notes: buildTechnicalItemNote(item),
      });
      onItemUpdated(response.item);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível gerar o texto técnico.");
    } finally {
      setIsSavingItem(null);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4 print:hidden">
      <div>
        <h2 className="text-base font-semibold">Editar arquivo da vistoria</h2>
        <p className="text-sm text-muted-foreground">
          Ajuste dados do laudo, ambientes, detalhes, observações e fotos antes de gerar o PDF final.
        </p>
      </div>

      {editorError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {editorError}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => void handleApplyLegalSummary()}
          disabled={isSavingHeader}
          className="rounded-lg border border-border bg-card p-3 text-left text-sm transition hover:bg-accent disabled:opacity-60"
        >
          <span className="block font-semibold">Aplicar objetivo padrão</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Insere a base jurídica e operacional usada nos termos de vistoria.
          </span>
        </button>
        <button
          type="button"
          onClick={() => void handleAddKeyDeliveryChecklist()}
          disabled={isSavingHeader}
          className="rounded-lg border border-border bg-card p-3 text-left text-sm transition hover:bg-accent disabled:opacity-60"
        >
          <span className="block font-semibold">Adicionar termo de chaves</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Cria checklist de chaves, controles, fechaduras, acessórios e equipamentos.
          </span>
        </button>
        <button
          type="button"
          onClick={() => void handleGenerateExitSummary()}
          disabled={isSavingHeader || inspection.inspection_type !== "exit"}
          className="rounded-lg border border-border bg-card p-3 text-left text-sm transition hover:bg-accent disabled:opacity-60"
        >
          <span className="block font-semibold">Gerar resumo de saída</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Resume reparos, danos e pendências registrados na vistoria final.
          </span>
        </button>
      </div>

      <form
        key={`header-${inspection.updated_at}`}
        onSubmit={handleHeaderSubmit}
        className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2"
      >
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium">Nome do laudo</span>
          <input name="title" defaultValue={inspection.title} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue={inspection.status} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Agendamento</span>
          <input name="scheduled_at" type="datetime-local" defaultValue={toDateTimeLocal(inspection.scheduled_at)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Proprietário</span>
          <input name="owner_name" defaultValue={inspection.owner_name ?? ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Locatário</span>
          <input name="tenant_name" defaultValue={inspection.tenant_name ?? ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium">Documento do locatário</span>
          <input name="tenant_document" defaultValue={inspection.tenant_document ?? ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium">Resumo técnico do laudo</span>
          <textarea name="summary" rows={3} defaultValue={inspection.summary ?? ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" disabled={isSavingHeader} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {isSavingHeader ? "Salvando..." : "Salvar arquivo"}
          </button>
        </div>
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        {rooms.map((room) => {
          const roomItems = items.filter((item) => item.room_id === room.id);
          const roomMedia = media.filter((entry) => entry.room_id === room.id);

          return (
            <article key={room.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold">{room.name}</h3>
                <select
                  value={room.general_condition}
                  onChange={async (event) => {
                    const response = await updateInspectionRoom(inspection.id, room.id, {
                      name: room.name,
                      general_condition: event.currentTarget.value as InspectionRoom["general_condition"],
                    });
                    onRoomUpdated(response.room);
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none"
                >
                  {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <textarea
                key={`room-notes-${room.id}-${room.updated_at}`}
                defaultValue={room.notes ?? ""}
                onBlur={async (event) => {
                  const response = await updateInspectionRoom(inspection.id, room.id, {
                    name: room.name,
                    notes: event.currentTarget.value,
                  });
                  onRoomUpdated(response.room);
                }}
                rows={2}
                placeholder="Observação detalhada do cômodo."
                className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateRoomSummary(room)}
                  disabled={isSavingItem === room.id}
                  className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-accent disabled:opacity-60"
                >
                  {isSavingItem === room.id ? "Gerando..." : "Gerar resumo do cômodo"}
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {roomItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-border bg-background p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                      <input
                        defaultValue={item.label}
                        onBlur={async (event) => {
                          const response = await updateInspectionItem(inspection.id, item.id, {
                            label: event.currentTarget.value,
                          });
                          onItemUpdated(response.item);
                        }}
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none"
                      />
                      <select
                        value={item.condition}
                        onChange={async (event) => {
                          const response = await updateInspectionItem(inspection.id, item.id, {
                            condition: event.currentTarget.value as InspectionItem["condition"],
                          });
                          onItemUpdated(response.item);
                        }}
                        className="h-9 rounded-md border border-input bg-card px-2 text-xs outline-none"
                      >
                        {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                    <textarea
                      key={`item-notes-${item.id}-${item.updated_at}`}
                      defaultValue={item.notes ?? ""}
                      onBlur={async (event) => {
                        const response = await updateInspectionItem(inspection.id, item.id, {
                          notes: event.currentTarget.value,
                        });
                        onItemUpdated(response.item);
                      }}
                      rows={2}
                      placeholder="Observação deste detalhe."
                      className="mt-2 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickObservationChips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => void handleAppendQuickObservation(item, chip)}
                          disabled={isSavingItem === item.id}
                          className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-accent disabled:opacity-60"
                        >
                          {chip}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => void handleGenerateTechnicalNote(item)}
                        disabled={isSavingItem === item.id}
                        className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-60"
                      >
                        {isSavingItem === item.id ? "Gerando..." : "Gerar texto técnico"}
                      </button>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={item.repair_required}
                        onChange={async (event) => {
                          const response = await updateInspectionItem(inspection.id, item.id, {
                            repair_required: event.currentTarget.checked,
                          });
                          onItemUpdated(response.item);
                        }}
                      />
                      Reparo necessário
                    </label>
                  </div>
                ))}
              </div>

              <form onSubmit={(event) => handleCreateItem(event, room)} className="mt-3 grid gap-2 rounded-md border border-dashed border-border p-3">
                <input name="label" required placeholder="Adicionar detalhe ao cômodo" className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none" />
                <input name="category" placeholder="Categoria" defaultValue={room.name} className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none" />
                <select name="condition" defaultValue="not_checked" className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none">
                  {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <textarea name="notes" rows={2} placeholder="Observação do detalhe." className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" />
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><input name="repair_required" type="checkbox" /> Reparo necessário</label>
                <button type="submit" disabled={isSavingItem === room.id} className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                  {isSavingItem === room.id ? "Salvando..." : "Adicionar detalhe"}
                </button>
              </form>

              <form onSubmit={(event) => handleCreateMedia(event, room)} className="mt-3 grid gap-2 rounded-md border border-border bg-background p-3">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Fotos, galeria ou anexos do cômodo</span>
                  <input name="files" type="file" multiple accept="image/*,video/*,.pdf" className="block w-full text-xs file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-primary file:px-3 file:text-xs file:font-semibold file:text-primary-foreground" />
                </label>
                <textarea name="caption" rows={2} placeholder="Legenda/observação para os arquivos." className="rounded-md border border-input bg-card px-3 py-2 text-sm outline-none" />
                <button type="submit" disabled={isSavingMedia === room.id} className="h-9 rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:bg-accent disabled:opacity-60">
                  {isSavingMedia === room.id ? "Anexando..." : "Adicionar fotos/anexos"}
                </button>
                {roomMedia.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {roomMedia.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-xs">
                        <span className="truncate">{entry.caption || entry.file_name || "Arquivo"}</span>
                        <button type="button" onClick={() => void handleDeleteMedia(entry.id)} className="text-destructive hover:underline">Excluir</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </form>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReportHeader({ inspection }: { inspection: Inspection }) {
  const address = [
    inspection.properties?.neighborhood,
    inspection.properties?.city,
    inspection.properties?.state,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <header className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Laudo de vistoria · {typeLabels[inspection.inspection_type]}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{inspection.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {inspection.properties?.title ?? "Imóvel não informado"}
            {address ? ` · ${address}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {statusLabels[inspection.status]}
          </span>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            PDF {inspection.pdf_url ? "gerado" : "em preparação"}
          </span>
        </div>
      </div>
    </header>
  );
}

function ReportSummary({ inspection }: { inspection: Inspection }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Resumo técnico</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <InfoLine icon={CalendarDays} label="Agendamento" value={formatDate(inspection.scheduled_at)} />
        <InfoLine icon={FileText} label="Tipo" value={typeLabels[inspection.inspection_type]} />
      </div>
      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <p className="text-sm leading-6 text-muted-foreground">
          {inspection.summary || "Nenhum resumo técnico informado para esta vistoria."}
        </p>
      </div>
    </section>
  );
}

function InspectionFinalDeclarations() {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Declarações finais do laudo</h2>
      <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        <p>As fotos, vídeos e anexos registrados integram o laudo e detalham a real condição do imóvel.</p>
        <p>
          Itens não testados, sem acesso ou sem informação suficiente devem permanecer expressamente indicados no
          checklist.
        </p>
        <p>
          Na devolução do imóvel, a conferência de saída deverá considerar este laudo, os registros fotográficos, os
          acessórios entregues e as observações de cada ambiente.
        </p>
      </div>
    </section>
  );
}

function Parties({ inspection }: { inspection: Inspection }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Partes do laudo</h2>
      <div className="mt-3 space-y-3">
        <InfoText label="Proprietário" value={inspection.owner_name || "Não informado"} />
        <InfoText label="Locatário" value={inspection.tenant_name || "Não informado"} />
        <InfoText label="Documento do locatário" value={inspection.tenant_document || "Não informado"} />
      </div>
    </section>
  );
}

function SignaturePanel({
  signatures,
  form,
  isCreating,
  signingId,
  invitingId,
  error,
  onFormChange,
  onCreate,
  onSign,
  onInvite,
}: {
  signatures: InspectionSignature[];
  form: {
    signer_name: string;
    signer_document: string;
    signer_email: string;
    signer_role: InspectionSignature["signer_role"];
  };
  isCreating: boolean;
  signingId: string | null;
  invitingId: string | null;
  error: string | null;
  onFormChange: (form: {
    signer_name: string;
    signer_document: string;
    signer_email: string;
    signer_role: InspectionSignature["signer_role"];
  }) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onSign: (signature: InspectionSignature) => void;
  onInvite: (signature: InspectionSignature) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Assinaturas</h2>
          <p className="text-xs text-muted-foreground">Confirmação digital das partes do laudo.</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
          {signatures.filter((signature) => signature.status === "signed").length}/{signatures.length}
        </span>
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <form className="mt-4 space-y-3" onSubmit={onCreate}>
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted-foreground">Nome do assinante</span>
          <input
            value={form.signer_name}
            onChange={(event) => onFormChange({ ...form, signer_name: event.target.value })}
            required
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            placeholder="Ex.: Maria Oliveira"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">Documento</span>
            <input
              value={form.signer_document}
              onChange={(event) => onFormChange({ ...form, signer_document: event.target.value })}
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              placeholder="CPF/CNPJ"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted-foreground">Papel</span>
            <select
              value={form.signer_role}
              onChange={(event) =>
                onFormChange({
                  ...form,
                  signer_role: event.target.value as InspectionSignature["signer_role"],
                })
              }
              className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            >
              {Object.entries(signerRoleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-xs font-medium text-muted-foreground">E-mail</span>
          <input
            type="email"
            value={form.signer_email}
            onChange={(event) => onFormChange({ ...form, signer_email: event.target.value })}
            className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            placeholder="assinante@email.com"
          />
        </label>
        <button
          type="submit"
          disabled={isCreating}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Adicionar assinante
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {signatures.length > 0 ? (
          signatures.map((signature) => (
            <article key={signature.id} className="rounded-md border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <UserRound className="h-4 w-4 text-muted-foreground" />
                    {signature.signer_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {signerRoleLabels[signature.signer_role]} ·{" "}
                    {signature.signer_document || "Documento não informado"}
                  </p>
                </div>
                <span
                  className={
                    signature.status === "signed"
                      ? "rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                      : "rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
                  }
                >
                  {signatureStatusLabels[signature.status]}
                </span>
              </div>
              {signature.signed_at ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Assinada em {formatDate(signature.signed_at)}
                </p>
              ) : null}
              <div className="mt-3 grid gap-2">
                {signature.status === "pending" ? (
                  <button
                    type="button"
                    onClick={() => onInvite(signature)}
                    disabled={invitingId === signature.id}
                    className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    {invitingId === signature.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    Abrir link externo
                  </button>
                ) : null}
                {signature.status !== "signed" ? (
                  <button
                    type="button"
                    onClick={() => onSign(signature)}
                    disabled={signingId === signature.id}
                    className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {signingId === signature.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PenLine className="h-3.5 w-3.5" />
                    )}
                    Confirmar assinatura interna
                  </button>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            Nenhum assinante cadastrado para este laudo.
          </p>
        )}
      </div>
    </section>
  );
}

function RoomsReport({
  rooms,
  items,
  media,
}: {
  rooms: InspectionRoom[];
  items: InspectionItem[];
  media: InspectionMedia[];
}) {
  if (rooms.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
        Nenhum ambiente cadastrado nesta vistoria.
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {rooms.map((room) => {
        const roomItems = items.filter((item) => item.room_id === room.id);
        const roomMedia = media.filter((entry) => entry.room_id === room.id);

        return (
          <article key={room.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">{room.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {roomItems.length} item(ns) · {roomMedia.length} mídia(s)
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                {conditionLabels[room.general_condition]}
              </span>
            </div>

            {room.notes ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{room.notes}</p> : null}

            {roomItems.length > 0 ? (
              <div className="mt-4 divide-y divide-border rounded-md border border-border">
                {roomItems.map((item) => (
                  <ItemReport key={item.id} item={item} mediaCount={media.filter((entry) => entry.item_id === item.id).length} />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                Nenhum item técnico registrado neste ambiente.
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}

function ItemReport({ item, mediaCount }: { item: InspectionItem; mediaCount: number }) {
  return (
    <div className="grid gap-3 p-3 md:grid-cols-[1fr_auto]">
      <div>
        <p className="font-medium">{item.label}</p>
        <p className="text-xs text-muted-foreground">
          {item.category || "Sem categoria"} · {conditionLabels[item.condition]} · {mediaCount} mídia(s)
        </p>
        {item.notes ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.notes}</p> : null}
      </div>
      {item.repair_required ? (
        <span className="inline-flex h-7 items-center gap-1 rounded-full bg-amber-500/10 px-2 text-xs font-medium text-amber-700">
          <Wrench className="h-3.5 w-3.5" />
          Reparo
        </span>
      ) : null}
    </div>
  );
}

function MediaReport({
  media,
  rooms,
  items,
}: {
  media: InspectionMedia[];
  rooms: InspectionRoom[];
  items: InspectionItem[];
}) {
  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));
  const itemNameById = new Map(items.map((item) => [item.id, item.label]));

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Fotos e anexos</h2>
      {media.length > 0 ? (
        <div className="mt-3 grid gap-3">
          {media.map((entry) => {
            const mediaUrl = entry.signed_url || entry.file_url || "";
            const isImage = entry.media_type === "photo" || entry.mime_type?.startsWith("image/");
            const context = [
              entry.room_id ? roomNameById.get(entry.room_id) : null,
              entry.item_id ? itemNameById.get(entry.item_id) : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <article key={entry.id} className="overflow-hidden rounded-md border border-border bg-background">
                {isImage && mediaUrl ? (
                  <img
                    src={mediaUrl}
                    alt={entry.caption || entry.file_name || "Registro da vistoria"}
                    className="h-36 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center bg-muted text-muted-foreground">
                    <FileText className="h-6 w-6" />
                  </div>
                )}
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-medium">
                    {entry.caption || entry.file_name || "Registro sem legenda"}
                  </p>
                  {context ? <p className="mt-1 text-xs text-muted-foreground">{context}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Nenhuma foto ou anexo registrado.
        </p>
      )}
    </section>
  );
}

function PdfPreparation({
  metrics,
  pdfUrl,
}: {
  metrics: {
    rooms: number;
    items: number;
    checkedItems: number;
    repairs: number;
    damagedItems: number;
    media: number;
  };
  pdfUrl: string | null;
}) {
  const readiness = [
    { label: "Ambientes cadastrados", done: metrics.rooms > 0 },
    { label: "Checklist técnico", done: metrics.items > 0 },
    { label: "Itens verificados", done: metrics.checkedItems > 0 },
    { label: "Fotos ou anexos", done: metrics.media > 0 },
  ];

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Preparação do PDF</h2>
      <div className="mt-3 space-y-2">
        {readiness.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className={item.done ? "text-primary" : "text-muted-foreground"}>
              {item.done ? "Pronto" : "Pendente"}
            </span>
          </div>
        ))}
      </div>
      {pdfUrl ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 print:hidden"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir PDF gerado
        </a>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Gere o arquivo final quando ambientes, checklist e anexos estiverem revisados.
        </p>
      )}
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Home; label: string; value: string }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </article>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: typeof Home; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <Icon className="mb-2 h-4 w-4 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function InfoText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function mergeSummaryText(current: string | null, addition: string) {
  const currentText = current?.trim() ?? "";
  if (!currentText) return addition;
  if (normalizeComparable(currentText).includes(normalizeComparable(addition).slice(0, 80))) return currentText;
  return `${currentText}\n\n${addition}`;
}

function appendObservation(current: string | null, observation: string) {
  const currentText = current?.trim() ?? "";
  if (!currentText) return ensureSentence(observation);
  if (normalizeComparable(currentText).includes(normalizeComparable(observation))) return currentText;
  return `${currentText} ${ensureSentence(observation)}`;
}

function buildTechnicalItemNote(
  item: Pick<InspectionItem, "label" | "condition" | "notes" | "repair_required">,
) {
  const label = item.label.trim() || "Item";
  const notes = normalizeFreeText(item.notes);
  const condition = conditionPhrase(item.condition);
  const noteFragment = notes ? `, ${lowerFirst(removeTerminalPunctuation(notes))}` : "";
  const repairFragment = item.repair_required
    ? " Foi sinalizada necessidade de reparo ou acompanhamento."
    : " Sem reparo obrigatório sinalizado no momento da vistoria.";

  if (item.condition === "not_checked") {
    return `${label}: item pendente de conferência no momento da vistoria${noteFragment}. ${repairFragment}`.replace(/\s+/g, " ").trim();
  }

  return `${label} em ${condition}${noteFragment}. ${repairFragment}`.replace(/\s+/g, " ").trim();
}

function buildRoomTechnicalSummary(room: InspectionRoom, roomItems: InspectionItem[]) {
  const roomName = room.name.trim() || "Ambiente";
  const checkedItems = roomItems.filter((item) => item.condition !== "not_checked");
  const repairItems = roomItems.filter((item) => item.repair_required);
  const attentionItems = roomItems.filter((item) => ["regular", "poor", "damaged"].includes(item.condition));
  const parts = [`${roomName} registrado em ${conditionPhrase(room.general_condition)}.`];

  if (checkedItems.length > 0) {
    parts.push(`${checkedItems.length} item(ns) verificado(s) neste ambiente.`);
  } else {
    parts.push("Itens técnicos ainda pendentes de verificação detalhada.");
  }

  if (attentionItems.length > 0) {
    parts.push(`Pontos de atenção: ${formatList(attentionItems.map((item) => item.label))}.`);
  }

  if (repairItems.length > 0) {
    parts.push(`Reparos sinalizados: ${formatList(repairItems.map((item) => item.label))}.`);
  }

  if (attentionItems.length === 0 && repairItems.length === 0 && checkedItems.length > 0) {
    parts.push("Não foram sinalizados danos ou reparos obrigatórios para os itens verificados.");
  }

  return parts.join(" ");
}

function buildExitInspectionSummary(items: InspectionItem[]) {
  const repairItems = items.filter((item) => item.repair_required);
  const damagedItems = items.filter((item) => ["poor", "damaged"].includes(item.condition));
  const regularItems = items.filter((item) => item.condition === "regular");
  const parts = [
    "Vistoria de saída preparada para conferência comparativa com a vistoria inicial, considerando o estado de conservação, funcionamento aparente, fotos, anexos e observações registradas no laudo.",
  ];

  if (repairItems.length > 0) {
    parts.push(`Reparos ou acompanhamentos sinalizados: ${formatList(repairItems.map((item) => item.label))}.`);
  }

  if (damagedItems.length > 0) {
    parts.push(`Itens classificados como ruins ou danificados: ${formatList(damagedItems.map((item) => item.label))}.`);
  }

  if (regularItems.length > 0) {
    parts.push(`Itens em estado regular para atenção na conferência final: ${formatList(regularItems.map((item) => item.label))}.`);
  }

  if (repairItems.length === 0 && damagedItems.length === 0 && regularItems.length === 0) {
    parts.push("Não há danos ou reparos destacados nos itens cadastrados até o momento.");
  }

  parts.push("As fotos detalham a real condição do imóvel e devem ser consideradas como parte integrante do laudo.");
  return parts.join(" ");
}

function conditionPhrase(condition: InspectionItem["condition"]) {
  const phrases: Record<InspectionItem["condition"], string> = {
    excellent: "excelente estado",
    good: "bom estado",
    regular: "estado regular",
    poor: "estado ruim",
    damaged: "estado danificado",
    not_checked: "não verificado",
  };
  return phrases[condition] ?? "estado não informado";
}

function formatList(values: string[]) {
  const cleanValues = values.map((value) => value.trim()).filter(Boolean);
  if (cleanValues.length === 0) return "nenhum item";
  if (cleanValues.length === 1) return cleanValues[0];
  return `${cleanValues.slice(0, -1).join(", ")} e ${cleanValues.at(-1)}`;
}

function normalizeComparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFreeText(value: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function lowerFirst(value: string) {
  if (!value) return value;
  return `${value.charAt(0).toLocaleLowerCase("pt-BR")}${value.slice(1)}`;
}

function removeTerminalPunctuation(value: string) {
  return value.replace(/[.!?]+$/g, "");
}

function ensureSentence(value: string) {
  const cleanValue = removeTerminalPunctuation(normalizeFreeText(value));
  if (!cleanValue) return "";
  return `${cleanValue}.`;
}

function inferMediaType(mimeType?: string, fileName?: string): InspectionMedia["media_type"] {
  if (mimeType?.startsWith("image/")) return "photo";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (fileName && /\.(png|jpe?g|webp|gif|heic)$/i.test(fileName)) return "photo";
  if (fileName && /\.(mp4|mov|webm|m4v)$/i.test(fileName)) return "video";
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

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string | null) {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

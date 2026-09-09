import { createFileRoute } from "@tanstack/react-router";
import { Copy, FileSignature, Loader2, Mail, MessageCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import {
  createContract,
  updateContract,
  generateContractVersion,
  getContract,
  createContractSignature,
  uploadContractAttachment,
  addContractClause,
  deleteContractClause,
  listContractClauses,
  listContractClauseInstances,
  updateContractClause,
  listContractAttachments,
  listContractEvents,
  listContractSignatures,
  listContractVersions,
  listContracts,
  type Contract,
  type ContractParty,
  type ContractInput,
} from "@/product/contracts";
import { getModuleByKey } from "@/product/app-modules";
import { createNotificationEvent, type NotificationChannel } from "@/product/notifications";
import { listAllProperties, type Property, type PropertySummary } from "@/product/real-estate";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/contratos")({
  component: ContractsPage,
});

const contractTypeLabels = {
  rental: "Locação",
  sale: "Venda",
};

const statusLabels = {
  draft: "Rascunho",
  generated: "Gerado",
  waiting_signature: "Aguardando assinatura",
  awaiting_signature: "Aguardando assinatura",
  partially_signed: "Parcialmente assinado",
  signed: "Assinado",
  active: "Ativo",
  cancelled: "Cancelado",
  terminated: "Encerrado",
  archived: "Arquivado",
};

function ContractsPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("contracts");
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [isContractsLoading, setIsContractsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function refreshContracts() {
    setIsContractsLoading(true);
    setError(null);

    try {
      const [contractsResponse, propertiesResponse] = await Promise.all([
        listContracts(),
        listAllProperties(),
      ]);
      setContracts(contractsResponse.contracts);
      setProperties(propertiesResponse.properties);
    } catch (contractsError) {
      setError(
        contractsError instanceof Error
          ? contractsError.message
          : "Não foi possível carregar contratos.",
      );
    } finally {
      setIsContractsLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshContracts();
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
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Contratos reais da operação</p>
          <p className="text-sm text-muted-foreground">
            Vincule contratos a imóveis, valores, vigência e partes responsáveis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo contrato
        </button>
      </div>

      {showForm ? (
        <ContractForm
          properties={properties}
          onCancel={() => setShowForm(false)}
          onCreated={(contract) => {
            setContracts((current) => [contract, ...current]);
            setShowForm(false);
          }}
        />
      ) : null}

      {selectedContractId ? (
        <ContractDetail contractId={selectedContractId} onClose={() => setSelectedContractId(null)} />
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!isContractsLoading && contracts.length > 0 ? <div className="mb-4 grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_auto]">
        <input aria-label="Buscar contratos" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título, número ou imóvel" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
        <select aria-label="Filtrar status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </div> : null}

      {isContractsLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando contratos...
        </section>
      ) : contracts.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Nenhum contrato criado"
          description="Crie contratos reais de locação, venda ou administração para depois avançar em documentos, assinaturas e financeiro."
          actionLabel="Criar contrato"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {contracts.filter((contract) => (statusFilter === "all" || contract.status === statusFilter) && (!query.trim() || `${contract.title} ${contract.contract_number ?? ""} ${contract.properties?.title ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).map((contract) => (
            <ContractCard key={contract.id} contract={contract} onOpen={() => setSelectedContractId(contract.id)} />
          ))}
        </section>
      )}
    </ModulePage>
  );
}

function ContractForm({
  properties,
  onCancel,
  onCreated,
}: {
  properties: PropertySummary[];
  onCancel: () => void;
  onCreated: (contract: Contract) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parties, setParties] = useState<Array<{ party_type: ContractParty["party_type"]; name: string; document: string; email: string; phone: string }>>([]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const input: ContractInput = {
      property_id: String(form.get("property_id") ?? ""),
      contract_number: String(form.get("contract_number") ?? ""),
      title: String(form.get("title") ?? ""),
      contract_type: String(form.get("contract_type") ?? "rental") as ContractInput["contract_type"],
      status: "draft",
      starts_at: String(form.get("starts_at") ?? ""),
      ends_at: String(form.get("ends_at") ?? ""),
      total_amount_cents: parseMoneyToCents(String(form.get("total_amount") ?? "")),
      monthly_amount_cents: parseMoneyToCents(String(form.get("monthly_amount") ?? "")),
      deposit_cents: parseMoneyToCents(String(form.get("deposit") ?? "")),
      notes: String(form.get("notes") ?? ""),
      parties: parties.filter((party) => party.name.trim()).map((party) => ({ ...party, signature_required: true })),
    };

    try {
      const response = await createContract(input);
      onCreated(response.contract);
      formElement.reset();
    } catch (contractError) {
      setError(
        contractError instanceof Error ? contractError.message : "Não foi possível salvar o contrato.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Novo contrato</h2>
          <p className="text-sm text-muted-foreground">
            Registre a base contratual. Geração de PDF e assinatura entram nas próximas fases.
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Título" name="title" required />
        <Field label="Número interno" name="contract_number" />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Imóvel</span>
          <select
            name="property_id"
            required
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue=""
          >
            <option value="" disabled>Selecione um imóvel</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.code ? `${property.code} - ` : ""}
                {property.title}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tipo</span>
          <select
            name="contract_type"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue="rental"
          >
            <option value="rental">Locação</option>
            <option value="sale">Venda</option>
          </select>
        </label>
        <Field label="Início" name="starts_at" type="date" />
        <Field label="Fim" name="ends_at" type="date" />
        <Field label="Valor total" name="total_amount" inputMode="decimal" />
        <Field label="Valor mensal" name="monthly_amount" inputMode="decimal" />
        <Field label="Caução/garantia" name="deposit" inputMode="decimal" />
      </div>

      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Partes do contrato</p><p className="text-xs text-muted-foreground">Adicione proprietários, compradores, inquilinos, fiadores ou outras partes.</p></div><button type="button" onClick={() => setParties((current) => [...current, { party_type: "tenant", name: "", document: "", email: "", phone: "" }])} className="h-9 rounded-md border border-border px-3 text-xs font-semibold">Adicionar parte</button></div>
        <div className="mt-3 space-y-3">{parties.map((party, index) => <div key={index} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-5">
          <select aria-label={`Tipo da parte ${index + 1}`} value={party.party_type} onChange={(event) => setParties((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, party_type: event.target.value as ContractParty["party_type"] } : item))} className="h-10 rounded-md border border-input bg-background px-2 text-sm"><option value="owner">Proprietário</option><option value="buyer">Comprador</option><option value="tenant">Inquilino</option><option value="seller">Vendedor</option><option value="guarantor">Fiador</option><option value="other">Outra parte</option></select>
          <input aria-label={`Nome da parte ${index + 1}`} value={party.name} onChange={(event) => setParties((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Nome" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
          <input aria-label={`Documento da parte ${index + 1}`} value={party.document} onChange={(event) => setParties((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, document: event.target.value } : item))} placeholder="CPF/CNPJ" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
          <input aria-label={`E-mail da parte ${index + 1}`} value={party.email} onChange={(event) => setParties((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} placeholder="E-mail" type="email" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
          <button type="button" onClick={() => setParties((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="h-10 rounded-md border border-destructive/40 px-3 text-sm text-destructive">Remover</button>
        </div>)}</div>
      </div>

      <label className="mt-3 block space-y-1 text-sm">
        <span className="font-medium">Observações</span>
        <textarea
          name="notes"
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Condições comerciais, garantias, reajuste, repasse ou cláusulas importantes."
        />
      </label>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Salvar contrato
        </button>
      </div>
    </form>
  );
}

function ContractCard({ contract, onOpen }: { contract: Contract; onOpen: () => void }) {
  const [copied, setCopied] = useState(false);
  const tenantPortal = contract.contract_parties?.find(
    (party) => party.party_type === "tenant" && party.portal_enabled && party.portal_token,
  );
  const portalLink =
    typeof window !== "undefined" && tenantPortal?.portal_token
      ? `${window.location.origin}/portal/inquilino/${tenantPortal.portal_token}`
      : null;
  const whatsappLink =
    portalLink && tenantPortal
      ? buildWhatsAppLink(
          tenantPortal.phone,
          buildTenantPortalMessage(tenantPortal.name, portalLink),
        )
      : null;
  const emailLink =
    portalLink && tenantPortal?.email
      ? buildEmailLink(
          tenantPortal.email,
          "Acesso ao Portal do Inquilino",
          buildTenantPortalEmail(tenantPortal.name, portalLink),
        )
      : null;

  function registerPortalShare(channel: NotificationChannel, recipientContact: string) {
    if (!portalLink || !tenantPortal) return;

    void createNotificationEvent({
      template_key: "tenant_portal_link",
      channel,
      recipient_type: "tenant",
      recipient_id: tenantPortal.id,
      recipient_name: tenantPortal.name,
      recipient_contact: recipientContact,
      subject: channel === "email" ? "Acesso ao Portal do Inquilino" : null,
      body:
        channel === "email"
          ? buildTenantPortalEmail(tenantPortal.name, portalLink)
          : buildTenantPortalMessage(tenantPortal.name, portalLink),
      provider: "manual",
      status: "prepared",
      related_entity_type: "contract",
      related_entity_id: contract.id,
      metadata: { source: "contract_card", portal_link: portalLink },
    }).catch(() => undefined);
  }

  async function copyPortalLink() {
    if (!portalLink) return;

    await navigator.clipboard.writeText(portalLink);
    registerPortalShare("system", "clipboard");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {contractTypeLabels[contract.contract_type]}
          </p>
          <h2 className="mt-2 truncate text-base font-semibold">{contract.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {contract.properties?.title ?? "Sem imóvel vinculado"}
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {statusLabels[contract.status]}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
        <Metric label="Mensal" value={formatMoney(contract.monthly_amount_cents)} />
        <Metric label="Total" value={formatMoney(contract.total_amount_cents)} />
        <Metric label="Caução" value={formatMoney(contract.deposit_cents)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {contract.contract_number ? (
          <span className="rounded-full border border-border px-3 py-1">
            Nº {contract.contract_number}
          </span>
        ) : null}
        {contract.starts_at ? (
          <span className="rounded-full border border-border px-3 py-1">
            Início {formatDate(contract.starts_at)}
          </span>
        ) : null}
        {contract.ends_at ? (
          <span className="rounded-full border border-border px-3 py-1">
            Fim {formatDate(contract.ends_at)}
          </span>
        ) : null}
      </div>

      {contract.notes ? (
        <p className="mt-4 line-clamp-3 rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
          {contract.notes}
        </p>
      ) : null}
      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <p className="text-xs font-semibold text-foreground">Portal do inquilino</p>
        {portalLink ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="truncate text-xs text-muted-foreground">{portalLink}</p>
            <button
              type="button"
              onClick={() => void copyPortalLink()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Link copiado" : "Copiar link"}
            </button>
            <div className="grid gap-2 sm:grid-cols-2">
              {whatsappLink ? (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => registerPortalShare("whatsapp", tenantPortal?.phone || "")}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              ) : null}
              {emailLink ? (
                <a
                  href={emailLink}
                  onClick={() => registerPortalShare("email", tenantPortal?.email || "")}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
                >
                  <Mail className="h-3.5 w-3.5" />
                  E-mail
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Cadastre um inquilino como parte principal para liberar o portal.
          </p>
        )}
      </div>
      <button type="button" onClick={onOpen} className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md border border-border px-3 text-sm font-semibold transition hover:bg-accent">
        Abrir detalhe do contrato
      </button>
    </article>
  );
}

function ContractDetail({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [library, setLibrary] = useState<any[]>([]);
  const [clauses, setClauses] = useState<any[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [showPreview, setShowPreview] = useState(false);
  const initialClauses = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("tenant");
  const [signerPartyId, setSignerPartyId] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  async function refresh() {
    const [c, v, e, s, a, l, ci] = await Promise.all([getContract(contractId), listContractVersions(contractId), listContractEvents(contractId), listContractSignatures(contractId), listContractAttachments(contractId), listContractClauses(contract?.contract_type), listContractClauseInstances(contractId)]);
    setContract(c.contract); setDraftTitle(c.contract.title); setDraftNotes(c.contract.notes ?? ""); setVersions(v.versions); setEvents(e.events); setSignatures(s.signatures); setAttachments(a.attachments); setLibrary(l.clauses); setClauses(ci.clauses);
    initialClauses.current = JSON.stringify(ci.clauses);
  }
  useEffect(() => { void refresh().catch((e) => setMessage(e instanceof Error ? e.message : "Falha ao carregar contrato.")); }, [contractId]);
  useEffect(() => {
    if (!clauses.length || initialClauses.current === null || JSON.stringify(clauses) === initialClauses.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try { await Promise.all(clauses.map((clause) => updateContractClause(contractId, clause.id, { title: clause.title, content: clause.content, position: clause.position }))); initialClauses.current = JSON.stringify(clauses); setSaveState("saved"); }
      catch (error) { setSaveState("error"); setMessage(error instanceof Error && (error as any).status === 409 ? "Conflito de edição: recarregue o contrato antes de continuar." : "Não foi possível salvar automaticamente."); }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [clauses, contractId]);
  const initialDocument = useRef<string | null>(null);
  useEffect(() => {
    if (!contract || initialDocument.current === null) return;
    const next = JSON.stringify({ title: draftTitle, notes: draftNotes });
    if (next === initialDocument.current || ["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try { const response = await updateContract(contractId, { title: draftTitle, notes: draftNotes || null, expected_version: contract.current_version }); setContract(response.contract); initialDocument.current = JSON.stringify({ title: draftTitle, notes: draftNotes }); setSaveState("saved"); }
      catch (error) { setSaveState("error"); setMessage(error instanceof Error && (error as any).status === 409 ? "Conflito de edição: recarregue o contrato antes de continuar." : "Não foi possível salvar o documento."); }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [draftTitle, draftNotes, contractId, contract?.id, contract?.current_version, contract?.status]);
  if (contract && initialDocument.current === null) initialDocument.current = JSON.stringify({ title: contract.title, notes: contract.notes ?? "" });
  if (!contract) return <section className="mb-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Carregando detalhe...</section>;

  async function generate() {
    setBusy(true); setMessage(null);
    try { await generateContractVersion(contractId); await refresh(); setMessage("Nova versão gerada com PDF privado."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível gerar a versão."); }
    finally { setBusy(false); }
  }
  async function sign() {
    const version = versions[0];
    const canvas = canvasRef.current;
    if (!version || !canvas || !signerName.trim()) { setMessage("Gere uma versão e informe o nome do signatário."); return; }
    setBusy(true);
    try { await createContractSignature(contractId, { version_id: version.id, party_id: signerPartyId || undefined, signer_name: signerName.trim(), signer_role: signerRole, signature_base64: canvas.toDataURL("image/png") }); await refresh(); setMessage("Assinatura eletrônica capturada e vinculada à versão."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível assinar."); }
    finally { setBusy(false); }
  }
  async function attach(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { await uploadContractAttachment(contractId, file); await refresh(); setMessage("Anexo enviado com acesso autenticado."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível enviar o anexo."); }
    finally { setBusy(false); event.target.value = ""; }
  }
  async function addClause(clause: any) { setBusy(true); try { await addContractClause(contractId, { source_clause_id: clause.id, title: clause.title, content: clause.content }); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível adicionar a cláusula."); } finally { setBusy(false); } }
  async function moveClause(clause: any, delta: number) { const index = clauses.findIndex((item) => item.id === clause.id); const target = clauses[index + delta]; if (!target) return; await updateContractClause(contractId, clause.id, { position: target.position }); await updateContractClause(contractId, target.id, { position: clause.position }); await refresh(); }
  return <section className="mb-4 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Detalhe do contrato</p><h2 className="mt-1 text-lg font-semibold">{contract.title}</h2><p className="text-sm text-muted-foreground">{contract.properties?.title ?? "Imóvel não informado"} · {statusLabels[contract.status]}</p></div><button type="button" onClick={onClose} className="h-9 rounded-md border border-border px-3 text-sm">Fechar</button></div>
    {message ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{message}</p> : null}
    <div className="mt-4 grid gap-3 md:grid-cols-2"><DetailBlock title="Partes" items={(contract.contract_parties ?? []).map((p) => `${p.party_type}: ${p.name}`)} empty="Nenhuma parte" /><DetailBlock title="Versões" items={versions.map((v) => `v${v.version_number ?? v.versionNumber} · ${v.status}`)} empty="Nenhuma versão" /><DetailBlock title="Assinaturas" items={signatures.map((s) => s.metadata?.signer_name ?? "Assinatura capturada")} empty="Nenhuma assinatura" /><DetailBlock title="Anexos" items={attachments.map((a) => `${a.filename} · ${a.mime_type}`)} empty="Nenhum anexo" /></div>
    <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" onClick={() => setShowPreview((current) => !current)} className="h-9 rounded-md border border-border px-3 text-xs font-semibold">{showPreview ? "Voltar para edição" : "Pré-visualizar"}</button><span className="text-xs text-muted-foreground">{saveState === "saving" ? "Salvando..." : saveState === "error" ? "Erro ao salvar" : "Salvo"}</span></div>
    {showPreview ? <ContractPreview contract={{ ...contract, title: draftTitle, notes: draftNotes }} clauses={clauses} /> : <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div className="rounded-md border border-border bg-background p-3"><p className="text-sm font-semibold">Biblioteca de cláusulas</p><p className="mt-1 text-xs text-muted-foreground">Cláusulas padrão e da empresa. O texto é copiado para o contrato.</p><div className="mt-2 space-y-2">{library.map((item) => <button key={item.id} type="button" disabled={busy} onClick={() => void addClause(item)} className="block w-full rounded border border-border p-2 text-left text-xs hover:bg-accent"><span className="font-semibold">{item.title}</span><span className="block text-muted-foreground">{item.category}</span></button>)}</div></div><div className="rounded-md border border-border bg-background p-3"><p className="text-sm font-semibold">Editor do contrato</p><p className="mt-1 text-xs text-muted-foreground">O documento inteiro é salvo automaticamente; a ordem é persistida em telas touch.</p><input aria-label="Título do contrato" value={draftTitle} disabled={["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)} onChange={(e) => setDraftTitle(e.target.value)} className="mt-2 h-9 w-full rounded border border-input bg-background px-2 text-sm" /><textarea aria-label="Texto livre do contrato" value={draftNotes} disabled={["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)} onChange={(e) => setDraftNotes(e.target.value)} rows={4} className="mt-2 w-full rounded border border-input bg-background p-2 text-sm" /> <div className="mt-2 space-y-2">{clauses.map((item, index) => <div key={item.id} className="rounded border border-border p-2"><div className="flex items-center justify-between gap-2"><input value={item.title} disabled={["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)} onChange={(e) => setClauses((current) => current.map((row) => row.id === item.id ? { ...row, title: e.target.value } : row))} className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2 text-xs" /><div className="flex gap-1"><button type="button" disabled={!index || ["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)} onClick={() => void moveClause(item, -1)} className="h-8 rounded border px-2 text-xs">↑</button><button type="button" disabled={index === clauses.length - 1 || ["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)} onClick={() => void moveClause(item, 1)} className="h-8 rounded border px-2 text-xs">↓</button><button type="button" disabled={["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)} onClick={() => void deleteContractClause(contractId, item.id).then(refresh)} className="h-8 rounded border border-destructive/40 px-2 text-xs text-destructive">×</button></div></div><textarea value={item.content} disabled={["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)} onChange={(e) => setClauses((current) => current.map((row) => row.id === item.id ? { ...row, content: e.target.value } : row))} rows={3} className="mt-2 w-full rounded border border-input bg-background p-2 text-xs" /></div>)}</div></div></div>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || ["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)} onClick={() => void generate()} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Processando..." : "Gerar nova versão / PDF"}</button><label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-border px-3 text-sm font-semibold">Adicionar anexo<input type="file" className="hidden" onChange={(event) => void attach(event)} /></label><span className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">{events.length} eventos de auditoria</span></div>
    {versions[0] && !["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status) ? <div className="mt-4 rounded-md border border-border bg-background p-3"><p className="text-sm font-semibold">Assinatura eletrônica</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><select aria-label="Parte signatária" value={signerPartyId} onChange={(e) => { const party = (contract.contract_parties ?? []).find((item) => item.id === e.target.value); setSignerPartyId(e.target.value); if (party) { setSignerName(party.name); setSignerRole(party.party_type); } }} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">Selecione a parte</option>{(contract.contract_parties ?? []).filter((party) => party.signature_required).map((party) => <option key={party.id} value={party.id}>{party.name} · {party.party_type}</option>)}</select><input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Nome do signatário" className="h-10 rounded-md border border-input bg-background px-3 text-sm" /><input value={signerRole} readOnly aria-label="Papel do signatário" className="h-10 rounded-md border border-input bg-background px-3 text-sm" /></div><canvas ref={canvasRef} width={520} height={140} className="mt-2 h-28 w-full touch-none rounded border border-dashed border-border bg-white" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const ctx = event.currentTarget.getContext("2d"); if (!ctx) return; ctx.strokeStyle = "#111827"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY); }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const ctx = event.currentTarget.getContext("2d"); if (!ctx) return; ctx.lineTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY); ctx.stroke(); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} /><div className="mt-2 flex gap-2"><button type="button" onClick={() => { const c = canvasRef.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); }} className="h-9 rounded-md border border-border px-3 text-xs">Limpar</button><button type="button" disabled={busy} onClick={() => void sign()} className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">Confirmar assinatura</button></div></div> : null}
  </section>;
}

function DetailBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div className="rounded-md border border-border bg-background p-3"><p className="text-sm font-semibold">{title}</p>{items.length ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{empty}</p>}</div>;
}

function ContractPreview({ contract, clauses }: { contract: Contract; clauses: any[] }) {
  const parties = contract.contract_parties ?? [];
  const resolve = (content: string) => content.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key: string) => {
    if (key === "property.code") return contract.properties?.code ?? "";
    if (key === "property.address") return contract.properties?.title ?? "";
    if (key === "owners" || key === "owner.name") return parties.filter((p) => p.party_type === "owner").map((p) => p.name).join(", ");
    if (key === "tenants" || key === "tenant.name") return parties.filter((p) => p.party_type === "tenant").map((p) => p.name).join(", ");
    if (key === "buyers" || key === "buyer.name") return parties.filter((p) => p.party_type === "buyer").map((p) => p.name).join(", ");
    return `⚠ placeholder não permitido: {{${key}}}`;
  });
  return <article className="mt-4 rounded-md border border-primary/30 bg-background p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Pré-visualização</p><h3 className="mt-2 text-lg font-semibold">{contract.title}</h3><p className="mt-1 text-sm text-muted-foreground">{contract.properties?.title ?? "Imóvel não informado"} · {contract.contract_type === "rental" ? "Locação" : "Venda"}</p><div className="mt-4 space-y-4">{clauses.map((clause) => <section key={clause.id}><h4 className="font-semibold">{clause.title}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{resolve(clause.content)}</p></section>)}</div><p className="mt-4 text-xs text-muted-foreground">Esta visualização não gera versão nem altera o histórico.</p></article>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}

function buildWhatsAppLink(phone: string | null | undefined, message: string) {
  const digits = phone?.replace(/\D/g, "");
  if (!digits) return null;

  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function buildEmailLink(email: string, subject: string, body: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildTenantPortalMessage(name: string, portalLink: string) {
  return `Olá, ${name}. Segue seu acesso ao Portal do Inquilino do ImobiFlow: ${portalLink}`;
}

function buildTenantPortalEmail(name: string, portalLink: string) {
  return `Olá, ${name}.\n\nSegue seu acesso ao Portal do Inquilino do ImobiFlow:\n${portalLink}`;
}

function Field({
  label,
  name,
  type = "text",
  required,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        inputMode={inputMode}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * 100);
}

function formatMoney(value: number | null) {
  if (!value) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

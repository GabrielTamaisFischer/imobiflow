import { createFileRoute } from "@tanstack/react-router";
import { Building2, Copy, Eye, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { OwnerFields } from "@/components/real-estate/owner-fields";
import { ownerInputFromForm } from "@/product/owner-form";
import { getModuleByKey } from "@/product/app-modules";
import {
  createOwner,
  archiveOwner,
  listOwners,
  listAllProperties,
  updateOwner,
  type OwnerInput,
  type Property,
  type PropertySummary,
  type PropertyOwner,
} from "@/product/real-estate";
import { createNotificationEvent, type NotificationChannel } from "@/product/notifications";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/proprietarios")({
  component: OwnersPage,
});

function OwnersPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("owners");
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [isOwnersLoading, setIsOwnersLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refreshOwners() {
    setIsOwnersLoading(true);
    setError(null);

    try {
      const [ownersResponse, propertiesResponse] = await Promise.all([listOwners(), listAllProperties()]);
      setOwners(ownersResponse.owners);
      setProperties(propertiesResponse.properties);
    } catch (ownersError) {
      setError(
        ownersError instanceof Error
          ? ownersError.message
          : "Não foi possível carregar proprietários.",
      );
    } finally {
      setIsOwnersLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshOwners();
    }
  }, [isLoading, session]);

  const filteredOwners = useMemo(() => {
    const term = ownerSearch.trim().toLowerCase();
    if (!term) return owners;
    return owners.filter((owner) => {
      const ownerProperties = properties.filter((property) => property.owner_id === owner.id);
      return [
        owner.name,
        owner.phone,
        owner.whatsapp,
        owner.email,
        owner.document,
        ...ownerProperties.flatMap((property) => [property.code, property.title]),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [owners, properties, ownerSearch]);

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
          <p className="text-sm font-semibold">Base de proprietários</p>
          <p className="text-sm text-muted-foreground">
            Cadastre donos de imóveis para vincular contratos, repasses e documentos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo proprietário
        </button>
      </div>

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: proprietários criados aqui ficam apenas neste navegador.
        </div>
      ) : null}

      {showForm ? (
        <OwnerForm
          onCancel={() => setShowForm(false)}
          onCreated={(owner) => {
            setOwners((current) => [owner, ...current]);
            setShowForm(false);
          }}
        />
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {owners.length ? (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <label className="block text-sm font-medium">
            Pesquisar proprietário
            <input
              value={ownerSearch}
              onChange={(event) => setOwnerSearch(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Pesquise por nome, código do imóvel, telefone, WhatsApp, e-mail ou documento"
            />
          </label>
        </div>
      ) : null}

      {isOwnersLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando proprietários...
        </section>
      ) : owners.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Nenhum proprietário cadastrado"
          description="O sistema começa vazio. Cadastre proprietários reais para depois vincular imóveis, contratos, repasses e documentos."
          actionLabel="Cadastrar proprietário"
          onAction={() => setShowForm(true)}
        />
      ) : filteredOwners.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Nenhum proprietário encontrado"
          description="Ajuste a pesquisa para localizar por nome, código de imóvel ou telefone."
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredOwners.map((owner) => (
            <OwnerCard
              key={owner.id}
              owner={owner}
              linkedProperties={properties.filter((property) => property.owner_id === owner.id)}
              onOwnerUpdated={(updatedOwner) => {
                setOwners((current) => current.map((item) => (item.id === updatedOwner.id ? updatedOwner : item)));
              }}
              onOwnerRemoved={(ownerId) => {
                setOwners((current) => current.filter((item) => item.id !== ownerId));
              }}
            />
          ))}
        </section>
      )}
    </ModulePage>
  );
}

function OwnerForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (owner: PropertyOwner) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const input = ownerInputFromForm(form);

    try {
      const response = await createOwner(input);
      onCreated(response.owner);
      formElement.reset();
    } catch (ownerError) {
      setError(ownerError instanceof Error ? ownerError.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Novo proprietário</h2>
          <p className="text-sm text-muted-foreground">
            Registre pessoa física ou jurídica proprietária de imóveis reais.
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <OwnerFields />
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Salvar proprietário
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
  defaultValue,
  format,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  format?: "phone";
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        onInput={(event) => {
          if (format === "phone") event.currentTarget.value = formatPhone(event.currentTarget.value);
        }}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function OwnerCard({
  owner,
  linkedProperties,
  onOwnerUpdated,
  onOwnerRemoved,
}: {
  owner: PropertyOwner;
  linkedProperties: PropertySummary[];
  onOwnerUpdated: (owner: PropertyOwner) => void;
  onOwnerRemoved: (ownerId: string) => void;
}) {
  const Icon = owner.owner_type === "company" ? Building2 : UserRound;
  const [copied, setCopied] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const portalLink =
    typeof window !== "undefined" && owner.portal_enabled && owner.portal_token
      ? `${window.location.origin}/portal/proprietario/${owner.portal_token}`
      : null;
  const whatsappLink = portalLink
    ? buildWhatsAppLink(
        owner.whatsapp || owner.phone,
        buildOwnerPortalMessage(owner.name, portalLink),
      )
    : null;
  const emailLink =
    portalLink && owner.email
      ? buildEmailLink(
          owner.email,
          "Acesso ao Portal do Proprietário",
          buildOwnerPortalEmail(owner.name, portalLink),
        )
      : null;

  function registerPortalShare(channel: NotificationChannel, recipientContact: string) {
    if (!portalLink) return;

    void createNotificationEvent({
      template_key: "owner_portal_link",
      channel,
      recipient_type: "owner",
      recipient_id: owner.id,
      recipient_name: owner.name,
      recipient_contact: recipientContact,
      subject: channel === "email" ? "Acesso ao Portal do Proprietário" : null,
      body:
        channel === "email"
          ? buildOwnerPortalEmail(owner.name, portalLink)
          : buildOwnerPortalMessage(owner.name, portalLink),
      provider: "manual",
      status: "prepared",
      related_entity_type: "property_owner",
      related_entity_id: owner.id,
      metadata: { source: "owner_card", portal_link: portalLink },
    }).catch(() => undefined);
  }

  async function copyPortalLink() {
    if (!portalLink) return;

    await navigator.clipboard.writeText(portalLink);
    registerPortalShare("system", "clipboard");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function removeOwner() {
    if (linkedProperties.length > 0) {
      window.alert("Este proprietário possui imóveis vinculados. Revise os vínculos antes de apagar.");
      return;
    }
    if (!window.confirm("Apagar este proprietário da lista? Ele será arquivado.")) return;
    setIsRemoving(true);
    setActionError(null);
    try {
      await archiveOwner(owner.id);
      onOwnerRemoved(owner.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível apagar o proprietário.");
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{owner.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {owner.owner_type === "company" ? "Pessoa jurídica" : "Pessoa física"}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-1 text-sm text-muted-foreground">
        {owner.document ? <p className="truncate">Documento: {owner.document}</p> : null}
        {owner.whatsapp ? <p className="truncate">WhatsApp: {owner.whatsapp}</p> : null}
        {owner.email ? <p className="truncate">E-mail: {owner.email}</p> : null}
      </div>
      {owner.notes ? (
        <p className="mt-4 line-clamp-3 rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
          {owner.notes}
        </p>
      ) : null}
      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <p className="text-xs font-semibold text-foreground">Imóveis vinculados</p>
        {linkedProperties.length ? (
          <div className="mt-2 space-y-1">
            {linkedProperties.slice(0, 3).map((property) => (
              <p key={property.id} className="truncate text-xs text-muted-foreground">
                {property.code || "Sem código"} - {property.title}
              </p>
            ))}
            {linkedProperties.length > 3 ? (
              <p className="text-xs text-muted-foreground">+{linkedProperties.length - 3} imóvel(is)</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Nenhum imóvel vinculado ainda.</p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setIsViewing(true)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent">
          <Eye className="h-3.5 w-3.5" />
          Visualizar
        </button>
        <button type="button" onClick={() => setIsEditing(true)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent">
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </button>
        {owner.phone ? (
          <a href={`tel:${owner.phone.replace(/\D/g, "")}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent">
            <Phone className="h-3.5 w-3.5" />
            Ligar
          </a>
        ) : null}
        <button type="button" onClick={() => void removeOwner()} disabled={isRemoving} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-destructive/30 px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-60">
          {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Apagar
        </button>
      </div>
      {actionError ? <p className="mt-2 text-xs text-destructive">{actionError}</p> : null}
      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <p className="text-xs font-semibold text-foreground">Portal do proprietário</p>
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
                  onClick={() => registerPortalShare("whatsapp", owner.whatsapp || owner.phone || "")}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              ) : null}
              {emailLink ? (
                <a
                  href={emailLink}
                  onClick={() => registerPortalShare("email", owner.email || "")}
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
            Portal desativado para este proprietário.
          </p>
        )}
      </div>
      {isViewing ? <OwnerDetailsModal owner={owner} linkedProperties={linkedProperties} onClose={() => setIsViewing(false)} /> : null}
      {isEditing ? (
        <OwnerEditModal
          owner={owner}
          onClose={() => setIsEditing(false)}
          onSaved={(updated) => {
            onOwnerUpdated(updated);
            setIsEditing(false);
          }}
        />
      ) : null}
    </article>
  );
}

function OwnerDetailsModal({ owner, linkedProperties, onClose }: { owner: PropertyOwner; linkedProperties: PropertySummary[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Ficha do proprietário</p>
            <h2 className="text-lg font-semibold">{owner.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1 text-sm">Fechar</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Info label="Tipo" value={owner.owner_type === "company" ? "Pessoa jurídica" : "Pessoa física"} />
          <Info label="Documento" value={owner.document} />
          <Info label="Telefone" value={owner.phone} />
          <Info label="WhatsApp" value={owner.whatsapp} />
          <Info label="E-mail" value={owner.email} />
          <Info label="Status" value={owner.status} />
        </div>
        <div className="mt-4 rounded-md border border-border bg-background p-3">
          <p className="text-sm font-semibold">Imóveis ligados</p>
          {linkedProperties.length ? (
            <div className="mt-2 space-y-2">
              {linkedProperties.map((property) => (
                <div key={property.id} className="rounded-md bg-muted p-3 text-sm">
                  <p className="font-medium">{property.code || "Sem código"} - {property.title}</p>
                  <p className="text-xs text-muted-foreground">{property.city || "Cidade não informada"} · {property.status}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nenhum imóvel vinculado ainda.</p>
          )}
        </div>
        {owner.notes ? <p className="mt-4 rounded-md bg-muted p-3 text-sm text-muted-foreground">{owner.notes}</p> : null}
      </div>
    </div>
  );
}

function OwnerEditModal({ owner, onClose, onSaved }: { owner: PropertyOwner; onClose: () => void; onSaved: (owner: PropertyOwner) => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const input: Partial<OwnerInput> = ownerInputFromForm(form);
    try {
      const response = await updateOwner(owner.id, input);
      onSaved(response.owner);
    } catch (ownerError) {
      setError(ownerError instanceof Error ? ownerError.message : "Não foi possível editar.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Editar proprietário</p>
            <h2 className="text-lg font-semibold">{owner.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1 text-sm">Cancelar</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <OwnerFields defaults={owner} />
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={isSaving} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            Salvar edição
          </button>
        </div>
      </form>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value || "Não informado"}</p>
    </div>
  );
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
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

function buildOwnerPortalMessage(name: string, portalLink: string) {
  return `Olá, ${name}. Segue seu acesso ao Portal do Proprietário do ImobiFlow: ${portalLink}`;
}

function buildOwnerPortalEmail(name: string, portalLink: string) {
  return `Olá, ${name}.\n\nSegue seu acesso ao Portal do Proprietário do ImobiFlow:\n${portalLink}`;
}

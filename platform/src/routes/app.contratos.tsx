import { createFileRoute } from "@tanstack/react-router";
import { Copy, FileSignature, Loader2, Mail, MessageCircle, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import {
  createContract,
  listContracts,
  type Contract,
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
  management: "Administração",
  service: "Serviço",
  other: "Outro",
};

const statusLabels = {
  draft: "Rascunho",
  generated: "Gerado",
  sent: "Enviado",
  waiting_signature: "Aguardando assinatura",
  signed: "Assinado",
  active: "Ativo",
  cancelled: "Cancelado",
  expired: "Expirado",
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

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: contratos criados aqui ficam apenas neste navegador.
        </div>
      ) : null}

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

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

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
          {contracts.map((contract) => (
            <ContractCard key={contract.id} contract={contract} />
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const partyName = String(form.get("party_name") ?? "");
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
      parties: partyName
        ? [
            {
              party_type: String(form.get("party_type") ?? "tenant") as
                | "owner"
                | "tenant"
                | "buyer"
                | "seller",
              name: partyName,
              document: String(form.get("party_document") ?? ""),
              email: String(form.get("party_email") ?? ""),
              phone: String(form.get("party_phone") ?? ""),
              signature_required: true,
            },
          ]
        : [],
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
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue=""
          >
            <option value="">Sem vínculo ainda</option>
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
            <option value="management">Administração</option>
            <option value="service">Serviço</option>
            <option value="other">Outro</option>
          </select>
        </label>
        <Field label="Início" name="starts_at" type="date" />
        <Field label="Fim" name="ends_at" type="date" />
        <Field label="Valor total" name="total_amount" inputMode="decimal" />
        <Field label="Valor mensal" name="monthly_amount" inputMode="decimal" />
        <Field label="Caução/garantia" name="deposit" inputMode="decimal" />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Parte principal</span>
          <select
            name="party_type"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue="tenant"
          >
            <option value="tenant">Inquilino</option>
            <option value="owner">Proprietário</option>
            <option value="buyer">Comprador</option>
            <option value="seller">Vendedor</option>
          </select>
        </label>
        <Field label="Nome da parte" name="party_name" />
        <Field label="Documento da parte" name="party_document" />
        <Field label="E-mail da parte" name="party_email" type="email" />
        <Field label="Telefone da parte" name="party_phone" />
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

function ContractCard({ contract }: { contract: Contract }) {
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
                  onClick={() => registerPortalShare("whatsapp", tenantPortal.phone || "")}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              ) : null}
              {emailLink ? (
                <a
                  href={emailLink}
                  onClick={() => registerPortalShare("email", tenantPortal.email || "")}
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
    </article>
  );
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

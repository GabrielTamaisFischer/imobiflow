import { Loader2, Plus, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import {
  createRegistration,
  listRegistrations,
  type PartyRegistration,
  type RegistrationInput,
  type RegistrationRole,
} from "@/product/registrations";
import { useSessionGuard } from "@/product/use-session-guard";

type RegistryConfig = {
  role: RegistrationRole;
  moduleKey: "buyers" | "tenants" | "brokers";
  singular: string;
  plural: string;
  description: string;
  emptyDescription: string;
};

export function PartyRegistryPage({ config }: { config: RegistryConfig }) {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey(config.moduleKey);
  const [items, setItems] = useState<PartyRegistration[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoadingItems(true);
    setError(null);
    try {
      const response = await listRegistrations(config.role);
      setItems(response.registrations);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Não foi possível carregar ${config.plural.toLowerCase()}.`);
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) void refresh();
  }, [isLoading, session, config.role]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [
        item.party.name,
        item.party.document,
        item.party.email,
        item.party.phone,
        item.party.whatsapp,
        item.profile?.creci_number,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [items, search]);

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
          <p className="text-sm font-semibold">Cadastro de {config.plural.toLowerCase()}</p>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo {config.singular.toLowerCase()}
        </button>
      </div>

      {showForm ? (
        <RegistrationForm
          role={config.role}
          singular={config.singular}
          onCancel={() => setShowForm(false)}
          onCreated={(registration) => {
            setItems((current) => {
              const exists = current.some((item) => item.id === registration.id);
              return exists
                ? current.map((item) => (item.id === registration.id ? registration : item))
                : [registration, ...current];
            });
            setShowForm(false);
          }}
        />
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {items.length ? (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Pesquisar ${config.singular.toLowerCase()} por nome, documento, contato${config.role === "broker" ? " ou CRECI" : ""}`}
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      ) : null}

      {loadingItems ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando {config.plural.toLowerCase()}...
        </section>
      ) : items.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={`Nenhum ${config.singular.toLowerCase()} cadastrado`}
          description={config.emptyDescription}
          actionLabel={`Cadastrar ${config.singular.toLowerCase()}`}
          onAction={() => setShowForm(true)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Nenhum cadastro encontrado"
          description="Ajuste a pesquisa para localizar o cadastro desejado."
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <RegistrationCard key={item.id} item={item} />
          ))}
        </section>
      )}
    </ModulePage>
  );
}

function RegistrationForm({
  role,
  singular,
  onCancel,
  onCreated,
}: {
  role: RegistrationRole;
  singular: string;
  onCancel: () => void;
  onCreated: (registration: PartyRegistration) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    const input: RegistrationInput = {
      name: String(form.get("name") ?? "").trim(),
      party_type: String(form.get("party_type") ?? "individual") === "company" ? "company" : "individual",
      document: String(form.get("document") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      whatsapp: String(form.get("whatsapp") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim(),
    };

    if (role === "buyer") {
      input.interest_json = {
        interest_type: String(form.get("interest_type") ?? "").trim() || null,
        desired_property: String(form.get("desired_property") ?? "").trim() || null,
      };
      input.financial_json = {
        budget: String(form.get("budget") ?? "").trim() || null,
      };
    }

    if (role === "tenant") {
      input.rental_json = {
        desired_property: String(form.get("desired_property") ?? "").trim() || null,
        monthly_budget: String(form.get("monthly_budget") ?? "").trim() || null,
      };
    }

    if (role === "broker") {
      input.creci_number = String(form.get("creci_number") ?? "").trim();
      input.bio_text = String(form.get("bio_text") ?? "").trim();
    }

    try {
      const response = await createRegistration(role, input);
      onCreated(response.registration);
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o cadastro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Novo {singular.toLowerCase()}</h2>
          <p className="text-sm text-muted-foreground">
            A identidade civil é reutilizada automaticamente quando o CPF/CNPJ já existe nesta imobiliária.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="h-9 rounded-md border border-border px-3 text-sm font-medium">
          Cancelar
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Nome / Razão social" name="name" required />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tipo de pessoa</span>
          <select name="party_type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="individual">Pessoa física</option>
            <option value="company">Pessoa jurídica</option>
          </select>
        </label>
        <Field label="CPF / CNPJ" name="document" />
        <Field label="E-mail" name="email" type="email" />
        <Field label="Telefone" name="phone" />
        <Field label="WhatsApp" name="whatsapp" />

        {role === "buyer" ? (
          <>
            <Field label="Interesse" name="interest_type" placeholder="Compra, investimento..." />
            <Field label="Imóvel desejado" name="desired_property" />
            <Field label="Orçamento" name="budget" placeholder="Ex.: R$ 850.000" />
          </>
        ) : null}

        {role === "tenant" ? (
          <>
            <Field label="Imóvel desejado" name="desired_property" />
            <Field label="Orçamento mensal" name="monthly_budget" placeholder="Ex.: R$ 3.500" />
          </>
        ) : null}

        {role === "broker" ? (
          <>
            <Field label="CRECI" name="creci_number" />
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium">Bio profissional</span>
              <textarea name="bio_text" rows={3} className="w-full rounded-md border border-input bg-background p-3 text-sm" />
            </label>
          </>
        ) : null}

        <label className="space-y-1 text-sm md:col-span-2 xl:col-span-3">
          <span className="font-medium">Observações</span>
          <textarea name="notes" rows={3} className="w-full rounded-md border border-input bg-background p-3 text-sm" />
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Salvar {singular.toLowerCase()}
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

function RegistrationCard({ item }: { item: PartyRegistration }) {
  const { party, profile, role, linked_users: linkedUsers } = item;
  const roleLabel = role === "buyer" ? "Comprador" : role === "tenant" ? "Inquilino" : "Corretor";

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{party.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {roleLabel} · {party.party_type === "company" ? "Pessoa jurídica" : "Pessoa física"}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-1 text-sm text-muted-foreground">
        {party.document ? <p className="truncate">Documento: {party.document}</p> : null}
        {party.whatsapp || party.phone ? <p className="truncate">Contato: {party.whatsapp || party.phone}</p> : null}
        {party.email ? <p className="truncate">E-mail: {party.email}</p> : null}
        {profile?.creci_number ? <p className="truncate">CRECI: {profile.creci_number}</p> : null}
      </div>

      {role === "broker" ? (
        <div className="mt-4 rounded-md border border-border bg-background p-3">
          <p className="text-xs font-semibold">Acesso à plataforma</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {linkedUsers.length
              ? linkedUsers.map((user) => `${user.email} · ${user.status}`).join(" | ")
              : "Ficha profissional cadastrada sem usuário de acesso vinculado."}
          </p>
        </div>
      ) : null}

      {party.notes ? (
        <p className="mt-4 line-clamp-3 rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
          {party.notes}
        </p>
      ) : null}
    </article>
  );
}

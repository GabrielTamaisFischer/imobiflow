import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Loader2, Plus, RotateCw, UserPlus, XCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import {
  cancelInvitation,
  inviteUser,
  listInvitations,
  listUsers,
  reissueInvitation,
  type AppUserSummary,
  type UserInvitation,
} from "@/product/auth";
import {
  createPaymentGatewayAccount,
  listPaymentGatewayAccounts,
  type PaymentGatewayAccount,
  type PaymentGatewayAccountInput,
  type PaymentGatewayProvider,
} from "@/product/gateway-accounts";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/configuracoes")({
  component: SettingsPage,
});

const providerLabels: Record<PaymentGatewayProvider, string> = {
  pjbank: "PJBank",
  asaas: "Asaas",
  iugu: "Iugu",
  mercado_pago: "Mercado Pago",
  stripe: "Stripe",
  manual: "Manual",
  other: "Outro",
};

function SettingsPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("settings");
  const [gatewayAccounts, setGatewayAccounts] = useState<PaymentGatewayAccount[]>([]);
  const [users, setUsers] = useState<AppUserSummary[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshSettings() {
    setIsSettingsLoading(true);
    setError(null);

    try {
      const [gatewayResponse, usersResponse, invitationsResponse] = await Promise.all([
        listPaymentGatewayAccounts(),
        listUsers(),
        listInvitations(),
      ]);
      setGatewayAccounts(gatewayResponse.gateway_accounts);
      setUsers(usersResponse.users);
      setInvitations(invitationsResponse.invitations);
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Não foi possível carregar as configurações.",
      );
    } finally {
      setIsSettingsLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshSettings();
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
      <section className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Usuários e permissões</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Convide membros para a mesma empresa com cargo operacional. A API valida assinatura ativa e permissão
            users.manage antes de criar qualquer convite.
          </p>
        </div>
      </section>

      <InviteUserForm
        onCreated={(inviteUrl) => {
          setLastInviteUrl(inviteUrl);
          void refreshSettings();
        }}
      />

      {lastInviteUrl ? (
        <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="font-medium">Convite criado ou reemitido</p>
          <p className="mt-1 break-all text-muted-foreground">{lastInviteUrl}</p>
        </div>
      ) : null}

      {isSettingsLoading ? null : (
        <UsersAndInvitations
          users={users}
          invitations={invitations}
          onChanged={() => void refreshSettings()}
          onInviteUrl={setLastInviteUrl}
        />
      )}

      <section className="mb-4 mt-6 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Gateways financeiros</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prepare Asaas, PJBank, Iugu, Mercado Pago, Stripe ou outro provedor para PIX, boleto e webhooks.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setShowGatewayForm((current) => !current)}
          className="w-full md:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" />
          Configurar gateway
        </Button>
      </section>

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: a configuração real do gateway exige backend publicado e sessão autenticada.
        </div>
      ) : null}

      {showGatewayForm ? (
        <GatewayAccountForm
          onCancel={() => setShowGatewayForm(false)}
          onCreated={() => {
            setShowGatewayForm(false);
            void refreshSettings();
          }}
        />
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isSettingsLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando configurações...
        </section>
      ) : gatewayAccounts.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum gateway financeiro configurado"
          description="Cadastre uma referência segura do provedor para preparar a emissão real de PIX, boleto e confirmação por webhook."
          actionLabel="Configurar gateway"
          onAction={() => setShowGatewayForm(true)}
        />
      ) : (
        <section className="space-y-3">
          {gatewayAccounts.map((account) => (
            <GatewayAccountCard key={account.id} account={account} />
          ))}
        </section>
      )}
    </ModulePage>
  );
}

type InviteRole = "admin" | "manager" | "broker" | "financial" | "inspector" | "legal";

const inviteRoleLabels: Record<InviteRole, string> = {
  admin: "Administrador",
  manager: "Gerente",
  broker: "Corretor",
  financial: "Financeiro",
  inspector: "Vistoriador",
  legal: "Jurídico/Contratos",
};

function InviteUserForm({ onCreated }: { onCreated: (inviteUrl: string) => void }) {
  const [form, setForm] = useState<{ email: string; name: string; roleSystemKey: InviteRole }>({
    email: "",
    name: "",
    roleSystemKey: "broker",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await inviteUser({
        email: form.email,
        name: form.name || undefined,
        roleSystemKey: form.roleSystemKey,
      });
      onCreated(response.invite_url);
      setForm((current) => ({ ...current, email: "", name: "" }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível gerar o convite.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_220px_auto] md:items-end">
        <label className="text-sm">
          <span className="font-medium">E-mail</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            placeholder="corretor@imobiliaria.com.br"
          />
        </label>

        <label className="text-sm">
          <span className="font-medium">Nome opcional</span>
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            placeholder="Nome do membro"
          />
        </label>

        <label className="text-sm">
          <span className="font-medium">Cargo</span>
          <select
            value={form.roleSystemKey}
            onChange={(event) =>
              setForm((current) => ({ ...current, roleSystemKey: event.target.value as InviteRole }))
            }
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(inviteRoleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          Convidar
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

function UsersAndInvitations({
  users,
  invitations,
  onChanged,
  onInviteUrl,
}: {
  users: AppUserSummary[];
  invitations: UserInvitation[];
  onChanged: () => void;
  onInviteUrl: (inviteUrl: string) => void;
}) {
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Usuários ativos da empresa</h3>
        <div className="mt-4 space-y-3">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado para esta empresa.</p>
          ) : (
            users.map((user) => (
              <div key={user.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="mt-1 text-muted-foreground">{user.email}</p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                    {user.roles?.name ?? user.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Convites</h3>
        <div className="mt-4 space-y-3">
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum convite criado ainda.</p>
          ) : (
            invitations.map((invitation) => (
              <InvitationCard
                key={invitation.id}
                invitation={invitation}
                onChanged={onChanged}
                onInviteUrl={onInviteUrl}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function InvitationCard({
  invitation,
  onChanged,
  onInviteUrl,
}: {
  invitation: UserInvitation;
  onChanged: () => void;
  onInviteUrl: (inviteUrl: string) => void;
}) {
  const [isWorking, setIsWorking] = useState(false);
  const isPending = invitation.status === "pending";

  async function handleCancel() {
    setIsWorking(true);
    try {
      await cancelInvitation(invitation.id);
      onChanged();
    } finally {
      setIsWorking(false);
    }
  }

  async function handleReissue() {
    setIsWorking(true);
    try {
      const response = await reissueInvitation(invitation.id);
      onInviteUrl(response.invite_url);
      onChanged();
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{invitation.name || invitation.email}</p>
          <p className="mt-1 text-muted-foreground">{invitation.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {invitation.roles?.name ?? "Cargo não informado"} · {invitationStatusLabel(invitation.status)}
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {new Date(invitation.expires_at).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={isWorking} onClick={handleReissue}>
          {isWorking ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-2 h-3.5 w-3.5" />}
          Reemitir
        </Button>
        {isPending ? (
          <Button type="button" size="sm" variant="outline" disabled={isWorking} onClick={handleCancel}>
            <XCircle className="mr-2 h-3.5 w-3.5" />
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function invitationStatusLabel(status: UserInvitation["status"]) {
  const labels = {
    pending: "Pendente",
    accepted: "Aceito",
    cancelled: "Cancelado",
    expired: "Expirado",
  };

  return labels[status];
}

function GatewayAccountForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<PaymentGatewayAccountInput>({
    provider: "iugu",
    name: "",
    status: "testing",
    credentials_ref: "",
    webhook_secret_ref: "",
    settings: {
      environment: "sandbox",
      default_payment_method: "pix",
      webhook_url: "",
      notes: "",
    },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await createPaymentGatewayAccount(form);
      onCreated();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Não foi possível configurar o gateway.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium">Provedor</span>
          <select
            value={form.provider}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                provider: event.target.value as PaymentGatewayProvider,
              }))
            }
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(providerLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="font-medium">Nome interno</span>
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            placeholder="Iugu Sandbox"
          />
        </label>

        <label className="text-sm">
          <span className="font-medium">Ambiente</span>
          <select
            value={form.settings.environment}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                settings: {
                  ...current.settings,
                  environment: event.target.value as "sandbox" | "production",
                },
              }))
            }
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Produção</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="font-medium">Status</span>
          <select
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                status: event.target.value as "active" | "inactive" | "testing",
              }))
            }
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="testing">Teste</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="font-medium">Método padrão</span>
          <select
            value={form.settings.default_payment_method}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                settings: {
                  ...current.settings,
                  default_payment_method: event.target.value as "pix" | "boleto" | "hybrid",
                },
              }))
            }
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="pix">PIX</option>
            <option value="boleto">Boleto</option>
            <option value="hybrid">PIX + boleto</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="font-medium">Referência da credencial</span>
          <input
            value={form.credentials_ref}
            onChange={(event) =>
              setForm((current) => ({ ...current, credentials_ref: event.target.value }))
            }
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            placeholder="vercel:IUGU_API_KEY"
          />
        </label>

        <label className="text-sm md:col-span-2">
          <span className="font-medium">Webhook do provedor</span>
          <input
            value={form.settings.webhook_url}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                settings: { ...current.settings, webhook_url: event.target.value },
              }))
            }
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            placeholder="https://sua-api.com/webhooks/payments/asaas"
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Chaves reais não devem ser digitadas aqui. Use apenas referências de segredo, como variáveis da Vercel ou cofre seguro.
      </p>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar gateway
        </Button>
      </div>
    </form>
  );
}

function GatewayAccountCard({ account }: { account: PaymentGatewayAccount }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">{account.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {providerLabels[account.provider]} · {gatewayStatusLabel(account.status)}
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {account.settings.environment === "production" ? "Produção" : "Sandbox"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <Info label="Método padrão" value={paymentMethodLabel(account.settings.default_payment_method)} />
        <Info label="Credencial" value={account.credentials_ref || "Não vinculada"} />
        <Info label="Webhook" value={account.settings.webhook_url || "Não informado"} />
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

function gatewayStatusLabel(status: PaymentGatewayAccount["status"]) {
  const labels = {
    active: "Ativo",
    inactive: "Inativo",
    testing: "Teste",
    blocked: "Bloqueado",
    archived: "Arquivado",
  };

  return labels[status];
}

function paymentMethodLabel(method?: string) {
  if (method === "boleto") return "Boleto";
  if (method === "hybrid") return "PIX + boleto";
  return "PIX";
}

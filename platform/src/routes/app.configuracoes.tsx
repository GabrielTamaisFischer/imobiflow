import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Loader2, Plus, RotateCw, UserPlus, XCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import {
  cancelInvitation,
  changePassword,
  createRole,
  deleteRole,
  getCompany,
  inviteUser,
  listInvitations,
  listPermissions,
  listRoles,
  listUsers,
  reissueInvitation,
  updateCompany,
  updateUser,
  type AppUserSummary,
  type CompanyIdentity,
  type CompanyRole,
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
  const [company, setCompany] = useState<CompanyIdentity | null>(null);
  const [roles, setRoles] = useState<CompanyRole[]>([]);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  async function refreshSettings() {
    setIsSettingsLoading(true);
    setError(null);
    setGatewayError(null);

    try {
      const [usersResponse, invitationsResponse, companyResponse, rolesResponse] =
        await Promise.all([listUsers(), listInvitations(), getCompany(), listRoles()]);
      setUsers(usersResponse.users);
      setInvitations(invitationsResponse.invitations);
      setCompany(companyResponse.company);
      setRoles(rolesResponse.roles);
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Não foi possível carregar as configurações.",
      );
    } finally {
      setIsSettingsLoading(false);
    }

    try {
      const gatewayResponse = await listPaymentGatewayAccounts();
      setGatewayAccounts(gatewayResponse.gateway_accounts);
    } catch (gatewaySettingsError) {
      setGatewayError(
        gatewaySettingsError instanceof Error
          ? gatewaySettingsError.message
          : "Nao foi possivel carregar os gateways financeiros.",
      );
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
      {company ? (
        <CompanyIdentityForm company={company} onSaved={() => void refreshSettings()} />
      ) : null}

      <PasswordChangeForm />

      <section className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Usuários e permissões</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Convide membros para a mesma empresa com cargo operacional. A API valida assinatura
            ativa e permissão users.manage antes de criar qualquer convite.
          </p>
        </div>
      </section>

      <InviteUserForm
        actorRole={session?.access.appUser?.role ?? ""}
        roles={roles}
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
        <>
          <UsersAndInvitations
            users={users}
            invitations={invitations}
            roles={roles}
            actorRole={session?.access.appUser?.role ?? ""}
            onChanged={() => void refreshSettings()}
            onInviteUrl={setLastInviteUrl}
          />
          <RoleManagement roles={roles} onChanged={() => void refreshSettings()} />
        </>
      )}

      <section className="mb-4 mt-6 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Gateways financeiros</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prepare Asaas, PJBank, Iugu, Mercado Pago, Stripe ou outro provedor para PIX, boleto e
            webhooks.
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
          Modo visualização ativo: a configuração real do gateway exige backend publicado e sessão
          autenticada.
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

      {gatewayError ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          Gateways financeiros indisponiveis: {gatewayError}
        </div>
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

function CompanyIdentityForm({
  company,
  onSaved,
}: {
  company: CompanyIdentity;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: company.name,
    document: company.document ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await updateCompany(form);
      setMessage("Dados da empresa atualizados.");
      onSaved();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nao foi possivel atualizar a empresa.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      method="post"
      onSubmit={submit}
      className="mb-4 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold">Empresa</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Dados da imobiliaria vinculada a esta sessao.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          Nome
          <input
            required
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="text-sm">
          E-mail
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="text-sm">
          Documento
          <input
            value={form.document}
            onChange={(event) =>
              setForm((current) => ({ ...current, document: event.target.value }))
            }
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="text-sm">
          Telefone
          <input
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
      </div>
      {message ? <p className="mt-3 text-sm text-primary">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={loading} className="mt-4">
        {loading ? "Salvando..." : "Salvar empresa"}
      </Button>
    </form>
  );
}

function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await changePassword(currentPassword, newPassword);
      setMessage(response.message);
      setCurrentPassword("");
      setNewPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Nao foi possivel alterar a senha.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      method="post"
      onSubmit={submit}
      className="mb-4 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold">Seguranca da conta</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A troca revoga todas as sessoes e exige um novo login.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          Senha atual
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="text-sm">
          Nova senha
          <input
            type="password"
            minLength={12}
            maxLength={128}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
      </div>
      {message ? <p className="mt-3 text-sm text-primary">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={loading} className="mt-4">
        {loading ? "Alterando..." : "Alterar senha"}
      </Button>
    </form>
  );
}

function InviteUserForm({
  onCreated,
  actorRole,
  roles,
}: {
  onCreated: (inviteUrl: string) => void;
  actorRole: string;
  roles: CompanyRole[];
}) {
  const [form, setForm] = useState<{ email: string; name: string; roleId: string }>({
    email: "",
    name: "",
    roleId: "",
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
        roleId: form.roleId || undefined,
        roleSystemKey: form.roleId ? undefined : "broker",
      });
      onCreated(response.invite_url);
      setForm((current) => ({ ...current, email: "", name: "" }));
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Não foi possível gerar o convite.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="mb-4 rounded-lg border border-border bg-card p-4"
    >
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
            value={form.roleId}
            onChange={(event) => setForm((current) => ({ ...current, roleId: event.target.value }))}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Corretor (padrao)</option>
            {roles
              .filter((role) => role.system_key !== "owner" || actorRole === "owner")
              .map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
          </select>
        </label>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" />
          )}
          Convidar
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

function RoleManagement({ roles, onChanged }: { roles: CompanyRole[]; onChanged: () => void }) {
  const [permissions, setPermissions] = useState<Array<{ key: string; description: string }>>([]);
  const [name, setName] = useState("");
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void listPermissions()
      .then((response) => setPermissions(response.permissions))
      .catch((loadError) =>
        setError(
          loadError instanceof Error ? loadError.message : "Nao foi possivel carregar permissoes.",
        ),
      );
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createRole({ name, permissionKeys });
      setName("");
      setPermissionKeys([]);
      onChanged();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Nao foi possivel criar o papel.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function remove(roleId: string) {
    setLoading(true);
    setError(null);
    try {
      await deleteRole(roleId);
      onChanged();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Nao foi possivel excluir o papel.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Papeis e permissoes</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Os papeis padrao sao protegidos. Papeis personalizados podem combinar permissoes da empresa.
      </p>
      <form
        method="post"
        onSubmit={submit}
        className="mt-4 grid gap-3 md:grid-cols-[240px_1fr_auto] md:items-end"
      >
        <label className="text-sm">
          Nome do papel
          <input
            required
            minLength={2}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        <label className="text-sm">
          Permissoes
          <select
            multiple
            required
            value={permissionKeys}
            onChange={(event) =>
              setPermissionKeys(
                Array.from(event.currentTarget.selectedOptions, (option) => option.value),
              )
            }
            className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2"
          >
            {permissions.map((permission) => (
              <option key={permission.key} value={permission.key}>
                {permission.description} ({permission.key})
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={loading || permissionKeys.length === 0}>
          Criar papel
        </Button>
      </form>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {roles.map((role) => (
          <div
            key={role.id}
            className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
          >
            <div>
              <p className="font-medium">{role.name}</p>
              <p className="text-xs text-muted-foreground">
                {role.permissions.length} permissoes · {role.users_count} usuarios
              </p>
            </div>
            {!role.is_system ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void remove(role.id)}
              >
                Excluir
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function UsersAndInvitations({
  users,
  invitations,
  roles,
  actorRole,
  onChanged,
  onInviteUrl,
}: {
  users: AppUserSummary[];
  invitations: UserInvitation[];
  roles: CompanyRole[];
  actorRole: string;
  onChanged: () => void;
  onInviteUrl: (inviteUrl: string) => void;
}) {
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Usuários ativos da empresa</h3>
        <div className="mt-4 space-y-3">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum usuário encontrado para esta empresa.
            </p>
          ) : (
            users.map((user) => (
              <UserIdentityCard
                key={user.id}
                user={user}
                roles={roles}
                actorRole={actorRole}
                onChanged={onChanged}
              />
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

function UserIdentityCard({
  user,
  roles,
  actorRole,
  onChanged,
}: {
  user: AppUserSummary;
  roles: CompanyRole[];
  actorRole: string;
  onChanged: () => void;
}) {
  const [roleId, setRoleId] = useState(user.role_id);
  const [status, setStatus] = useState<AppUserSummary["status"]>(user.status);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      await updateUser(user.id, { roleId, status });
      onChanged();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Nao foi possivel atualizar o usuario.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <p className="font-medium">{user.name}</p>
      <p className="mt-1 text-muted-foreground">{user.email}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          {roles
            .filter(
              (role) =>
                role.system_key !== "owner" || actorRole === "owner" || role.id === user.role_id,
            )
            .map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as AppUserSummary["status"])}
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
          <option value="blocked">Bloqueado</option>
        </select>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={save}
        className="mt-3"
      >
        {loading ? "Salvando..." : "Salvar usuario"}
      </Button>
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
            {invitation.roles?.name ?? "Cargo não informado"} ·{" "}
            {invitationStatusLabel(invitation.status)}
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {new Date(invitation.expires_at).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isWorking}
          onClick={handleReissue}
        >
          {isWorking ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="mr-2 h-3.5 w-3.5" />
          )}
          Reemitir
        </Button>
        {isPending ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isWorking}
            onClick={handleCancel}
          >
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
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível configurar o gateway.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="mb-4 rounded-lg border border-border bg-card p-4"
    >
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
        Chaves reais não devem ser digitadas aqui. Use apenas referências de segredo, como variáveis
        da Vercel ou cofre seguro.
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
        <Info
          label="Método padrão"
          value={paymentMethodLabel(account.settings.default_payment_method)}
        />
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

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type EligibleUser,
  type GroupedAccess,
  type OwnershipBadge,
  type ResourceAccessRow,
  type ResourcePermission,
  decideGrantMethod,
  groupAccessByUser,
  ownershipBadgeLabels,
  permissionLabels,
  resourcePermissions,
  togglePermission,
  withImpliedView,
} from "@/product/sharing";
import { getSafeApiErrorMessage } from "@/product/app-access";

// Fase 2.2D — badge discreto "Meu"/"Compartilhado" (Seção "BADGES" da
// tarefa). Não é decisão de segurança: apenas reflete o que o backend já
// decidiu (own vs shared) para o usuário entender rapidamente o que está
// vendo. Owner/Admin/Manager não recebem badge (getOwnershipBadge já
// retorna null para eles).
export function ResourceOwnershipBadge({ badge }: { badge: OwnershipBadge }) {
  if (!badge) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        badge === "meu" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700"
      }`}
    >
      {ownershipBadgeLabels[badge]}
    </span>
  );
}

export type ResourceShareDialogProps = {
  // "imóvel" | "lead" — usado só para textos amigáveis.
  resourceLabel: string;
  resourceTitle: string;
  ownerName: string | null;
  // O usuário pode gerenciar o compartilhamento deste recurso específico
  // (reflexo de UX de canManagePropertySharing/canManageLeadSharing — não é
  // a fonte de verdade, só decide o que mostrar).
  canManage: boolean;
  currentUserId: string | null | undefined;
  onClose: () => void;
  listEligibleUsers: () => Promise<{ users: EligibleUser[] }>;
  listAccess: () => Promise<{ access: ResourceAccessRow[] }>;
  grant: (userId: string, permissions: ResourcePermission[]) => Promise<unknown>;
  replace: (userId: string, permissions: ResourcePermission[]) => Promise<unknown>;
  revoke: (accessId: string) => Promise<unknown>;
};

export function ResourceShareDialog({
  resourceLabel,
  resourceTitle,
  ownerName,
  canManage,
  currentUserId,
  onClose,
  listEligibleUsers,
  listAccess,
  grant,
  replace,
  revoke,
}: ResourceShareDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [grouped, setGrouped] = useState<GroupedAccess[]>([]);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  async function refresh() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [accessResponse, usersResponse] = await Promise.all([
        listAccess(),
        canManage ? listEligibleUsers() : Promise.resolve({ users: [] as EligibleUser[] }),
      ]);
      setGrouped(groupAccessByUser(accessResponse.access));
      setEligibleUsers(usersResponse.users);
    } catch (error) {
      setLoadError(
        getSafeApiErrorMessage(
          error,
          `Não foi possível carregar as pessoas com acesso a este ${resourceLabel}.`,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Acessibilidade: foco inicial no diálogo e fechamento via Esc, já que o
  // overlay é fixo (fixed inset-0), sem focus-trap de biblioteca.
  useEffect(() => {
    dialogRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const grantedUserIds = new Set(grouped.map((entry) => entry.user_id));
  const availableToAdd = eligibleUsers.filter(
    (user) => user.id !== currentUserId && !grantedUserIds.has(user.id),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Compartilhar ${resourceLabel}`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              {canManage ? `Compartilhar ${resourceLabel}` : "Pessoas com acesso"}
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{resourceTitle}</p>
            {ownerName ? (
              <p className="mt-1 text-xs text-muted-foreground">Responsável: {ownerName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
        </div>

        {isLoading ? (
          <div className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando pessoas com acesso...
          </div>
        ) : loadError ? (
          <p
            className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {loadError}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {canManage ? (
              <AddPersonSection
                resourceLabel={resourceLabel}
                availableUsers={availableToAdd}
                onGranted={() => void refresh()}
                grant={grant}
              />
            ) : null}

            <section>
              <p className="text-sm font-semibold">Pessoas com acesso</p>
              {grouped.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Ninguém tem acesso compartilhado a este {resourceLabel} ainda.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {grouped.map((entry) => (
                    <AccessRow
                      key={entry.user_id}
                      entry={entry}
                      canManage={canManage}
                      onChanged={() => void refresh()}
                      replace={replace}
                      revoke={revoke}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function PermissionCheckboxes({
  idPrefix,
  selected,
  disabled,
  onToggle,
}: {
  idPrefix: string;
  selected: ResourcePermission[];
  disabled?: boolean;
  onToggle: (permission: ResourcePermission, checked: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
      {resourcePermissions.map((permission) => {
        const inputId = `${idPrefix}-${permission}`;
        return (
          <label key={permission} htmlFor={inputId} className="flex items-center gap-1.5 text-xs">
            <input
              id={inputId}
              type="checkbox"
              checked={selected.includes(permission)}
              disabled={disabled}
              onChange={(event) => onToggle(permission, event.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            {permissionLabels[permission]}
          </label>
        );
      })}
    </div>
  );
}

function AddPersonSection({
  resourceLabel,
  availableUsers,
  onGranted,
  grant,
}: {
  resourceLabel: string;
  availableUsers: EligibleUser[];
  onGranted: () => void;
  grant: (userId: string, permissions: ResourcePermission[]) => Promise<unknown>;
}) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permissions, setPermissions] = useState<ResourcePermission[]>(["VIEW"]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGrant() {
    if (!selectedUserId) return;
    setIsSaving(true);
    setError(null);
    try {
      await grant(selectedUserId, withImpliedView(permissions));
      setSelectedUserId("");
      setPermissions(["VIEW"]);
      onGranted();
    } catch (grantError) {
      setError(
        getSafeApiErrorMessage(grantError, `Não foi possível compartilhar este ${resourceLabel}.`),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-sm font-semibold">Adicionar pessoa</p>
      {availableUsers.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Não há pessoas elegíveis disponíveis para compartilhar este {resourceLabel} no momento.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block space-y-1 text-xs" htmlFor="resource-share-user">
            <span className="font-medium">Pessoa</span>
            <select
              id="resource-share-user"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={isSaving}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Selecione uma pessoa</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="text-xs font-medium">Permissões</span>
            <div className="mt-1">
              <PermissionCheckboxes
                idPrefix="new-grant"
                selected={permissions}
                disabled={isSaving}
                onToggle={(permission, checked) =>
                  setPermissions((current) => togglePermission(current, permission, checked))
                }
              />
            </div>
          </div>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleGrant()}
            disabled={isSaving || !selectedUserId || permissions.length === 0}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Compartilhar
          </button>
        </div>
      )}
    </section>
  );
}

function AccessRow({
  entry,
  canManage,
  onChanged,
  replace,
  revoke,
}: {
  entry: GroupedAccess;
  canManage: boolean;
  onChanged: () => void;
  replace: (userId: string, permissions: ResourcePermission[]) => Promise<unknown>;
  revoke: (accessId: string) => Promise<unknown>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [permissions, setPermissions] = useState<ResourcePermission[]>(entry.permissions);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      // decideGrantMethod: este usuário já possui grant(s) neste recurso,
      // então a edição sempre usa PUT com o conjunto exato (inclusive um
      // array vazio, que revoga tudo de uma vez — Seção "POST X PUT").
      void decideGrantMethod(entry.permissions);
      await replace(entry.user_id, permissions);
      setIsEditing(false);
      onChanged();
    } catch (saveError) {
      setError(getSafeApiErrorMessage(saveError, "Não foi possível atualizar as permissões."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveOne(permission: ResourcePermission) {
    const accessId = entry.accessIdByPermission[permission];
    if (!accessId) return;
    setIsSaving(true);
    setError(null);
    try {
      await revoke(accessId);
      onChanged();
    } catch (revokeError) {
      setError(getSafeApiErrorMessage(revokeError, "Não foi possível remover esta permissão."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveAll() {
    setIsSaving(true);
    setError(null);
    try {
      await replace(entry.user_id, []);
      onChanged();
    } catch (removeError) {
      setError(getSafeApiErrorMessage(removeError, "Não foi possível remover o acesso."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <li className="rounded-md border border-border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{entry.user_name ?? "Pessoa"}</p>
          {entry.granted_by_name ? (
            <p className="text-[11px] text-muted-foreground">
              Concedido por {entry.granted_by_name}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setIsEditing((current) => !current)}
            disabled={isSaving}
            className="shrink-0 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isEditing ? "Cancelar" : "Editar"}
          </button>
        ) : null}
      </div>

      {isEditing && canManage ? (
        <div className="mt-2 space-y-2">
          <PermissionCheckboxes
            idPrefix={`edit-${entry.user_id}`}
            selected={permissions}
            disabled={isSaving}
            onToggle={(permission, checked) =>
              setPermissions((current) => togglePermission(current, permission, checked))
            }
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-border px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Salvar permissões
            </button>
            <button
              type="button"
              onClick={() => void handleRemoveAll()}
              disabled={isSaving}
              className="inline-flex h-8 items-center justify-center rounded border border-destructive/40 px-2 text-xs text-destructive disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remover acesso
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.permissions.map((permission) => (
            <span
              key={permission}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {permissionLabels[permission]}
              {canManage ? (
                <button
                  type="button"
                  onClick={() => void handleRemoveOne(permission)}
                  disabled={isSaving}
                  aria-label={`Remover permissão ${permissionLabels[permission]} de ${entry.user_name ?? "pessoa"}`}
                  className="ml-0.5 text-muted-foreground hover:text-destructive disabled:cursor-not-allowed"
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}
      {error ? (
        <p className="mt-1.5 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

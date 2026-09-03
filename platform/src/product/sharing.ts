// Fase 2.2D — utilitários compartilhados entre o compartilhamento de Imóveis
// (PropertyAccess, Fase 2.2B) e de Leads (LeadAccess, Fase 2.2C). Puramente
// de apresentação/UX: a fonte de verdade de autorização continua sendo
// exclusivamente o backend (authorization.ts). Nada aqui decide o que o
// usuário PODE fazer de fato — apenas como a UI deve se comportar e rotular
// o que o backend já decidiu.

// Espelha resourcePermissions em platform/backend/src/services/authorization.ts.
// Não reordenar/renomear sem espelhar o backend.
export const resourcePermissions = ["VIEW", "EDIT", "VISIT", "INSPECT", "NEGOTIATE"] as const;
export type ResourcePermission = (typeof resourcePermissions)[number];

// Rótulos humanos em português — a UI nunca deve expor os valores técnicos
// (VIEW/EDIT/VISIT/INSPECT/NEGOTIATE) diretamente ao usuário.
export const permissionLabels: Record<ResourcePermission, string> = {
  VIEW: "Visualizar",
  EDIT: "Editar",
  VISIT: "Visitas",
  INSPECT: "Vistorias",
  NEGOTIATE: "Negociação",
};

// Linha genérica de acesso concedido, comum a PropertyAccess e LeadAccess
// (sem o campo property_id/lead_id, que é específico de cada recurso).
export type ResourceAccessRow = {
  id: string;
  user_id: string;
  user_name: string | null;
  permission: ResourcePermission;
  granted_by: string;
  granted_by_name: string | null;
  created_at: string;
};

export type EligibleUser = { id: string; name: string; role?: string; status?: string };

// Um usuário com pelo menos uma permissão concedida em um recurso, com o
// conjunto de permissões já agrupado (a API retorna uma linha por
// permissão; a UI trabalha com o conjunto por pessoa).
export type GroupedAccess = {
  user_id: string;
  user_name: string | null;
  permissions: ResourcePermission[];
  granted_by_name: string | null;
  // ids de acesso por permissão, para permitir revogação granular (DELETE
  // /access/:accessId) de uma permissão específica sem afetar as demais.
  accessIdByPermission: Partial<Record<ResourcePermission, string>>;
};

// Agrupa as linhas (uma por permissão) em um registro por usuário, na ordem
// em que a API já devolve (created_at asc), preservando a ordem de chegada
// dos usuários.
export function groupAccessByUser(rows: ResourceAccessRow[]): GroupedAccess[] {
  const order: string[] = [];
  const byUser = new Map<string, GroupedAccess>();
  for (const row of rows) {
    let entry = byUser.get(row.user_id);
    if (!entry) {
      entry = {
        user_id: row.user_id,
        user_name: row.user_name,
        permissions: [],
        granted_by_name: row.granted_by_name,
        accessIdByPermission: {},
      };
      byUser.set(row.user_id, entry);
      order.push(row.user_id);
    }
    if (!entry.permissions.includes(row.permission)) entry.permissions.push(row.permission);
    entry.accessIdByPermission[row.permission] = row.id;
  }
  return order.map((userId) => byUser.get(userId)!);
}

// Regra de UX pedida na tarefa (Seção "PERMISSION SELECTOR"): marcar
// qualquer permissão específica (EDIT/VISIT/INSPECT/NEGOTIATE) deve manter
// VIEW visivelmente selecionado, já que o backend concede VIEW implicitamente
// quando qualquer outra permissão é concedida (grantPermissions em
// authorization.ts). Isto NÃO altera a semântica do backend — apenas evita
// que a UI mostre um estado contraditório (ex.: "Editar" marcado e
// "Visualizar" desmarcado, quando na prática o usuário já pode visualizar).
export function withImpliedView(permissions: ResourcePermission[]): ResourcePermission[] {
  if (permissions.length === 0) return permissions;
  if (permissions.includes("VIEW")) return permissions;
  return ["VIEW", ...permissions];
}

// Handler de toggle de um checkbox de permissão, já aplicando a regra acima.
// Desmarcar VIEW só é permitido quando nenhuma outra permissão está
// selecionada (senão VIEW é implícito e o checkbox deve permanecer marcado
// — nunca um estado visualmente contraditório).
export function togglePermission(
  current: ResourcePermission[],
  toggled: ResourcePermission,
  checked: boolean,
): ResourcePermission[] {
  if (toggled === "VIEW" && !checked) {
    const others = current.filter((permission) => permission !== "VIEW");
    return others.length > 0 ? withImpliedView(others) : [];
  }
  const next = checked
    ? [...current.filter((permission) => permission !== toggled), toggled]
    : current.filter((permission) => permission !== toggled);
  return withImpliedView(next);
}

// Decide se a concessão de um novo conjunto de permissões para um usuário
// deve usar POST (aditivo, usuário ainda sem nenhum grant neste recurso) ou
// PUT (conjunto exato, usuário já possui ao menos um grant) — Seção "POST X
// PUT" da tarefa.
export function decideGrantMethod(existingPermissions: ResourcePermission[]): "POST" | "PUT" {
  return existingPermissions.length > 0 ? "PUT" : "POST";
}

// "Meu" vs "Compartilhado" (Seção "BADGES"). Owner/Admin/Manager (company
// scope) não recebem badge — eles enxergam o recurso pela autoridade da
// empresa, não por ser responsável nem por grant explícito, e mostrar
// "Compartilhado" para eles seria enganoso. Para os demais: se o usuário
// autenticado é o responsável atual do recurso, é "meu"; caso contrário, se
// o recurso está de qualquer forma visível para ele (a única razão possível
// para um não-administrativo enxergar um recurso do qual não é responsável é
// um grant explícito — o backend já filtra own OR shared), é "compartilhado".
export type OwnershipBadge = "meu" | "compartilhado" | null;

export function getOwnershipBadge(params: {
  currentUserId: string | null | undefined;
  ownerId: string | null | undefined;
  isAdministrative: boolean;
}): OwnershipBadge {
  if (params.isAdministrative) return null;
  if (!params.currentUserId) return null;
  return params.ownerId === params.currentUserId ? "meu" : "compartilhado";
}

export const ownershipBadgeLabels: Record<Exclude<OwnershipBadge, null>, string> = {
  meu: "Meu",
  compartilhado: "Compartilhado",
};

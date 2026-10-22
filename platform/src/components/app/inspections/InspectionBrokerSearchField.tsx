import { useMemo, useState } from "react";
import { Search, User, X } from "lucide-react";
import type { EligibleUser } from "@/product/sharing";

type InspectionBrokerSearchFieldProps = {
  users: EligibleUser[];
  loadingUsers: boolean;
  selectedUserId: string | null;
  onSelect: (user: EligibleUser | null) => void;
  /** Texto do rótulo visível — "Responsável" na criação, "Alterar
   * responsável" no detalhe, por exemplo. */
  label: string;
  inputId: string;
};

/**
 * Autocomplete de responsável por nome ou CRECI. A lista de usuários
 * elegíveis vem de fora (reaproveita o único fetch que a tela já faz em
 * GET /real-estate/users — companyId, status ativo e papel elegível já são
 * garantidos pelo backend) e o filtro é 100% local: não existe um request
 * por tecla porque não existe request nenhum aqui além do que a tela já
 * fazia antes.
 */
export function InspectionBrokerSearchField({
  users,
  loadingUsers,
  selectedUserId,
  onSelect,
  label,
  inputId,
}: InspectionBrokerSearchFieldProps) {
  const [term, setTerm] = useState("");
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  const results = useMemo(() => {
    const query = term.trim().toLocaleLowerCase("pt-BR");
    if (!query) return users;
    return users.filter((user) => {
      const name = user.name.toLocaleLowerCase("pt-BR");
      const creci = (user.creci_number ?? "").toLocaleLowerCase("pt-BR");
      return name.includes(query) || (creci && creci.includes(query));
    });
  }, [users, term]);

  if (selectedUser) {
    return (
      <div className="block text-sm font-medium">
        <span id={`${inputId}-label`}>{label}</span>
        <div className="mt-1 flex items-center gap-3 rounded-md border border-input bg-background p-3 text-sm">
          {selectedUser.photo_url ? (
            <img src={selectedUser.photo_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <div className="flex-1">
            <p className="font-medium">{selectedUser.name}</p>
            <p className="text-xs text-muted-foreground">{selectedUser.creci_number ? `CRECI ${selectedUser.creci_number}` : "CRECI não informado"}</p>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label={`Remover ${selectedUser.name} como responsável`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="block text-sm font-medium">
      <label htmlFor={inputId}>{label}</label>
      <div className="relative mt-1">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar corretor por nome ou CRECI"
          aria-describedby={`${inputId}-status`}
          autoComplete="off"
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-normal"
        />
      </div>
      <p id={`${inputId}-status`} role="status" className="mt-1 text-xs font-normal text-muted-foreground">
        {loadingUsers
          ? "Carregando responsáveis..."
          : results.length === 0
            ? "Nenhum responsável encontrado."
            : `${results.length} responsável(is) encontrado(s).`}
      </p>
      {!loadingUsers && results.length > 0 ? (
        <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => onSelect(user)}
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm font-normal hover:bg-muted focus:bg-muted focus:outline-none"
              >
                {user.photo_url ? (
                  <img src={user.photo_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                )}
                <span className="flex-1">
                  <span className="block font-medium">{user.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {user.creci_number ? `CRECI ${user.creci_number}` : "CRECI não informado"}
                    {user.role ? ` · ${user.role}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

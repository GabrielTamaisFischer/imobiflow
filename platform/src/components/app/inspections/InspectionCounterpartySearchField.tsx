import { Loader2, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  searchMysqlInspectionParticipants,
  type MysqlInspectionCounterpartyRole,
  type MysqlInspectionParticipantSearchResult,
} from "@/product/inspections";
import { getSafeApiErrorMessage } from "@/product/app-access";

type SelectedCounterparty = {
  participant: MysqlInspectionParticipantSearchResult;
  role: MysqlInspectionCounterpartyRole;
};

function maskDocument(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
  if (digits.length === 14) return `${digits.slice(0, 2)}.***.***/****-${digits.slice(-2)}`;
  return value;
}

export function InspectionCounterpartySearchField({
  value,
  onChange,
  defaultRole,
  disabled = false,
  label = "Inquilino / Comprador",
}: {
  value: SelectedCounterparty | null;
  onChange: (value: SelectedCounterparty | null) => void;
  defaultRole: MysqlInspectionCounterpartyRole;
  disabled?: boolean;
  label?: string;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<MysqlInspectionParticipantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value || disabled) return;
    const query = term.trim();
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setError(null);
      searchMysqlInspectionParticipants(query)
        .then((response) => {
          if (!cancelled) setResults(response.participants);
        })
        .catch((cause) => {
          if (!cancelled) {
            setResults([]);
            setError(getSafeApiErrorMessage(cause, "Não foi possível buscar inquilinos/compradores."));
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, value, disabled]);

  const role = value?.role ?? defaultRole;
  const roleOptions = useMemo(
    () => ["tenant", "buyer"] as MysqlInspectionCounterpartyRole[],
    [],
  );

  function select(participant: MysqlInspectionParticipantSearchResult) {
    const preferred = defaultRole;
    onChange({ participant, role: preferred });
    setTerm("");
    setResults([]);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>

      {value ? (
        <div className="rounded-md border border-border bg-background p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{value.participant.name}</p>
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {value.participant.document ? <p>CPF/CNPJ: {maskDocument(value.participant.document)}</p> : null}
                {value.participant.phone ? <p>Telefone: {value.participant.phone}</p> : null}
                {value.participant.email ? <p>E-mail: {value.participant.email}</p> : null}
              </div>
            </div>
            {!disabled ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="h-9 rounded-md border border-border px-3 text-sm"
                >
                  Trocar
                </button>
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-destructive/40 px-3 text-sm text-destructive"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Remover
                </button>
              </div>
            ) : null}
          </div>

          <label className="mt-3 block text-xs font-medium text-muted-foreground">
            Papel nesta vistoria
            <select
              value={role}
              disabled={disabled}
              onChange={(event) => {
                if (!value) return;
                onChange({ ...value, role: event.target.value as MysqlInspectionCounterpartyRole });
              }}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {roleOptions.includes("tenant") ? <option value="tenant">Inquilino</option> : null}
              {roleOptions.includes("buyer") ? <option value="buyer">Comprador</option> : null}
            </select>
          </label>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={term}
              disabled={disabled}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Buscar por nome, CPF, telefone ou e-mail..."
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
            />
            {searching ? <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
          </div>
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
          {term.trim().length === 1 ? <p className="text-xs text-muted-foreground">Digite pelo menos 2 caracteres.</p> : null}
          {results.length > 0 ? (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border bg-background">
              {results.map((participant) => (
                <li key={participant.party_id}>
                  <button
                    type="button"
                    onClick={() => select(participant)}
                    className="block min-h-11 w-full px-3 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none"
                  >
                    <p className="text-sm font-medium">{participant.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {participant.document ? `CPF/CNPJ: ${maskDocument(participant.document)}` : "Documento não informado"}
                      {participant.phone ? ` | ${participant.phone}` : ""}
                    </p>
                    {participant.email ? <p className="text-xs text-muted-foreground">{participant.email}</p> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : term.trim().length >= 2 && !searching && !error ? (
            <p className="text-xs text-muted-foreground">Nenhum inquilino/comprador encontrado.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

export type { SelectedCounterparty };

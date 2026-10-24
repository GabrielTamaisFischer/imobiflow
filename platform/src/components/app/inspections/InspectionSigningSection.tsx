import { useEffect, useState } from "react";
import { Loader2, Link as LinkIcon, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import {
  cancelSigningProcess,
  createSigningProcess,
  downloadSignedInspectionReport,
  getSigningAudit,
  listSigningProcesses,
  regenerateSigningLink,
  revokeSigningParty,
  SIGNING_PARTY_ROLE_LABELS,
  SIGNING_PARTY_ROLES,
  type SigningEvent,
  type SigningParty,
  type SigningPartyRole,
  type SigningProcess,
} from "@/product/inspection-signing";
import {
  canCancelProcess,
  canDownloadSignedReport,
  canIssueNewLink,
  canRevokeParty,
  SIGNING_PARTY_STATUS_LABELS,
  SIGNING_PROCESS_STATUS_LABELS,
} from "@/product/inspection-signing-ui";
import type { MysqlInspection } from "@/product/inspections";

/**
 * Assinatura Online (Bloco 5) — seção "Assinaturas" dentro de
 * /app/vistorias/:inspectionId. Domínio novo (InspectionSigningProcess/
 * Party/Event), em paralelo à assinatura interna/presencial simples já
 * existente em InspectionF5FActions (que continua intocada).
 */

type Props = {
  inspection: MysqlInspection;
  canEdit: boolean;
  onError: (error: unknown) => void;
};

function emptySigner() {
  return { role: "owner" as SigningPartyRole, name: "", email: "", phone: "" };
}

export function InspectionSigningSection({ inspection, canEdit, onError }: Props) {
  const [processes, setProcesses] = useState<SigningProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [auditProcessId, setAuditProcessId] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<SigningEvent[]>([]);
  const [copiedPartyId, setCopiedPartyId] = useState<string | null>(null);
  const [signers, setSigners] = useState([emptySigner(), emptySigner()]);
  const [showNewProcessForm, setShowNewProcessForm] = useState(false);

  useEffect(() => {
    void refresh();
  }, [inspection.id]);

  async function refresh() {
    setLoading(true);
    try {
      const { processes: list } = await listSigningProcesses(inspection.id);
      setProcesses(list);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }

  const activeProcess = processes.find((process) => process.status === "pending" || process.status === "partially_signed");

  async function startProcess() {
    const validSigners = signers
      .map((signer) => ({ ...signer, name: signer.name.trim() }))
      .filter((signer) => signer.name.length > 0);
    if (validSigners.length === 0) return;
    setBusy(true);
    try {
      await createSigningProcess(
        inspection.id,
        validSigners.map((signer) => ({
          role: signer.role,
          name: signer.name,
          email: signer.email.trim() || undefined,
          phone: signer.phone.trim() || undefined,
        })),
      );
      setSigners([emptySigner(), emptySigner()]);
      setShowNewProcessForm(false);
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(processId: string, party: SigningParty) {
    setBusy(true);
    try {
      const { link_token } = await regenerateSigningLink(processId, party.id);
      const url = `${window.location.origin}/assinatura-vistoria/${link_token}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setCopiedPartyId(party.id);
      window.setTimeout(() => setCopiedPartyId((current) => (current === party.id ? null : current)), 2500);
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(processId: string, partyId: string) {
    setBusy(true);
    try {
      await revokeSigningParty(processId, partyId);
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(processId: string) {
    setBusy(true);
    try {
      await cancelSigningProcess(processId);
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function viewAudit(processId: string) {
    setBusy(true);
    try {
      const { events } = await getSigningAudit(processId);
      setAuditEvents(events);
      setAuditProcessId(processId);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSignedReport() {
    setDownloading(true);
    try {
      const { blob, fileName } = await downloadSignedInspectionReport(inspection.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError(error);
    } finally {
      setDownloading(false);
    }
  }

  const hasCompletedProcess = processes.some((process) => canDownloadSignedReport(process));
  const hasOutdatedCompletedProcess = processes.some((process) => process.status === "completed" && !process.is_current_report);

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Assinaturas</h2>
        {hasCompletedProcess ? (
          <button
            type="button"
            disabled={downloading}
            onClick={() => void downloadSignedReport()}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Baixar laudo assinado
          </button>
        ) : null}
      </div>

      {!loading && !hasCompletedProcess && hasOutdatedCompletedProcess ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          O PDF atual foi gerado depois das assinaturas existentes. As assinaturas antigas continuam preservadas no histórico, mas não valem para esta nova versão do laudo. Inicie um novo processo de assinatura para gerar o laudo assinado com o design atual.
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando processos de assinatura...</p>
      ) : processes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum processo de assinatura iniciado para esta vistoria.</p>
      ) : (
        <ul className="space-y-3">
          {processes.map((process) => (
            <li key={process.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">
                    {SIGNING_PROCESS_STATUS_LABELS[process.status]} · {process.progress_label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Iniciado em {formatDate(process.created_at)}
                    {!process.is_current_report ? " · Versão anterior do laudo" : " · Laudo atual"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void viewAudit(process.id)}
                    className="h-8 rounded-md border border-border px-2.5 text-xs font-medium disabled:opacity-50"
                  >
                    Ver trilha de auditoria
                  </button>
                  {canCancelProcess(process) && canEdit ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void cancel(process.id)}
                      className="h-8 rounded-md border border-destructive/30 px-2.5 text-xs font-medium text-destructive disabled:opacity-50"
                    >
                      Cancelar processo
                    </button>
                  ) : null}
                </div>
              </div>

              <ul className="mt-3 space-y-2">
                {process.parties.map((party) => (
                  <li key={party.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2">
                    <div>
                      <p className="text-sm font-medium">
                        {party.name} <span className="text-xs text-muted-foreground">({party.role_label})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{SIGNING_PARTY_STATUS_LABELS[party.status]}</p>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        {canIssueNewLink(process, party) ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void copyLink(process.id, party)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium disabled:opacity-50"
                          >
                            <LinkIcon className="h-3 w-3" />
                            {copiedPartyId === party.id ? "Link copiado!" : party.link_created_at ? "Gerar novo link" : "Enviar para assinatura"}
                          </button>
                        ) : null}
                        {canRevokeParty(party) ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void revoke(process.id, party.id)}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            Revogar
                          </button>
                        ) : null}
                        {party.status === "signed" ? (
                          <span className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600/10 px-2.5 text-xs font-medium text-emerald-800">
                            <UserCheck className="h-3 w-3" />
                            Assinado
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {auditProcessId ? (
        <div className="rounded-md border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Trilha de auditoria</p>
            <button type="button" onClick={() => setAuditProcessId(null)} className="text-xs text-muted-foreground underline">
              Fechar
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {auditEvents.map((event) => (
              <li key={event.id}>
                {formatDate(event.created_at)} — {event.event_type}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canEdit && inspection.status === "completed" && !activeProcess ? (
        <div>
          {!showNewProcessForm ? (
            <button
              type="button"
              onClick={() => setShowNewProcessForm(true)}
              className="h-9 rounded-md border border-border px-3 text-sm font-medium"
            >
              Iniciar assinatura online
            </button>
          ) : (
            <div className="space-y-3 rounded-md border border-border bg-background p-3">
              <p className="text-sm font-semibold">Novo processo de assinatura</p>
              {signers.map((signer, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-4">
                  <select
                    value={signer.role}
                    onChange={(event) =>
                      setSigners((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? { ...item, role: event.target.value as SigningPartyRole } : item)),
                      )
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {SIGNING_PARTY_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {SIGNING_PARTY_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Nome completo"
                    value={signer.name}
                    onChange={(event) =>
                      setSigners((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: event.target.value } : item)))
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm sm:col-span-2"
                  />
                  <input
                    placeholder="E-mail (opcional)"
                    value={signer.email}
                    onChange={(event) =>
                      setSigners((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, email: event.target.value } : item)))
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSigners((current) => [...current, emptySigner()])}
                className="text-xs font-medium text-primary"
              >
                + Adicionar signatário
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startProcess()}
                  className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}
                  Criar e enviar links
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewProcessForm(false)}
                  className="h-9 rounded-md border border-border px-3 text-sm font-medium"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : canEdit && inspection.status !== "completed" ? (
        <p className="text-xs text-muted-foreground">A assinatura online fica disponível depois que a vistoria for concluída.</p>
      ) : null}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

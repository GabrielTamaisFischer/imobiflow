import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileSignature, Loader2, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  getPublicInspectionSignature,
  signPublicInspectionSignature,
  type PublicInspectionSignatureResponse,
} from "@/product/public-inspection-signatures";

export const Route = createFileRoute("/assinar-vistoria/$token")({
  component: PublicInspectionSignaturePage,
});

const signerRoleLabels = {
  tenant: "Locatário",
  owner: "Proprietário",
  broker: "Corretor",
  manager: "Gestor",
  witness: "Testemunha",
};

function PublicInspectionSignaturePage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<PublicInspectionSignatureResponse | null>(null);
  const [signatureText, setSignatureText] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSignature();
  }, [token]);

  async function loadSignature() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getPublicInspectionSignature(token);
      setData(response);
      setSignatureText(response.signature.signature_text || response.signature.signer_name);
      setAcceptedTerms(response.signature.status === "signed");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar o link de assinatura.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSigning(true);
    setError(null);

    try {
      const response = await signPublicInspectionSignature(token, {
        signature_text: signatureText,
        accepted_terms: true,
      });
      setData(response);
      setAcceptedTerms(true);
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : "Não foi possível assinar o laudo.");
    } finally {
      setIsSigning(false);
    }
  }

  const signature = data?.signature;
  const inspection = data?.inspection;
  const isSigned = signature?.status === "signed";
  const address = [
    inspection?.properties?.neighborhood,
    inspection?.properties?.city,
    inspection?.properties?.state,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-8">
        <a href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            IF
          </span>
          ImobiFlow
        </a>

        {isLoading ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando assinatura...
          </div>
        ) : error && !data ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
            {error}
          </div>
        ) : data && inspection && signature ? (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Assinatura digital de vistoria
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight">{inspection.title}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {inspection.properties?.title ?? "Imóvel não informado"}
                    {address ? ` · ${address}` : ""}
                  </p>
                </div>
                <span
                  className={
                    isSigned
                      ? "rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                      : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                  }
                >
                  {isSigned ? "Assinada" : "Pendente"}
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Info label="Imobiliária" value={data.company.name} />
                <Info label="Assinante" value={signature.signer_name} />
                <Info label="Papel" value={signerRoleLabels[signature.signer_role]} />
                <Info label="Documento" value={signature.signer_document || "Não informado"} />
              </div>

              <div className="mt-6 rounded-md border border-border bg-background p-4">
                <h2 className="text-sm font-semibold">Resumo do laudo</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {inspection.summary ||
                    "Este link confirma ciência e aceite do laudo de vistoria registrado pela imobiliária."}
                </p>
              </div>

              <div className="mt-6 flex items-start gap-3 rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>
                  Ao assinar, o aceite fica registrado com data, dispositivo e trilha de auditoria
                  operacional no ImobiFlow.
                </p>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-6">
              {isSigned ? (
                <div className="flex h-full min-h-[360px] flex-col justify-center">
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                  <h2 className="mt-4 text-xl font-semibold">Assinatura confirmada</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Este laudo foi assinado por {signature.signer_name}
                    {signature.signed_at ? ` em ${formatDate(signature.signed_at)}.` : "."}
                  </p>
                  {inspection.pdf_url ? (
                    <a
                      href={inspection.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-6 inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition hover:bg-accent"
                    >
                      Abrir PDF do laudo
                    </a>
                  ) : null}
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSign}>
                  <div>
                    <FileSignature className="h-8 w-8 text-primary" />
                    <h2 className="mt-3 text-xl font-semibold">Confirmar assinatura</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Digite seu nome completo como aceite digital do laudo.
                    </p>
                  </div>

                  {error ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}

                  <label className="block text-sm">
                    <span className="text-xs font-medium text-muted-foreground">Nome completo</span>
                    <input
                      value={signatureText}
                      onChange={(event) => setSignatureText(event.target.value)}
                      required
                      className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                  </label>

                  <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(event) => setAcceptedTerms(event.target.checked)}
                      className="mt-1"
                      required
                    />
                    <span>
                      Declaro que revisei as informações do laudo e confirmo minha assinatura digital.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSigning || !acceptedTerms}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {isSigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                    Assinar laudo
                  </button>
                </form>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

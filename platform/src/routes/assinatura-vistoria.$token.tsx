import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Eraser, FileText, Loader2, PenLine, RotateCcw, ShieldCheck, Type as TypeIcon } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  getPublicSigningDocumentBlob,
  getPublicSigningView,
  signPublicSigning,
  type PublicSigningView,
} from "@/product/public-inspection-signing";
import { findTypedSignatureFont, TYPED_SIGNATURE_FONTS } from "@/product/inspection-signing-ui";

/**
 * Assinatura Online (Bloco 5) — página pública do signatário.
 * Rota NOVA e independente de /assinar-vistoria/$token (mecanismo legado,
 * Supabase, intocado). Mobile-first: desenhar ou digitar a assinatura,
 * consentimento obrigatório com o texto exato exigido.
 */
export const Route = createFileRoute("/assinatura-vistoria/$token")({
  component: PublicInspectionSigningPage,
});

type Step = "loading" | "not_found" | "view" | "choose_method" | "draw" | "type" | "done" | "already_signed";

function PublicInspectionSigningPage() {
  const { token } = Route.useParams();
  const [step, setStep] = useState<Step>("loading");
  const [view, setView] = useState<PublicSigningView | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void load();
    return () => {
      if (documentUrl) URL.revokeObjectURL(documentUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function load() {
    setStep("loading");
    setError(null);
    try {
      const data = await getPublicSigningView(token);
      setView(data);
      setStep(data.already_signed ? "already_signed" : "view");
      try {
        const blob = await getPublicSigningDocumentBlob(token);
        setDocumentUrl(URL.createObjectURL(blob));
      } catch {
        // Documento não carregou — ainda deixamos o signatário prosseguir.
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar este link.");
      setStep("not_found");
    }
  }

  async function submitSignature(input: { method: "drawn" | "typed"; image_base64: string; typed_text?: string; typed_font_id?: string }) {
    setSubmitting(true);
    setError(null);
    try {
      await signPublicSigning(token, { ...input, consent: true });
      setStep("done");
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : "Não foi possível registrar a assinatura.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-md">
        <a href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">IF</span>
          ImobiFlow
        </a>

        {step === "loading" ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : step === "not_found" ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
            {error ?? "Este link de assinatura não está mais disponível."}
          </div>
        ) : step === "already_signed" || step === "done" ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-border bg-card p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Assinatura confirmada</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {view ? `Obrigado, ${view.signer.name}. ` : ""}
              Sua assinatura eletrônica foi registrada com sucesso.
            </p>
          </div>
        ) : view ? (
          <div className="space-y-4">
            <section className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Laudo de Vistoria</p>
              <h1 className="mt-1 text-lg font-semibold">{view.company.name}</h1>
              {view.property ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {view.property.title}
                  {view.property.street ? ` · ${view.property.street}` : ""}
                  {view.property.neighborhood ? ` · ${view.property.neighborhood}` : ""}
                  {view.property.city ? ` · ${view.property.city}` : ""}
                </p>
              ) : null}
              <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                Você está assinando como: <span className="font-semibold">{view.signer.role_label}</span> — {view.signer.name}
              </p>
              {documentUrl ? (
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium"
                >
                  <FileText className="h-4 w-4" />
                  Ver documento antes de assinar
                </a>
              ) : null}
            </section>

            {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

            {step === "view" ? (
              <button
                type="button"
                onClick={() => setStep("choose_method")}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                Continuar para assinatura
              </button>
            ) : step === "choose_method" ? (
              <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-base font-semibold">Como deseja assinar?</h2>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("draw")}
                    className="flex flex-col items-center gap-2 rounded-md border border-border p-4 text-sm font-medium hover:bg-accent"
                  >
                    <PenLine className="h-6 w-6" />
                    Desenhar
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("type")}
                    className="flex flex-col items-center gap-2 rounded-md border border-border p-4 text-sm font-medium hover:bg-accent"
                  >
                    <TypeIcon className="h-6 w-6" />
                    Digitar
                  </button>
                </div>
              </section>
            ) : step === "draw" ? (
              <DrawSignaturePanel
                consentText={view.consent_text}
                submitting={submitting}
                onBack={() => setStep("choose_method")}
                onConfirm={(imageBase64) => void submitSignature({ method: "drawn", image_base64: imageBase64 })}
              />
            ) : step === "type" ? (
              <TypeSignaturePanel
                defaultName={view.signer.name}
                consentText={view.consent_text}
                submitting={submitting}
                onBack={() => setStep("choose_method")}
                onConfirm={(imageBase64, typedText, fontId) =>
                  void submitSignature({ method: "typed", image_base64: imageBase64, typed_text: typedText, typed_font_id: fontId })
                }
              />
            ) : null}

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Sua assinatura é registrada com data, horário e trilha de auditoria.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function isCanvasBlank(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return true;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 0) return false;
  }
  return true;
}

function canvasToPngBase64(canvas: HTMLCanvasElement) {
  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function DrawSignaturePanel({
  consentText,
  submitting,
  onBack,
  onConfirm,
}: {
  consentText: string;
  submitting: boolean;
  onBack: () => void;
  onConfirm: (imageBase64: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef<Array<{ x: number; y: number }[]>>([]);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [consented, setConsented] = useState(false);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const context = canvas.getContext("2d");
    if (context) {
      context.scale(2, 2);
      context.lineWidth = 2.5;
      context.lineCap = "round";
      context.strokeStyle = "#111827";
    }
  }, []);

  function pointerPos(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    const point = pointerPos(event);
    strokesRef.current.push([point]);
    setEmpty(false);
  }

  function continueStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const point = pointerPos(event);
    const current = strokesRef.current[strokesRef.current.length - 1];
    const previous = current[current.length - 1];
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    current.push(point);
    setHasDrawing(true);
  }

  function endStroke() {
    drawingRef.current = false;
  }

  function redrawFromStrokes() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      context.beginPath();
      context.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
    setHasDrawing(strokesRef.current.length > 0);
  }

  function clearCanvas() {
    strokesRef.current = [];
    redrawFromStrokes();
  }

  function undoLastStroke() {
    strokesRef.current.pop();
    redrawFromStrokes();
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || isCanvasBlank(canvas)) {
      setEmpty(true);
      return;
    }
    onConfirm(canvasToPngBase64(canvas));
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Desenhe sua assinatura</h2>
      <canvas
        ref={canvasRef}
        onPointerDown={startStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        className="mt-3 h-40 w-full touch-none rounded-md border border-dashed border-border bg-white"
      />
      {empty ? <p className="mt-2 text-xs text-destructive">Desenhe sua assinatura antes de confirmar.</p> : null}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={clearCanvas} className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium">
          <Eraser className="h-3.5 w-3.5" />
          Limpar
        </button>
        <button
          type="button"
          onClick={undoLastStroke}
          disabled={!hasDrawing}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Refazer
        </button>
      </div>

      <ConsentCheckbox text={consentText} checked={consented} onChange={setConsented} />

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onBack} className="h-11 flex-1 rounded-md border border-border text-sm font-medium">
          Voltar
        </button>
        <button
          type="button"
          disabled={!consented || submitting}
          onClick={confirm}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Confirmar assinatura
        </button>
      </div>
    </section>
  );
}

function TypeSignaturePanel({
  defaultName,
  consentText,
  submitting,
  onBack,
  onConfirm,
}: {
  defaultName: string;
  consentText: string;
  submitting: boolean;
  onBack: () => void;
  onConfirm: (imageBase64: string, typedText: string, fontId: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [fontId, setFontId] = useState(TYPED_SIGNATURE_FONTS[0].id);
  const [consented, setConsented] = useState(false);
  const [emptyName, setEmptyName] = useState(false);
  const selectedFont = findTypedSignatureFont(fontId);

  function renderToPngBase64(): string | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111827";
    context.font = `48px ${selectedFont.fontFamily}`;
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillText(trimmed, canvas.width / 2, canvas.height / 2);
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  }

  function confirm() {
    const imageBase64 = renderToPngBase64();
    if (!imageBase64) {
      setEmptyName(true);
      return;
    }
    onConfirm(imageBase64, name.trim(), fontId);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">Digite sua assinatura</h2>
      <label className="mt-3 block text-sm">
        <span className="text-xs font-medium text-muted-foreground">Nome completo</span>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setEmptyName(false);
          }}
          className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
      </label>
      {emptyName ? <p className="mt-1 text-xs text-destructive">Informe o nome completo para a assinatura digitada.</p> : null}

      <p className="mt-3 text-xs font-medium text-muted-foreground">Escolha um estilo</p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        {TYPED_SIGNATURE_FONTS.map((font) => (
          <button
            key={font.id}
            type="button"
            onClick={() => setFontId(font.id)}
            className={`rounded-md border px-3 py-2 text-left text-xl ${fontId === font.id ? "border-primary bg-primary/5" : "border-border"}`}
            style={{ fontFamily: font.fontFamily }}
          >
            {name.trim() || "Assinatura"}
          </button>
        ))}
      </div>

      <ConsentCheckbox text={consentText} checked={consented} onChange={setConsented} />

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onBack} className="h-11 flex-1 rounded-md border border-border text-sm font-medium">
          Voltar
        </button>
        <button
          type="button"
          disabled={!consented || submitting || !name.trim()}
          onClick={confirm}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Confirmar assinatura
        </button>
      </div>
    </section>
  );
}

function ConsentCheckbox({ text, checked, onChange }: { text: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="mt-4 flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1" required />
      <span>{text}</span>
    </label>
  );
}

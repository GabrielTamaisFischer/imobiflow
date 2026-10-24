import { useEffect, useRef, useState } from "react";
import { Camera, Check, RotateCcw, Upload, X } from "lucide-react";
import { InspectionEvidenceThumbnail } from "./InspectionEvidenceThumbnail";
import { InspectionEvidenceLightbox } from "./InspectionEvidenceLightbox";
import type { InspectionEvidenceRow, MysqlInspectionEvidence } from "@/product/inspections";

type Props = {
  rows: InspectionEvidenceRow[];
  loading: boolean;
  editable: boolean;
  isCaptionEditable: (entry: InspectionEvidenceRow) => boolean;
  busy: boolean;
  contextLabel: string;
  emptyLabel: string;
  onUpload: (files: File[]) => void;
  onMove: (entry: MysqlInspectionEvidence, direction: -1 | 1) => void;
  onRemove: (entry: MysqlInspectionEvidence) => void;
  onRetry: (entry: MysqlInspectionEvidence) => void;
  onCaptionSave: (entry: MysqlInspectionEvidence, caption: string) => void;
};

export function InspectionEvidenceGallery({ rows, loading, editable, isCaptionEditable, busy, contextLabel, emptyLabel, onUpload, onMove, onRemove, onRetry, onCaptionSave }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  function handleUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) onUpload(files);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {rows.length} {rows.length === 1 ? "foto" : "fotos"}
        </p>
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setCameraOpen(true)}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-primary bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              Tirar fotos
            </button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-sm">
              <Upload className="h-4 w-4" />
              Escolher fotos
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={handleUploadChange} disabled={busy} />
            </label>
          </div>
        ) : null}
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">Carregando evidências...</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map((entry, index) => (
            <InspectionEvidenceThumbnail
              key={entry.id}
              entry={entry}
              index={index}
              total={rows.length}
              editable={editable}
              busy={busy}
              onOpen={() => setLightboxIndex(index)}
              onMove={(direction) => onMove(entry, direction)}
              onRemove={() => onRemove(entry)}
              onRetry={() => onRetry(entry)}
              captionEditable={isCaptionEditable(entry)}
              onCaptionSave={(caption) => onCaptionSave(entry, caption)}
            />
          ))}
        </div>
      )}
      {lightboxIndex !== null ? (
        <InspectionEvidenceLightbox
          rows={rows}
          index={lightboxIndex}
          contextLabel={contextLabel}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
      {cameraOpen ? (
        <InspectionMultiCamera
          onClose={() => setCameraOpen(false)}
          onUse={(files) => {
            setCameraOpen(false);
            if (files.length) onUpload(files);
          }}
        />
      ) : null}
    </div>
  );
}

function InspectionMultiCamera({ onClose, onUse }: { onClose: () => void; onUse: (files: File[]) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shots, setShots] = useState<File[]>([]);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("CAMERA_UNAVAILABLE");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError("Não foi possível acessar a câmera. Verifique a permissão do navegador.");
      } finally {
        if (!cancelled) setStarting(false);
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  function close() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    onClose();
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    const maxSide = 1920;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return;
    const file = new File([blob], `vistoria-${Date.now()}-${shots.length + 1}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    setShots((current) => [...current, file]);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Câmera da vistoria" className="fixed inset-0 z-[70] flex flex-col bg-black">
      <div className="flex items-center justify-between p-3 text-white">
        <div>
          <p className="text-sm font-semibold">Câmera da vistoria</p>
          <p className="text-xs text-white/70">{shots.length} {shots.length === 1 ? "foto tirada" : "fotos tiradas"}</p>
        </div>
        <button type="button" onClick={close} className="rounded-full p-2 hover:bg-white/10" aria-label="Fechar câmera"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {starting ? <p className="text-sm text-white/80">Abrindo câmera...</p> : null}
        {error ? <p className="max-w-sm px-6 text-center text-sm text-white">{error}</p> : null}
        <video ref={videoRef} playsInline muted className={`h-full w-full object-contain ${starting || error ? "hidden" : ""}`} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 p-4 text-white">
        {shots.length > 0 ? (
          <button type="button" onClick={() => setShots((current) => current.slice(0, -1))} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/30 px-4 text-sm">
            <RotateCcw className="h-4 w-4" />Desfazer última
          </button>
        ) : null}
        <button
          type="button"
          disabled={Boolean(error) || starting}
          onClick={() => void capture()}
          className="inline-flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
          aria-label="Tirar foto"
        >
          <Camera className="h-7 w-7" />
        </button>
        <button
          type="button"
          disabled={shots.length === 0}
          onClick={() => onUse(shots)}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-40"
        >
          <Check className="h-4 w-4" />Usar {shots.length || ""} fotos
        </button>
      </div>
    </div>
  );
}

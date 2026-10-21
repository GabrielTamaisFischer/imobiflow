import { useCallback, useEffect, useRef, useState } from "react";
import { loadInspectionEvidenceBundle, type InspectionEvidenceRow } from "@/product/inspections";

/**
 * Fonte única das evidências de UMA vistoria. A página chama este hook uma
 * vez e repassa a lista aos painéis, que só filtram por ambiente/item.
 */
export function useInspectionEvidence(inspectionId: string, onError: (error: unknown) => void) {
  const [evidence, setEvidence] = useState<InspectionEvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setEvidence(await loadInspectionEvidenceBundle(inspectionId));
    } catch (error) {
      onErrorRef.current(error);
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void refresh();
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh]);

  // Prévias locais usam object URLs: libera as da lista anterior.
  useEffect(
    () => () => {
      for (const row of evidence)
        if (row.offline_pending && row.signed_url) URL.revokeObjectURL(row.signed_url);
    },
    [evidence],
  );

  return { evidence, loading, refresh };
}

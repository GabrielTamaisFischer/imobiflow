import { useEffect, useState } from "react";
import { getProperty, type Property } from "@/product/real-estate";
import { getSafeApiErrorMessage } from "@/product/app-access";

export type InspectionPropertyDetailState = {
  property: Property | null;
  loading: boolean;
  error: string | null;
};

/**
 * Carrega o Property completo a partir do id selecionado na busca (que só
 * traz um PropertySummary). O backend (GET /real-estate/properties/:id) já
 * resolve por companyId do usuário autenticado — nunca retorna imóvel de
 * outra empresa, então não há verificação extra de tenant aqui.
 *
 * Cache em módulo (fora do componente) por property_id: trocar de tela e
 * voltar para o mesmo imóvel, ou reabrir a mesma vistoria, não repete a
 * busca. Uma falha ao carregar NÃO troca silenciosamente para "nenhum
 * imóvel": o id selecionado continua sendo o id selecionado, e o erro
 * aparece ao lado para o usuário tentar de novo.
 */
const propertyCache = new Map<string, Property>();

export function useInspectionPropertyDetail(propertyId: string | null): InspectionPropertyDetailState {
  const cached = propertyId ? propertyCache.get(propertyId) ?? null : null;
  const [property, setProperty] = useState<Property | null>(cached);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setProperty(null);
      setError(null);
      setLoadingId(null);
      return;
    }

    const existing = propertyCache.get(propertyId);
    if (existing) {
      setProperty(existing);
      setError(null);
      setLoadingId(null);
      return;
    }

    let cancelled = false;
    setLoadingId(propertyId);
    setError(null);
    getProperty(propertyId)
      .then(({ property: loaded }) => {
        if (cancelled) return;
        propertyCache.set(propertyId, loaded);
        setProperty(loaded);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(getSafeApiErrorMessage(loadError, "Não foi possível carregar os dados do imóvel."));
      })
      .finally(() => {
        if (!cancelled) setLoadingId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  // Enquanto carrega um id diferente do que está exibido, não mostra dados
  // de outro imóvel: a tela mostra "Carregando..." em vez do card anterior.
  const showingStaleProperty = Boolean(loadingId) && property?.id !== loadingId;

  return {
    property: showingStaleProperty ? null : property,
    loading: Boolean(loadingId),
    error,
  };
}

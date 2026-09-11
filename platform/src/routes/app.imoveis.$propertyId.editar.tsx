import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage } from "@/product/app-access";
import { useSessionGuard } from "@/product/use-session-guard";
import { getProperty, listOwners, type Property, type PropertyOwner } from "@/product/real-estate";
import { listUsers, type AppUserSummary } from "@/product/auth";
import { getSiteSettings } from "@/product/sites";
import { PropertyWizard } from "./app.imoveis";

// full-page-imoveis (2026-09-11): rota dedicada para editar um imóvel
// existente (P1 do handoff — antes o PropertyWizard "edit" era montado
// como um diálogo sobreposto DENTRO do card do imóvel em /app/imoveis,
// nunca navegava para lugar nenhum). Reaproveita o MESMO PropertyWizard
// (mode="edit") — nenhum formulário paralelo. O imóvel é sempre buscado
// por id a partir do parâmetro da rota (getProperty(propertyId)), nunca de
// router/location state, então um F5 nesta URL funciona igual a chegar
// nela pela primeira vez, e o isolamento por empresa já garantido pelo
// backend em getProperty (erro genérico "Imóvel não encontrado." quando o
// imóvel não existe OU não pertence à empresa logada) é apenas exibido
// aqui, nunca enfraquecido.
export const Route = createFileRoute("/app/imoveis/$propertyId/editar")({
  component: EditPropertyPage,
});

function EditPropertyPage() {
  const { propertyId } = Route.useParams();
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("properties");
  const navigate = useNavigate();
  const canCreateOwner = canManage(session?.access.appUser, "owners.manage");

  const [property, setProperty] = useState<Property | null>(null);
  const [isPropertyLoading, setIsPropertyLoading] = useState(true);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [appUsers, setAppUsers] = useState<AppUserSummary[]>([]);
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Busca por id A CADA MONTAGEM (não só na primeira vez que o app carrega)
  // — inclui refresh/link direto na URL e troca de propertyId sem
  // desmontar o componente pai.
  useEffect(() => {
    if (isLoading || !session) return;
    let canceled = false;
    setIsPropertyLoading(true);
    setPropertyError(null);
    getProperty(propertyId)
      .then((response) => {
        if (!canceled) setProperty(response.property);
      })
      .catch((error) => {
        if (canceled) return;
        setProperty(null);
        setPropertyError(
          error instanceof Error ? error.message : "Não foi possível carregar o imóvel.",
        );
      })
      .finally(() => {
        if (!canceled) setIsPropertyLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [isLoading, session, propertyId]);

  useEffect(() => {
    if (isLoading || !session) return;
    let canceled = false;
    void listOwners()
      .then((response) => {
        if (!canceled) setOwners(response.owners);
      })
      .catch((ownersError) => {
        if (!canceled)
          setLoadError(
            getSafeApiErrorMessage(ownersError, "Não foi possível carregar proprietários."),
          );
      });
    return () => {
      canceled = true;
    };
  }, [isLoading, session]);

  useEffect(() => {
    if (isLoading || !session) return;
    let canceled = false;
    void listUsers()
      .then((response) => {
        if (!canceled) setAppUsers(response.users.filter((user) => user.status === "active"));
      })
      .catch(() => {
        if (!canceled) setAppUsers([]);
      });
    return () => {
      canceled = true;
    };
  }, [isLoading, session]);

  useEffect(() => {
    if (isLoading || !session) return;
    let canceled = false;
    void getSiteSettings()
      .then((response) => {
        if (!canceled) setSiteSlug(response.site?.slug ?? null);
      })
      .catch(() => {
        if (!canceled) setSiteSlug(null);
      });
    return () => {
      canceled = true;
    };
  }, [isLoading, session]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          to="/app/imoveis"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para imóveis
        </Link>
      </div>

      {isPropertyLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando imóvel...
        </section>
      ) : !property ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          <p className="font-medium">{propertyError ?? "Imóvel não encontrado."}</p>
          <p className="mt-1 text-destructive/80">
            O imóvel pode ter sido excluído ou não pertence à sua empresa.
          </p>
          <Link
            to="/app/imoveis"
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-destructive underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para imóveis
          </Link>
        </section>
      ) : (
        <>
          <div className="mb-4">
            <p className="text-sm font-semibold">
              Editar imóvel — {property.code ?? property.title}
            </p>
            <p className="text-sm text-muted-foreground">{property.title}</p>
          </div>
          {loadError ? (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {loadError}
            </div>
          ) : null}
          <PropertyWizard
            mode="edit"
            property={property}
            owners={owners}
            appUsers={appUsers}
            currentUserId={session?.access.appUser?.id}
            canCreateOwner={canCreateOwner}
            siteSlug={siteSlug}
            onCancel={() => void navigate({ to: "/app/imoveis" })}
            onUpdated={(updatedProperty) => {
              void navigate({
                to: "/app/imoveis",
                search: {
                  focusPropertyId: updatedProperty.id,
                  notice: "Imóvel atualizado com sucesso.",
                },
              });
            }}
            onPublicationChanged={(updatedProperty) => {
              // Publicar/despublicar (step "11. Liberações") é uma ação
              // dedicada e imediata, independente do submit do formulário —
              // mesma semântica que já existia quando o wizard era montado
              // dentro do card (ver handlePublishToggle). Só reflete o novo
              // estado localmente; não navega nem exige salvar de novo.
              setProperty(updatedProperty);
            }}
          />
        </>
      )}
    </ModulePage>
  );
}

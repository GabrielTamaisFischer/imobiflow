import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage } from "@/product/app-access";
import { useSessionGuard } from "@/product/use-session-guard";
import { listOwners, type PropertyOwner } from "@/product/real-estate";
import { listUsers, type AppUserSummary } from "@/product/auth";
import { getSiteSettings } from "@/product/sites";
import { PropertyWizard } from "./app.imoveis";

// full-page-imoveis (2026-09-11): rota dedicada para o cadastro completo de
// imóvel (P1 do handoff — antes o PropertyWizard "create" era montado
// inline dentro da própria listagem de /app/imoveis, atrás de um botão
// "Novo imóvel" que só alternava um state local `showForm`; a lista nunca
// saía da tela, só empurrava o formulário gigante para o meio dela). Esta
// rota reaproveita o MESMO PropertyWizard (mode="create") — nenhum
// formulário paralelo foi criado — só muda ONDE ele é montado: página
// cheia, sem a listagem por perto, com navegação real de volta para
// /app/imoveis ao cancelar/salvar.
export const Route = createFileRoute("/app/imoveis/novo")({ component: NewPropertyPage });

function NewPropertyPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("properties");
  const navigate = useNavigate();
  const canCreateOwner = canManage(session?.access.appUser, "owners.manage");

  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [appUsers, setAppUsers] = useState<AppUserSummary[]>([]);
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      <div className="mb-4">
        <p className="text-sm font-semibold">Cadastrar imóvel</p>
        <p className="text-sm text-muted-foreground">
          Cadastre proprietário, localização, captação, dados técnicos, valores, mídia e liberações
          de publicação.
        </p>
      </div>
      {loadError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}
      <PropertyWizard
        mode="create"
        owners={owners}
        appUsers={appUsers}
        currentUserId={session?.access.appUser?.id}
        canCreateOwner={canCreateOwner}
        siteSlug={siteSlug}
        onCancel={() => void navigate({ to: "/app/imoveis" })}
        onCreated={(property, _owner, notice) => {
          void navigate({
            to: "/app/imoveis",
            search: {
              focusPropertyId: property.id,
              notice: notice ?? "Imóvel cadastrado com sucesso.",
            },
          });
        }}
      />
    </ModulePage>
  );
}

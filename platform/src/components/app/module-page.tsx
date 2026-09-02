import type { AccessResponse } from "@/product/auth";
import type { AppModule } from "@/product/app-modules";
import { canViewModule } from "@/product/app-access";
import { AppShell } from "./app-shell";
import { EmptyState } from "./empty-state";

type ModulePageProps = {
  session: AccessResponse | null;
  module: AppModule;
  children?: React.ReactNode;
  fullBleed?: boolean;
  hideHeader?: boolean;
};

export function ModulePage({ session, module, children, fullBleed, hideHeader }: ModulePageProps) {
  const canAccessModule = canViewModule(session?.access.appUser, module);

  return (
    <AppShell session={session} activeModule={module.key} fullBleed={fullBleed}>
      {hideHeader ? null : (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{module.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
        </div>
      )}

      {!canAccessModule ? (
        <EmptyState
          icon={module.icon}
          title="Acesso não permitido"
          description="Você não tem permissão para acessar este módulo."
        />
      ) : children ?? (
        <EmptyState
          icon={module.icon}
          title={module.emptyTitle}
          description={module.emptyDescription}
          actionLabel={module.actionLabel}
        />
      )}
    </AppShell>
  );
}

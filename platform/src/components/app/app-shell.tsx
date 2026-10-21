import { Link } from "@tanstack/react-router";
import { ChevronDown, Folder, LogOut } from "lucide-react";
import { useState } from "react";
import type { AccessResponse } from "@/product/auth";
import { logout } from "@/product/auth";
import { confirmLogoutWithOfflineData } from "@/product/logout-offline-guard";
import { appModules } from "@/product/app-modules";
import { getVisibleModules } from "@/product/app-access";

type AppShellProps = {
  session: AccessResponse | null;
  activeModule: string;
  children: React.ReactNode;
  fullBleed?: boolean;
};

const registrationKeys = new Set(["owners", "buyers", "tenants", "brokers"]);

export function AppShell({ session, activeModule, children, fullBleed }: AppShellProps) {
  const companyName = session?.access.company?.name ?? "ImobiFlow";
  const userName = session?.access.appUser?.name ?? "Usuário";
  const subscription = session?.access.subscription;
  const isPreview = subscription?.plan_slug === "preview";
  const visibleModules = getVisibleModules(session?.access.appUser, appModules);
  const registrationModules = visibleModules.filter((module) => registrationKeys.has(module.key));
  const standaloneModules = visibleModules.filter((module) => !registrationKeys.has(module.key));
  const registrationsActive = registrationKeys.has(activeModule);
  const [registrationsOpen, setRegistrationsOpen] = useState(registrationsActive);

  const registrationsMenu = registrationModules.length ? (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setRegistrationsOpen((current) => !current)}
        aria-expanded={registrationsOpen}
        className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
          registrationsActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        <Folder className="h-4 w-4" />
        <span className="flex-1 text-left">Cadastros</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${registrationsOpen ? "rotate-180" : ""}`} />
      </button>

      {registrationsOpen ? (
        <div className="ml-4 space-y-1 border-l border-border pl-2">
          {registrationModules.map((module) => {
            const Icon = module.icon;
            const isActive = activeModule === module.key;

            return (
              <Link
                key={module.key}
                to={module.path as never}
                className={`flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {module.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-border bg-card lg:block">
          <div className="flex h-16 items-center border-b border-border px-5">
            <Link to="/" className="font-bold tracking-tight">
              Imobi<span className="text-primary">Flow</span>
            </Link>
          </div>

          <nav className="space-y-1 p-3">
            {standaloneModules.map((module) => {
              const Icon = module.icon;
              const isActive = activeModule === module.key;

              return (
                <div key={module.key}>
                  <Link
                    to={module.path as never}
                    className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {module.label}
                  </Link>
                  {module.key === "properties" ? registrationsMenu : null}
                </div>
              );
            })}
            {!standaloneModules.some((module) => module.key === "properties") ? registrationsMenu : null}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
            <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{companyName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {isPreview
                    ? "Modo visualização · dados vazios"
                    : subscription?.status?.toUpperCase() === "ACTIVE"
                      ? `Plano ${subscription.plan_slug ?? "ativo"}`
                      : "Assinatura em validação"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-muted-foreground">
                    {session?.access.appUser?.role ?? "membro"}
                  </p>
                </div>
                <Link
                  to="/entrar"
                  aria-label="Sair"
                  title="Sair"
                  onClick={async (event) => {
                    event.preventDefault();
                    // Antes do logout (o escopo offline vem do token): avisa e
                    // permite cancelar se houver vistoria não sincronizada.
                    if (!(await confirmLogoutWithOfflineData())) return;
                    await logout().catch(() => undefined);
                    window.location.assign("/entrar");
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </header>

          <div className="border-b border-border bg-card lg:hidden">
            <nav className="flex gap-2 overflow-x-auto px-4 py-3">
              {visibleModules.map((module) => {
                const Icon = module.icon;
                const isActive = activeModule === module.key;

                return (
                  <Link
                    key={module.key}
                    to={module.path as never}
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {module.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className={fullBleed ? "w-full" : "mx-auto max-w-7xl px-4 py-6 lg:px-6"}>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

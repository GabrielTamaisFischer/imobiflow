import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { AccessResponse } from "@/product/auth";
import { clearToken } from "@/product/auth";
import { appModules } from "@/product/app-modules";

type AppShellProps = {
  session: AccessResponse | null;
  activeModule: string;
  children: React.ReactNode;
  fullBleed?: boolean;
};

export function AppShell({ session, activeModule, children, fullBleed }: AppShellProps) {
  const companyName = session?.access.company?.name ?? "ImobiFlow";
  const userName = session?.access.appUser?.name ?? "Usuário";
  const subscription = session?.access.subscription;
  const isPreview = subscription?.plan_slug === "preview";

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
            {appModules.map((module) => {
              const Icon = module.icon;
              const isActive = activeModule === module.key;

              return (
                <Link
                  key={module.key}
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
              );
            })}
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
                    : subscription?.status === "active"
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
                  onClick={() => clearToken()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </header>

          <div className="border-b border-border bg-card lg:hidden">
            <nav className="flex gap-2 overflow-x-auto px-4 py-3">
              {appModules.map((module) => {
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

          <div className={fullBleed ? "w-full" : "mx-auto max-w-7xl px-4 py-6 lg:px-6"}>{children}</div>
        </section>
      </div>
    </main>
  );
}

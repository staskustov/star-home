import { ResponsiveContainer } from "@/components/shell/ResponsiveContainer";
import { TopBarActions } from "@/components/shell/TopBarActions";

export function AppShell({
  variant,
  sidebar,
  bottomNav,
  children,
}: {
  variant: "auth" | "resident" | "admin";
  sidebar?: React.ReactNode;
  bottomNav?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (variant === "auth") {
    return (
      <main className="auth-stage flex min-h-dvh items-center justify-center px-5 py-16">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/house-dusk.jpg" alt="" className="auth-photo" />
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </main>
    );
  }

  if (variant === "resident") {
    return (
      <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="hidden lg:block">{sidebar}</div>
        <div className="min-w-0">
          <header className="sticky top-0 z-20 hidden items-center justify-end border-b border-line/60 bg-bg/40 px-8 py-3 backdrop-blur-xl lg:flex">
            <TopBarActions />
          </header>
          <div className="mx-auto w-full max-w-[680px] px-5 pt-8 pb-32 lg:px-10 lg:pt-8 lg:pb-16">{children}</div>
        </div>
        <div className="lg:hidden">{bottomNav}</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[76px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)]">
      <div className="hidden md:block">{sidebar}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

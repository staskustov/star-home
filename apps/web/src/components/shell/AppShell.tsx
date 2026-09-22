import { ResponsiveContainer } from "@/components/shell/ResponsiveContainer";

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
      <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-16">
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </main>
    );
  }

  if (variant === "resident") {
    return (
      <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden lg:block">{sidebar}</div>
        <div className="min-w-0">
          <div className="mx-auto w-full max-w-[680px] px-5 pt-8 pb-28 lg:px-8 lg:pt-12 lg:pb-16">{children}</div>
        </div>
        <div className="lg:hidden">{bottomNav}</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg md:grid md:grid-cols-[76px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)]">
      <div className="hidden md:block">{sidebar}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

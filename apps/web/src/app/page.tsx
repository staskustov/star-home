import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { AppShell } from "@/components/shell/AppShell";
import { rpc } from "@/server/rpc";
import { readSession } from "@/server/session";

export default async function LoginPage() {
  const session = await readSession();
  if (session) {
    const destination = await rpc<{ redirectTo?: string }>("destination");
    redirect(destination.body.redirectTo ?? "/home");
  }

  return (
    <AppShell variant="auth">
      <LoginForm />
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { AppShell } from "@/components/shell/AppShell";
import { destinationFor } from "@/server/routing";
import { readSession } from "@/server/session";

export default async function LoginPage() {
  const session = await readSession();
  if (session) redirect(destinationFor(session.userId, session.membershipId));

  return (
    <AppShell variant="auth">
      <LoginForm />
    </AppShell>
  );
}

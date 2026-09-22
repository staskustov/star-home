import { LoginForm } from "@/components/auth/LoginForm";
import { AppShell } from "@/components/shell/AppShell";

export default function LoginPage() {
  return (
    <AppShell variant="auth">
      <LoginForm />
    </AppShell>
  );
}

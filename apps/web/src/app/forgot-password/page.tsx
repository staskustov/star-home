import { PasswordResetForm } from "@/components/auth/PasswordResetForm";
import { AppShell } from "@/components/shell/AppShell";

export default function ForgotPasswordPage() {
  return (
    <AppShell variant="auth">
      <PasswordResetForm />
    </AppShell>
  );
}

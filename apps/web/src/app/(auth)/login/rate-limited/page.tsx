import { LoginCooldown } from "@/components/auth/login-cooldown";

export default function RateLimitedLoginPage() {
  return (
    <main className="section-dark grid-texture-dark flex min-h-screen items-center justify-center px-6 py-8">
      <LoginCooldown />
    </main>
  );
}

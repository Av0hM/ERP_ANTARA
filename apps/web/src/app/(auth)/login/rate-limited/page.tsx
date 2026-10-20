import { LoginCooldown } from "@/components/auth/login-cooldown";

export default async function RateLimitedLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ retryAt?: string }>;
}) {
  const value = Number((await searchParams).retryAt);
  const retryAt = Number.isSafeInteger(value) && value > 0 ? value : undefined;
  return (
    <main className="section-dark grid-texture-dark flex min-h-screen items-center justify-center px-6 py-8">
      <LoginCooldown retryAt={retryAt} />
    </main>
  );
}

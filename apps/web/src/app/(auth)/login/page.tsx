import { safeLoginDestination } from "@/lib/auth-ux";
import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
    reason?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const googleAuthEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return (
    <main className="flex min-h-screen items-center justify-center section-dark grid-texture-dark px-6 py-8">
      <div className="w-full max-w-lg">
        {params?.reason === "session-expired" && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-steel/30 p-4"
          >
            <h2>Your session has expired.</h2>
            <p>
              Sign in again to continue. Check saved records before repeating
              your last change.
            </p>
          </div>
        )}
        <LoginForm
          callbackUrl={safeLoginDestination(params?.callbackUrl)}
          googleAuthEnabled={googleAuthEnabled}
        />
      </div>
    </main>
  );
}

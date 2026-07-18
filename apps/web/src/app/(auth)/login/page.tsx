import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const googleAuthEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <main className="flex min-h-screen items-center justify-center bg-orbital-grid px-6 py-8">
      <LoginForm callbackUrl={params?.callbackUrl} googleAuthEnabled={googleAuthEnabled} />
    </main>
  );
}

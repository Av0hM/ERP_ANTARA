import Link from "next/link";
import { authFailureMessage } from "@/lib/auth-ux";
export default async function AuthFailurePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="section-dark grid-texture-dark flex min-h-screen items-center justify-center px-6 py-8">
      <section className="glass-modal w-full max-w-lg rounded-[2rem] p-8">
        <p className="text-sm text-saffron">ANTARA ERP</p>
        <h1 className="mt-3 text-2xl font-semibold">
          Sign-in could not be completed
        </h1>
        <p className="mt-4 text-muted">
          {authFailureMessage(params.error, params.reason)}
        </p>
        <Link
          className="mt-6 inline-block rounded-lg border border-steel/40 px-4 py-3"
          href="/login"
        >
          Back to login
        </Link>
      </section>
    </main>
  );
}

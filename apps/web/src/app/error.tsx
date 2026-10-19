"use client";
import Link from "next/link";
export default function PageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="section-dark min-h-screen p-8">
      <p>ANTARA ERP</p>
      <h1 className="mt-4 text-2xl font-semibold">
        This page could not be displayed
      </h1>
      <p className="my-4">
        Check saved records before repeating a change. You can retry loading
        this page or return to your dashboard.
      </p>
      <button className="mr-4 rounded-lg border p-3" onClick={reset}>
        Retry page
      </button>
      <Link className="underline" href="/dashboard">
        Return to dashboard
      </Link>
    </main>
  );
}

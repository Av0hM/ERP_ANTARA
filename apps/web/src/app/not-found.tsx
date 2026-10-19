import Link from "next/link";
export default function NotFound() {
  return (
    <main className="section-dark min-h-screen p-8">
      <p>ANTARA ERP</p>
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <p className="my-4">
        This address is unavailable. Return to your workspace to find the item
        you need.
      </p>
      <Link className="underline" href="/dashboard">
        Return to dashboard
      </Link>
    </main>
  );
}

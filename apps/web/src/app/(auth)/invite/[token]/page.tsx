import { InviteAcceptForm } from "@/components/auth/invite-accept-form";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  return (
    <main className="flex min-h-screen items-center justify-center bg-orbital-grid px-6 py-8">
      <InviteAcceptForm token={token} />
    </main>
  );
}
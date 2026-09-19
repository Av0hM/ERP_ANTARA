import { SubsystemHealthClient } from "./SubsystemHealthClient";

export const dynamic = "force-dynamic";

interface SubsystemHealthPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SubsystemHealthPage({ params }: SubsystemHealthPageProps) {
  const { slug } = await params;

  return <SubsystemHealthClient slug={slug} />;
}
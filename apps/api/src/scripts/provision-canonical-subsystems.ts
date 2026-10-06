import { PrismaClient } from "@prisma/client";
import { canonicalSubsystems } from "@antara/contracts";

/** Safe on fresh/already-canonical databases; never adopts or merges legacy rows. */
export async function provisionCanonicalSubsystems(prisma: PrismaClient) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(164937102)::text`;
    const existing = await tx.subsystem.findMany();
    const unexpected = existing.filter(
      (row) =>
        !canonicalSubsystems.some(
          (canonical) =>
            canonical.key === row.key &&
            canonical.slug === row.slug &&
            canonical.name === row.name,
        ),
    );
    if (unexpected.length) {
      throw new Error(
        "Legacy or conflicting subsystems require OWNER-reviewed mapping. Run preflight:v1; no rows were changed.",
      );
    }
    for (const canonical of canonicalSubsystems) {
      await tx.subsystem.upsert({
        where: { key: canonical.key },
        create: canonical,
        update: {},
      });
    }
    return tx.subsystem.findMany({ orderBy: { key: "asc" } });
  });
}

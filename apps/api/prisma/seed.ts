import { PrismaClient } from "@prisma/client";
import { AppRole } from "@antara/contracts";

const prisma = new PrismaClient();

async function main() {
  const subsystems = [
    { name: "Software", slug: "software", color: "#7ef2c6", description: "Flight software, tools, telemetry, and mission control logic." },
    { name: "Avionics", slug: "avionics", color: "#6aa4ff", description: "Embedded systems, buses, EPS coordination, and board integration." },
    { name: "Structures", slug: "structures", color: "#f3d17a", description: "Mechanical design, CAD, mounting, and fabrication planning." },
    { name: "Payload", slug: "payload", color: "#ffa0a0", description: "Mission payload design, experiments, and validation workflows." },
    { name: "Communications", slug: "communications", color: "#c2a2ff", description: "RF links, modulation pipelines, and protocol coordination." },
    { name: "Thermal", slug: "thermal", color: "#ffb86b", description: "Thermal analysis, materials, and environmental review artifacts." },
    { name: "Ground Station", slug: "ground-station", color: "#8cc8ff", description: "Ground ops, mission rehearsals, and uplink/downlink systems." },
  ];

  for (const subsystem of subsystems) {
    await prisma.subsystem.upsert({
      where: { slug: subsystem.slug },
      create: subsystem,
      update: subsystem,
    });
  }

  const software = await prisma.subsystem.findUniqueOrThrow({ where: { slug: "software" } });

  const adminEmail = process.env.GOOGLE_ALLOWED_EMAILS?.split(",")[0]?.trim() ?? "admin@antara.club";

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: "Mission Director",
      role: AppRole.OWNER,
      subsystemId: software.id,
    },
    update: {
      role: AppRole.OWNER,
      subsystemId: software.id,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });


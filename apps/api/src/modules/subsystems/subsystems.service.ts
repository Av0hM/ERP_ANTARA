import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class SubsystemsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const subsystems = (await this.prisma.subsystem.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            users: true,
            tasks: true,
            events: true,
            insights: true,
          },
        },
      },
    })) as Array<{
      id: string;
      name: string;
      slug: string;
      description: string;
      color: string;
      _count: { users: number; tasks: number; events: number; insights: number };
    }>;

    return subsystems.map((subsystem) => ({
      id: subsystem.id,
      name: subsystem.name,
      slug: subsystem.slug,
      description: subsystem.description,
      color: subsystem.color,
      taskCount: subsystem._count.tasks,
      memberCount: subsystem._count.users,
      eventCount: subsystem._count.events,
      insightCount: subsystem._count.insights,
    }));
  }
}


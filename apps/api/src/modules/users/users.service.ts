import { Injectable } from "@nestjs/common";
import { AppRole } from "@antara/contracts";

import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { subsystem: true },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { subsystem: true },
    });
  }

  create(data: {
    email: string;
    name: string;
    passwordHash?: string;
    role?: AppRole;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: data.passwordHash,
        role: data.role,
      },
    });
  }

  listMembers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        subsystem: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }
}


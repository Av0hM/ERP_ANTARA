import { Injectable } from "@nestjs/common";
import { AppRole } from "@antara/contracts";

import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

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

  async updateRole(userId: string, newRole: AppRole, actorId: string) {
    const oldUser = await this.prisma.user.findUnique({ where: { id: userId } });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    await this.auditService.log({
      action: "ROLE_CHANGE",
      entityType: "User",
      entityId: userId,
      actorId,
      payload: { oldRole: oldUser?.role, newRole },
    });

    return user;
  }

  async updateProfile(userId: string, data: { skills?: string[]; weeklyCapacityHours?: number }, actorId: string) {
    const oldUser = await this.prisma.user.findUnique({ where: { id: userId } });

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        skills: data.skills,
        weeklyCapacityHours: data.weeklyCapacityHours,
      },
    });

    await this.auditService.log({
      action: "PROFILE_UPDATE",
      entityType: "User",
      entityId: userId,
      actorId,
      payload: {
        oldSkills: oldUser?.skills,
        newSkills: data.skills,
        oldWeeklyCapacityHours: oldUser?.weeklyCapacityHours,
        newWeeklyCapacityHours: data.weeklyCapacityHours,
      },
    });

    return user;
  }

  listMembers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        skills: true,
        weeklyCapacityHours: true,
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


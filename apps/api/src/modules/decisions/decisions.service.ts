import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateDecisionDto, UpdateDecisionDto, DecisionQueryDto } from "./dto/decision.dto";

@Injectable()
export class DecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateDecisionDto, actorId: string) {
    const decision = await this.prisma.decisionRecord.create({
      data: {
        title: dto.title,
        context: dto.context,
        decision: dto.decision,
        rationale: dto.rationale,
        alternatives: dto.alternatives ?? [],
        consequences: dto.consequences,
        authorId: actorId,
        subsystemId: dto.subsystemId,
        relatedTaskIds: dto.relatedTaskIds ?? [],
        status: "PROPOSED",
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        subsystem: { select: { id: true, name: true, slug: true, color: true } },
        supersededBy: { select: { id: true, title: true, status: true } },
        supersedes: { select: { id: true, title: true, status: true } },
      },
    });

    await this.auditService.log({
      action: "DECISION_CREATE",
      entityType: "DecisionRecord",
      entityId: decision.id,
      actorId,
      payload: { title: decision.title, status: decision.status },
    });

    return decision;
  }

  async findAll(query: DecisionQueryDto) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.subsystemId) where.subsystemId = query.subsystemId;
    if (query.authorId) where.authorId = query.authorId;

    const [decisions, total] = await Promise.all([
      this.prisma.decisionRecord.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, email: true } },
          subsystem: { select: { id: true, name: true, slug: true, color: true } },
          supersededBy: { select: { id: true, title: true, status: true } },
          supersedes: { select: { id: true, title: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.decisionRecord.count({ where }),
    ]);

    return { decisions, total };
  }

  async findOne(id: string) {
    const decision = await this.prisma.decisionRecord.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        subsystem: { select: { id: true, name: true, slug: true, color: true } },
        supersededBy: { select: { id: true, title: true, status: true } },
        supersedes: { select: { id: true, title: true, status: true } },
      },
    });

    if (!decision) {
      throw new NotFoundException(`Decision ${id} not found`);
    }

    return decision;
  }

  async update(id: string, dto: UpdateDecisionDto, actorId: string) {
    const existing = await this.prisma.decisionRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Decision ${id} not found`);
    }

    const updateData: any = { ...dto };

    if (dto.status === "ACCEPTED" && existing.status !== "ACCEPTED") {
      updateData.decidedAt = new Date();
    }

    if (dto.supersededById) {
      const superseding = await this.prisma.decisionRecord.findUnique({
        where: { id: dto.supersededById },
      });
      if (!superseding) {
        throw new NotFoundException(`Superseding decision ${dto.supersededById} not found`);
      }
      if (superseding.status !== "ACCEPTED") {
        throw new Error("Can only supersede with an ACCEPTED decision");
      }
    }

    const decision = await this.prisma.decisionRecord.update({
      where: { id },
      data: updateData,
      include: {
        author: { select: { id: true, name: true, email: true } },
        subsystem: { select: { id: true, name: true, slug: true, color: true } },
        supersededBy: { select: { id: true, title: true, status: true } },
        supersedes: { select: { id: true, title: true, status: true } },
      },
    });

    await this.auditService.log({
      action: "DECISION_UPDATE",
      entityType: "DecisionRecord",
      entityId: decision.id,
      actorId,
      payload: { title: decision.title, oldStatus: existing.status, newStatus: decision.status },
    });

    return decision;
  }

  async delete(id: string, actorId: string) {
    const existing = await this.prisma.decisionRecord.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Decision ${id} not found`);
    }

    await this.prisma.decisionRecord.delete({ where: { id } });

    await this.auditService.log({
      action: "DECISION_DELETE",
      entityType: "DecisionRecord",
      entityId: id,
      actorId,
      payload: { title: existing.title },
    });

    return { deleted: true };
  }
}
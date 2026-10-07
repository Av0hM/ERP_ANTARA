import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { safeUserSelect } from "../../common/prisma/safe-user.select";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import {
  canManageDecision,
  canReadDecision,
} from "../../common/authorization/authorization.policy";
import { ActorContext } from "../../common/authorization/authorization.types";
import { AuditService } from "../audit/audit.service";
import {
  CreateDecisionDto,
  UpdateDecisionDto,
  DecisionQueryDto,
} from "./dto/decision.dto";

const include = {
  author: { select: safeUserSelect },
  subsystem: { select: { id: true, name: true, slug: true, color: true } },
} satisfies Prisma.DecisionRecordInclude;
type Record = Prisma.DecisionRecordGetPayload<{ include: typeof include }>;

@Injectable()
export class DecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly core: CoreAuthorizationService,
  ) {}

  private async response(
    record: Record,
    actor: ActorContext,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const links = await tx.decisionRecord.findMany({
      where: {
        AND: [
          this.core.decisionWhere(actor),
          {
            OR: [
              { id: record.supersededById ?? "" },
              { supersededById: record.id },
            ],
          },
        ],
      },
      select: { id: true, title: true, status: true, supersededById: true },
    });
    const superseding = links.find((link) => link.id === record.supersededById);
    const summary = (link: (typeof links)[number]) => ({
      id: link.id,
      title: link.title,
      status: link.status,
    });
    return {
      ...record,
      relatedTaskIds: await this.core.visibleTaskIds(
        actor,
        record.relatedTaskIds,
        tx,
      ),
      supersededById: superseding?.id ?? null,
      supersededBy: superseding ? summary(superseding) : null,
      supersedes: links
        .filter((link) => link.supersededById === record.id)
        .map(summary),
    };
  }

  create(dto: CreateDecisionDto, actorId: string) {
    return this.core.withActor(actorId, async (tx, actor) => {
      const scope = dto.scope ?? (dto.subsystemId ? "SUBSYSTEM" : "GLOBAL");
      const authority =
        dto.authority ?? (actor.role === "OWNER" ? "OWNER" : "SUBSYSTEM_ADMIN");
      const placement = {
        scope,
        authority,
        subsystemId: dto.subsystemId ?? null,
      };
      if (!canManageDecision(actor, placement))
        throw new ForbiddenException("Decision creation denied");
      const relatedTaskIds = [...new Set(dto.relatedTaskIds ?? [])];
      if (
        (await this.core.visibleTaskIds(actor, relatedTaskIds, tx)).length !==
        relatedTaskIds.length
      )
        throw new ForbiddenException("Related task access denied");
      const decision = await tx.decisionRecord.create({
        data: {
          title: dto.title,
          context: dto.context,
          decision: dto.decision,
          rationale: dto.rationale,
          alternatives: dto.alternatives ?? [],
          consequences: dto.consequences,
          authorId: actorId,
          ...placement,
          relatedTaskIds,
          status: "PROPOSED",
        },
        include,
      });
      await tx.auditLog.create({
        data: {
          action: "DECISION_CREATE",
          entityType: "DecisionRecord",
          entityId: decision.id,
          actorId,
        },
      });
      return this.response(decision, actor, tx);
    });
  }

  async findAll(query: DecisionQueryDto, actorId: string) {
    const actor = await this.core.actor(actorId);
    const where: Prisma.DecisionRecordWhereInput = {
      AND: [
        this.core.decisionWhere(actor),
        {
          status: query.status,
          subsystemId: query.subsystemId,
          authorId: query.authorId,
        },
      ],
    };
    const [decisions, total] = await Promise.all([
      this.prisma.decisionRecord.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.decisionRecord.count({ where }),
    ]);
    return {
      decisions: await Promise.all(
        decisions.map((record) => this.response(record, actor)),
      ),
      total,
    };
  }

  async findOne(id: string, actorId: string) {
    const actor = await this.core.actor(actorId);
    const decision = await this.prisma.decisionRecord.findUnique({
      where: { id },
      include,
    });
    if (!decision) throw new NotFoundException("Decision not found");
    if (!canReadDecision(actor, decision))
      throw new ForbiddenException("Decision access denied");
    return this.response(decision, actor);
  }

  update(id: string, dto: UpdateDecisionDto, actorId: string) {
    return this.core.withActor(actorId, async (tx, actor) => {
      await this.core.lockDecisions(tx, [
        id,
        ...(dto.supersededById ? [dto.supersededById] : []),
      ]);
      const existing = await tx.decisionRecord.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("Decision not found");
      if (!canManageDecision(actor, existing))
        throw new ForbiddenException("Decision management denied");
      if (dto.supersededById) {
        const target = await tx.decisionRecord.findUnique({
          where: { id: dto.supersededById },
        });
        if (!target || !canManageDecision(actor, target))
          throw new ForbiddenException("Superseding decision access denied");
        if (target.id === id || target.status !== "ACCEPTED")
          throw new BadRequestException("Choose a different ACCEPTED decision");
      }
      const decision = await tx.decisionRecord.update({
        where: { id },
        data: {
          title: dto.title,
          context: dto.context,
          decision: dto.decision,
          rationale: dto.rationale,
          alternatives: dto.alternatives,
          consequences: dto.consequences,
          status: dto.status,
          supersededById: dto.supersededById,
          ...(dto.status === "ACCEPTED" && existing.status !== "ACCEPTED"
            ? { decidedAt: new Date() }
            : {}),
        },
        include,
      });
      await tx.auditLog.create({
        data: {
          action: "DECISION_UPDATE",
          entityType: "DecisionRecord",
          entityId: id,
          actorId,
        },
      });
      return this.response(decision, actor, tx);
    });
  }

  delete(id: string, actorId: string) {
    return this.core.withActor(actorId, async (tx, actor) => {
      await this.core.lockDecisions(tx, [id]);
      const decision = await tx.decisionRecord.findUnique({ where: { id } });
      if (!decision) throw new NotFoundException("Decision not found");
      if (!canManageDecision(actor, decision))
        throw new ForbiddenException("Decision management denied");
      // SET NULL on supersession must not mutate another authority's record.
      await tx.$queryRaw`SELECT id FROM "DecisionRecord" WHERE "supersededById" = ${id} ORDER BY id FOR UPDATE`;
      const referring = await tx.decisionRecord.findMany({
        where: { supersededById: id },
      });
      if (referring.some((record) => !canManageDecision(actor, record)))
        throw new ForbiddenException("Referenced decision management denied");
      await tx.decisionRecord.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          action: "DECISION_DELETE",
          entityType: "DecisionRecord",
          entityId: id,
          actorId,
        },
      });
      return { deleted: true };
    });
  }
}

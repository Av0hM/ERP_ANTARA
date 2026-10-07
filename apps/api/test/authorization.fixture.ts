import { Test } from "@nestjs/testing";
import { CoreAuthorizationService } from "../src/common/authorization/core-authorization.service";
import { AuthorizationService } from "../src/common/authorization/authorization.service";
import { PrismaService } from "../src/common/prisma/prisma.service";

/** Real policy and actor loader over a small explicitly local unit-test database double. */
export async function fixtureCore(delegates: object = {}) {
  const db = {
    user: {
      findUnique: jest.fn(async () => ({
        id: "owner",
        role: "OWNER",
        isActive: true,
        deletedAt: null,
        memberships: [],
      })),
    },
    task: {
      findUnique: jest.fn(async () => ({
        id: "task-1",
        subsystemId: "adcs",
        deletedAt: null,
        isArchived: false,
      })),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    auditLog: { create: jest.fn() },
    ...delegates,
  };
  db.$transaction.mockImplementation(
    (callback: (tx: object) => Promise<unknown>) => callback(db),
  );
  const module = await Test.createTestingModule({
    providers: [
      AuthorizationService,
      CoreAuthorizationService,
      { provide: PrismaService, useValue: db },
    ],
  }).compile();
  return {
    core: module.get(CoreAuthorizationService),
    prisma: module.get(PrismaService),
    db,
  };
}

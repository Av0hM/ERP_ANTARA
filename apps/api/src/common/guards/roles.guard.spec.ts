import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { RolesGuard } from "./roles.guard";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { AppRole } from "../types/app-role.type";

describe("RolesGuard", () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  const createMockContext = (user?: { role?: AppRole }) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  }) as unknown as ExecutionContext;

  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(reflector);
  });

  it("allows access when no roles are required", () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const context = createMockContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it("allows access when user has required role", () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["OWNER", "ADMIN"]);
    const context = createMockContext({ role: "ADMIN" });

    const result = guard.canActivate(context);

    expect(result).toBe(true);
  });

  it("denies access when user lacks required role", () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["OWNER", "ADMIN"]);
    const context = createMockContext({ role: "MEMBER" });

    const result = guard.canActivate(context);

    expect(result).toBe(false);
  });

  it("denies access when user has no role", () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["OWNER", "ADMIN"]);
    const context = createMockContext({ role: undefined });

    const result = guard.canActivate(context);

    expect(result).toBe(false);
  });

  it("denies access when user is undefined", () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["OWNER", "ADMIN"]);
    const context = createMockContext(undefined);

    const result = guard.canActivate(context);

    expect(result).toBe(false);
  });

  it("checks both handler and class metadata", () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(["OWNER"]);
    const context = createMockContext({ role: "OWNER" });

    guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
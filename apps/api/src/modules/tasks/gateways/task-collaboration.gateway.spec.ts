import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { SessionService } from "../../../common/sessions/session.service";
import { CoreAuthorizationService } from "../../../common/authorization/core-authorization.service";
import { buildActorContext } from "../../../common/authorization/authorization.policy";
import {
  AuthenticatedSocket,
  TaskCollaborationGateway,
} from "./task-collaboration.gateway";

describe("Scoped task collaboration", () => {
  const jwt = { verifyAsync: jest.fn() };
  const sessions = { authenticateAccess: jest.fn() };
  const core = {
    actor: jest.fn(),
    task: jest.fn(),
    canReceiveTaskEvent: jest.fn(),
  };
  let gateway: TaskCollaborationGateway;
  function client(id: string, token = id) {
    return {
      id,
      handshake: { auth: { token } },
      emit: jest.fn(),
      disconnect: jest.fn(),
    } satisfies AuthenticatedSocket;
  }
  beforeEach(async () => {
    jest.resetAllMocks();
    jwt.verifyAsync.mockImplementation(async (token: string) => ({
      id: token,
    }));
    sessions.authenticateAccess.mockImplementation(
      async ({ id }: { id: string }) => ({
        id,
        name: id,
        email: `${id}@fixture.invalid`,
        role: "MEMBER",
      }),
    );
    core.actor.mockImplementation(async (id: string) =>
      buildActorContext(id, {
        id,
        role: "MEMBER",
        isActive: true,
        deletedAt: null,
        memberships: [{ subsystemId: "adcs", accessLevel: "MEMBER" }],
      }),
    );
    core.canReceiveTaskEvent.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        TaskCollaborationGateway,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: SessionService, useValue: sessions },
        { provide: CoreAuthorizationService, useValue: core },
      ],
    }).compile();
    gateway = module.get(TaskCollaborationGateway);
  });
  it("rejects missing token", async () => {
    const socket = client("a", "");
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
  it.each(["invalid", "expired"])("rejects %s token", async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error("invalid"));
    const socket = client("a");
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
  it("checks backend session when connecting", async () => {
    const socket = client("a");
    await gateway.handleConnection(socket);
    expect(sessions.authenticateAccess).toHaveBeenCalledWith({ id: "a" });
    expect(socket.emit).toHaveBeenCalledWith(
      "presence.connected",
      expect.objectContaining({ userId: "a" }),
    );
  });
  it("does not broadcast another account's presence", async () => {
    const a = client("a");
    const b = client("b");
    await gateway.handleConnection(a);
    await gateway.handleConnection(b);
    expect(b.emit).toHaveBeenCalledWith("presence.snapshot", [
      { userId: "b", socketId: "b", name: "b" },
    ]);
  });
  it("disconnect removes event recipient", async () => {
    const socket = client("a");
    await gateway.handleConnection(socket);
    gateway.handleDisconnect(socket);
    socket.emit.mockClear();
    await gateway.invalidateTask("t");
    expect(socket.emit).not.toHaveBeenCalled();
  });
  it("join acknowledges authenticated actor", async () => {
    const socket = client("a");
    await gateway.handleConnection(socket);
    expect(gateway.joinPresence(socket)).toEqual({ ok: true });
  });
  it("join rejects missing actor", () => {
    expect(gateway.joinPresence(client("a"))).toEqual({
      ok: false,
      error: "Unauthenticated",
    });
  });
  it("typing checks sender and every recipient", async () => {
    const a = client("a");
    const b = client("b");
    await gateway.handleConnection(a);
    await gateway.handleConnection(b);
    a.emit.mockClear();
    b.emit.mockClear();
    core.canReceiveTaskEvent.mockImplementation(
      async (actor: { userId: string }) => actor.userId === "a",
    );
    await gateway.handleTyping(a, { taskId: "t" });
    expect(core.task).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "a" }),
      "t",
      "read",
    );
    expect(a.emit).toHaveBeenCalledWith(
      "discussion.typing",
      expect.objectContaining({ taskId: "t" }),
    );
    expect(b.emit).not.toHaveBeenCalled();
  });
  it("revoked session gets no invalidation or protected payload", async () => {
    const socket = client("a");
    await gateway.handleConnection(socket);
    socket.emit.mockClear();
    sessions.authenticateAccess.mockRejectedValue(new Error("revoked"));
    await gateway.invalidateTask("t");
    expect(socket.emit).not.toHaveBeenCalled();
  });
  it("membership removal takes effect at next delivery", async () => {
    const socket = client("a");
    await gateway.handleConnection(socket);
    socket.emit.mockClear();
    await gateway.invalidateTask("t");
    expect(socket.emit).toHaveBeenCalledWith("tasks.invalidate", {});
    socket.emit.mockClear();
    core.canReceiveTaskEvent.mockResolvedValue(false);
    await gateway.invalidateTask("t");
    expect(socket.emit).not.toHaveBeenCalled();
  });
});

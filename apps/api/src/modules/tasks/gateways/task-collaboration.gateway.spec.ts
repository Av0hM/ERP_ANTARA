import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { TaskCollaborationGateway } from "./task-collaboration.gateway";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

describe("TaskCollaborationGateway (unit)", () => {
  let gateway: TaskCollaborationGateway;
  let mockJwtService: { verifyAsync: Mock; signAsync: Mock };
  let mockConfigService: { get: Mock };
  let mockServer: { emit: Mock };
  let mockClient: {
    handshake: { auth: Record<string, unknown>; query: Record<string, unknown> };
    user: { id: string; email: string; name: string; role: string } | undefined;
    emit: Mock;
    disconnect: Mock;
    id: string;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockJwtService = {
      verifyAsync: vi.fn(),
      signAsync: vi.fn(),
    } as any;

    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === "auth.accessSecret") return "access-secret";
        return undefined;
      }),
    } as any;

    mockServer = {
      emit: vi.fn(),
    };

    mockClient = {
      handshake: { auth: {}, query: {} },
      user: undefined,
      emit: vi.fn(),
      disconnect: vi.fn(),
      id: "socket-123",
    } as any;

    mockServer.emit = vi.fn();

    // Create gateway with mocked dependencies
    const gateway = new TaskCollaborationGateway(
      { verifyAsync: vi.fn() } as any,
      { get: vi.fn((key: string) => key === "auth.accessSecret" ? "access-secret" : undefined) } as any,
    );

    // Replace internal properties
    (gateway as any).jwtService = { verifyAsync: vi.fn() };
    (gateway as any).configService = { get: vi.fn((key: string) => key === "auth.accessSecret" ? "access-secret" : undefined) };
    (gateway as any).server = { emit: vi.fn() };
    (gateway as any).onlineUsers = new Map();

    return gateway;
  });

  describe("handleConnection", () => {
    it("should disconnect socket when no token is provided", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn((key: string) => key === "auth.accessSecret" ? "access-secret" : undefined) } as any,
      );
      (gateway as any).server = { emit: vi.fn() };
      (gateway as any).onlineUsers = new Map();

      const mockClient = {
        handshake: { auth: {}, query: {} },
        user: undefined,
        emit: vi.fn(),
        disconnect: vi.fn(),
        id: "socket-123",
      } as any;

      await (gateway as any).handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
      expect(mockClient.emit).toHaveBeenCalledWith("error", expect.any(Error));
    });

    it("should disconnect socket when token is invalid", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn().mockRejectedValue(new Error("Invalid token")) } as any,
        { get: vi.fn((key: string) => key === "auth.accessSecret" ? "access-secret" : undefined) } as any,
      );
      (gateway as any).server = { emit: vi.fn() };
      (gateway as any).onlineUsers = new Map();

      const mockClient = {
        handshake: { auth: { token: "invalid-token" }, query: {} },
        user: undefined,
        emit: vi.fn(),
        disconnect: vi.fn(),
        id: "socket-123",
      } as any;

      await (gateway as any).handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
      expect(mockClient.emit).toHaveBeenCalledWith("error", expect.any(Error));
    });

    it("should connect successfully with valid token and emit presence.connected", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn().mockResolvedValue({ id: "user-1", email: "test@example.com", name: "Test User", role: "MEMBER" }) } as any,
        { get: vi.fn((key: string) => key === "auth.accessSecret" ? "access-secret" : undefined) } as any,
      );
      (gateway as any).server = { emit: vi.fn() };
      (gateway as any).onlineUsers = new Map();

      const mockClient = {
        handshake: { auth: { token: "valid-token" }, query: {} },
        user: undefined,
        emit: vi.fn(),
        disconnect: vi.fn(),
        id: "socket-123",
      } as any;

      await (gateway as any).handleConnection(mockClient);

      expect(mockClient.disconnect).not.toHaveBeenCalled();
      expect(mockClient.emit).toHaveBeenCalledWith("presence.connected", expect.objectContaining({
        socketId: "socket-123",
        onlineCount: 1,
        userId: "user-1",
        userName: "Test User",
      }));
    });

    it("should disconnect when token is valid but user has no id", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn().mockResolvedValue({ email: "test@example.com", name: "Test User", role: "MEMBER" }) } as any,
        { get: vi.fn((key: string) => key === "auth.accessSecret" ? "access-secret" : undefined) } as any,
      );
      (gateway as any).server = { emit: vi.fn() };
      (gateway as any).onlineUsers = new Map();

      const mockClient = {
        handshake: { auth: { token: "valid-token" }, query: {} },
        user: undefined,
        emit: vi.fn(),
        disconnect: vi.fn(),
        id: "socket-123",
      } as any;

      await (gateway as any).handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
      expect(mockClient.emit).toHaveBeenCalledWith("error", expect.any(Error));
    });
  });

  describe("extractToken", () => {
    it("should extract token from handshake.auth.token", () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn() } as any,
      );

      const client = {
        handshake: { auth: { token: "test-token" }, query: {} },
      } as any;

      const token = (gateway as any).extractToken(client);
      expect(token).toBe("test-token");
    });

    it("should extract token from handshake.query.token when auth.token is not present", () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn() } as any,
      );

      const client = {
        handshake: { auth: {}, query: { token: "query-token" } },
      } as any;

      const token = (gateway as any).extractToken(client);
      expect(token).toBe("query-token");
    });

    it("should return null when no token is present", () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn() } as any,
      );

      const client = {
        handshake: { auth: {}, query: {} },
      } as any;

      const token = (gateway as any).extractToken(client);
      expect(token).toBeNull();
    });
  });

  describe("handleDisconnect", () => {
    it("should remove user from onlineUsers and emit presence.snapshot", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn() } as any,
      );
      (gateway as any).server = { emit: vi.fn() };
      (gateway as any).onlineUsers = new Map([
        ["user-1", { socketId: "socket-1", name: "User One" }],
      ]);

      const mockClient = {
        user: { id: "user-1", name: "Test User" },
      } as any;

      await (gateway as any).handleDisconnect(mockClient);

      expect((gateway as any).onlineUsers.has("user-1")).toBe(false);
      expect((gateway as any).server.emit).toHaveBeenCalledWith("presence.snapshot", expect.any(Array));
    });

    it("should not error when disconnecting user not in onlineUsers", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn() } as any,
      );
      (gateway as any).server = { emit: vi.fn() };
      (gateway as any).onlineUsers = new Map();

      const mockClient = {
        user: { id: "user-not-exist", name: "Test User" },
      } as any;

      await (gateway as any).handleDisconnect(mockClient);

      expect((gateway as any).server.emit).toHaveBeenCalledWith("presence.snapshot", []);
    });
  });

  describe("joinPresence", () => {
    it("should add user to onlineUsers and return ok", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn() } as any,
      );
      (gateway as any).server = { emit: vi.fn() };
      (gateway as any).onlineUsers = new Map();

      const mockClient = {
        user: { id: "user-1", name: "Test User" },
      } as any;

      const result = await (gateway as any).joinPresence(mockClient);

      expect(result).toEqual({ ok: true });
      expect((gateway as any).onlineUsers.has("user-1")).toBe(true);
      expect((gateway as any).server.emit).toHaveBeenCalledWith("presence.snapshot", expect.any(Array));
    });

    it("should return error when user is not authenticated", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn() } as any,
      );
      (gateway as any).server = { emit: vi.fn() };
      (gateway as any).onlineUsers = new Map();

      const mockClient = {
        user: undefined,
      } as any;

      const result = await (gateway as any).joinPresence(mockClient);

      expect(result).toEqual({ ok: false, error: "Unauthenticated" });
    });
  });

  describe("handleTyping", () => {
    it("should broadcast typing indicator when user is authenticated", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn() } as any,
      );
      (gateway as any).server = { emit: vi.fn() };

      const mockClient = {
        user: { id: "user-1", name: "Test User" },
      } as any;

      await (gateway as any).handleTyping(mockClient, { taskId: "task-123" });

      expect((gateway as any).server.emit).toHaveBeenCalledWith("discussion.typing", {
        taskId: "task-123",
        userName: "Test User",
        userId: "user-1",
      });
    });

    it("should not broadcast when user is not authenticated", async () => {
      const gateway = new TaskCollaborationGateway(
        { verifyAsync: vi.fn() } as any,
        { get: vi.fn() } as any,
      );
      (gateway as any).server = { emit: vi.fn() };

      const mockClient = {
        user: undefined,
      } as any;

      await (gateway as any).handleTyping(mockClient, { taskId: "task-123" });

      expect((gateway as any).server.emit).not.toHaveBeenCalled();
    });
  });
});
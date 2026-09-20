import { WsException } from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { TaskCollaborationGateway } from "./task-collaboration.gateway";

describe("TaskCollaborationGateway (unit)", () => {
  let gateway: TaskCollaborationGateway;
  let mockJwtService: Partial<JwtService>;
  let mockConfigService: Partial<ConfigService>;
  let mockClient: any;

  beforeEach(() => {
    mockJwtService = {
      verifyAsync: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === "auth.accessSecret") return "dev-access-secret";
        return undefined;
      }),
    };

    gateway = new TaskCollaborationGateway(
      mockJwtService as JwtService,
      mockConfigService as ConfigService,
    );

    mockClient = {
      handshake: { auth: {}, query: {} },
      user: undefined,
      disconnect: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
    };
  });

  describe("handleConnection", () => {
    it("should disconnect client with no token", async () => {
      mockClient.handshake.auth = {};
      mockClient.handshake.query = {};

      await gateway.handleConnection(mockClient);

      expect(mockClient.emit).toHaveBeenCalledWith("error", expect.any(Error));
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });

    it("should disconnect client with invalid token", async () => {
      mockClient.handshake.auth = { token: "invalid-token" };
      (mockJwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error("Invalid token"));

      await gateway.handleConnection(mockClient);

      expect(mockClient.emit).toHaveBeenCalledWith("error", expect.any(Error));
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });

    it("should disconnect client with expired token", async () => {
      mockClient.handshake.auth = { token: "expired-token" };
      (mockJwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error("Token expired"));

      await gateway.handleConnection(mockClient);

      expect(mockClient.emit).toHaveBeenCalledWith("error", expect.any(Error));
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });

    it("should connect client with valid token", async () => {
      mockClient.handshake.auth = { token: "valid-token" };
      mockClient.id = "socket-1";
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: "MEMBER",
      });

      await gateway.handleConnection(mockClient);

      expect(mockClient.user).toEqual({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: "MEMBER",
      });
      expect(mockClient.emit).toHaveBeenCalledWith("presence.connected", expect.objectContaining({
        socketId: "socket-1",
        onlineCount: 1,
        userId: "user-1",
        userName: "Test User",
      }));
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it("should extract token from handshake.query if not in auth", async () => {
      mockClient.handshake.auth = {};
      mockClient.handshake.query = { token: "valid-token" };
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: "MEMBER",
      });

      await gateway.handleConnection(mockClient);

      expect(mockClient.user).toEqual({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: "MEMBER",
      });
    });
  });

  describe("handleDisconnect", () => {
    it("should remove user from onlineUsers on disconnect", async () => {
      // First connect a user
      mockClient.handshake.auth = { token: "valid-token" };
      mockClient.id = "socket-1";
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: "MEMBER",
      });

      await gateway.handleConnection(mockClient);

      // Verify user is in onlineUsers
      const presence = (gateway as any).serializePresence();
      expect(presence).toHaveLength(1);
      expect(presence[0]).toEqual({
        userId: "user-1",
        socketId: "socket-1",
        name: "Test User",
      });

      // Now disconnect
      await gateway.handleDisconnect(mockClient);

      // Verify user is removed
      const presenceAfter = (gateway as any).serializePresence();
      expect(presenceAfter).toHaveLength(0);
    });
  });

  describe("joinPresence", () => {
    it("should return ok for authenticated user", async () => {
      mockClient.handshake.auth = { token: "valid-token" };
      mockClient.id = "socket-1";
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: "MEMBER",
      });

      await gateway.handleConnection(mockClient);

      const result = await gateway.joinPresence(mockClient);

      expect(result).toEqual({ ok: true });
    });

    it("should return error for unauthenticated user", async () => {
      mockClient.user = undefined;
      mockClient.id = "socket-1";

      const result = await gateway.joinPresence(mockClient);

      expect(result).toEqual({ ok: false, error: "Unauthenticated" });
    });
  });

  describe("handleTyping", () => {
    it("should broadcast typing indicator to all clients", async () => {
      // Connect first user (typer)
      const typerClient = { ...mockClient, id: "socket-1", emit: jest.fn() };
      typerClient.handshake.auth = { token: "valid-token" };
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: "User One",
        role: "MEMBER",
      });
      await gateway.handleConnection(typerClient);

      // Connect second user (observer)
      const observerClient = { ...mockClient, id: "socket-2", emit: jest.fn() };
      observerClient.handshake.auth = { token: "valid-token-2" };
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({
        id: "user-2",
        email: "test2@example.com",
        name: "User Two",
        role: "MEMBER",
      });
      await gateway.handleConnection(observerClient);

      // Mock server emit
      const mockServer = { emit: jest.fn() };
      (gateway as any).server = mockServer;

      // Trigger typing event
      gateway.handleTyping(typerClient, { taskId: "task-123" });

      // Verify server emitted typing event to all clients
      expect(mockServer.emit).toHaveBeenCalledWith("discussion.typing", {
        taskId: "task-123",
        userName: "User One",
        userId: "user-1",
      });
    });
  });

  describe("serializePresence", () => {
    it("should return empty array when no users connected", () => {
      const presence = (gateway as any).serializePresence();
      expect(presence).toEqual([]);
    });

    it("should return correct presence data for connected users", async () => {
      mockClient.handshake.auth = { token: "valid-token" };
      mockClient.id = "socket-1";
      (mockJwtService.verifyAsync as jest.Mock).mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: "MEMBER",
      });

      await gateway.handleConnection(mockClient);

      const presence = (gateway as any).serializePresence();
      expect(presence).toEqual([
        {
          userId: "user-1",
          socketId: "socket-1",
          name: "Test User",
        },
      ]);
    });
  });
});
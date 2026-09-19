import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { io, Socket } from "socket.io-client";
import { TaskCollaborationGateway } from "./task-collaboration.gateway";
import { WsException } from "@nestjs/websockets";

describe("TaskCollaborationGateway (e2e)", () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let configService: ConfigService;
  let accessSecret: string;
  let gateway: TaskCollaborationGateway;
  let serverUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TaskCollaborationGateway,
        JwtService,
        ConfigService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // WebSocket adapter is automatically configured by NestJS

    jwtService = app.get(JwtService);
    configService = app.get(ConfigService);
    gateway = app.get(TaskCollaborationGateway);

    accessSecret = configService.get<string>("auth.accessSecret") ?? "dev-access-secret";

    await app.listen(0);
    serverUrl = await new Promise<string>((resolve) => {
      const server = app.getHttpServer();
      const port = server.address().port;
      resolve(`http://localhost:${port}`);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const createValidToken = async (payload: object = {}) => {
    return jwtService.signAsync({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "MEMBER",
      ...payload,
    }, { secret: accessSecret, expiresIn: "15m" });
  };

  const createExpiredToken = async () => {
    return jwtService.signAsync(
      { id: "user-1", email: "test@example.com", name: "Test User", role: "MEMBER" },
      { secret: accessSecret, expiresIn: "-1h" }
    );
  };

  const connectWithToken = (token: string): Promise<Socket> => {
    return new Promise((resolve, reject) => {
      const socket = io(`${serverUrl}/collaboration`, {
        auth: { token },
        transports: ["websocket"],
        forceNew: true,
      });

      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", (err) => reject(err));

      setTimeout(() => reject(new Error("Connection timeout")), 5000);
    });
  };

  beforeEach(() => {
    // Reset gateway state before tests
    (gateway as any).onlineUsers.clear();
  });

  afterEach(() => {
    (gateway as any).onlineUsers.clear();
  });

  describe("handleConnection", () => {
    it("should disconnect socket with no token", async () => {
      const socket = io(`${serverUrl}/collaboration`, {
        transports: ["websocket"],
        forceNew: true,
      });

      await new Promise<void>((resolve, reject) => {
        socket.on("disconnect", (reason: string) => {
          expect(reason).toBe("unauthorized");
          resolve();
        });

        socket.on("connect", () => reject(new Error("Should not connect without token")));

        setTimeout(() => reject(new Error("Timeout waiting for disconnect")), 5000);
      });
    });

    it("should disconnect socket with invalid token", async () => {
      const socket = io(`${serverUrl}/collaboration`, {
        auth: { token: "invalid-token" },
        transports: ["websocket"],
        forceNew: true,
      });

      await new Promise<void>((resolve, reject) => {
        socket.on("disconnect", (reason: string) => {
          expect(reason).toBe("unauthorized");
          resolve();
        });

        socket.on("connect", () => reject(new Error("Should not connect with invalid token")));

        setTimeout(() => reject(new Error("Timeout waiting for disconnect")), 5000);
      });
    });

    it("should disconnect socket with expired token", async () => {
      const expiredToken = await createExpiredToken();

      const socket = io(`${serverUrl}/collaboration`, {
        auth: { token: expiredToken },
        transports: ["websocket"],
        forceNew: true,
      });

      await new Promise<void>((resolve, reject) => {
        socket.on("disconnect", (reason: string) => {
          expect(reason).toBe("unauthorized");
          resolve();
        });

        socket.on("connect", () => reject(new Error("Should not connect with expired token")));

        setTimeout(() => reject(new Error("Timeout waiting for disconnect")), 5000);
      });
    });

    it("should connect successfully with valid token and emit presence.connected", async () => {
      const token = await createValidToken();

      const socket = await connectWithToken(token);

      await new Promise<void>((resolve, reject) => {
        socket.on("presence.connected", (data: any) => {
          expect(data).toMatchObject({
            socketId: socket.id,
            onlineCount: 1,
            userId: "user-1",
            userName: "Test User",
          });
          resolve();
        });

        setTimeout(() => reject(new Error("Timeout waiting for presence.connected")), 10000);
      });

      socket.disconnect();
    });

    it("should broadcast presence.snapshot to all connected clients", async () => {
      const token1 = await createValidToken({ id: "user-1", name: "User One" });
      const token2 = await createValidToken({ id: "user-2", name: "User Two" });

      const socket1 = await connectWithToken(token1);
      const socket2 = await connectWithToken(token2);

      const snapshots: any[] = [];

      await new Promise<void>((resolve, reject) => {
        socket1.on("presence.snapshot", (snapshot: any) => {
          snapshots.push(snapshot);
          if (snapshots.length >= 2) {
            const users = snapshots.flat();
            if (users.some(u => u.userId === "user-1") && users.some(u => u.userId === "user-2")) {
              resolve();
            }
          }
        });

        socket2.on("presence.snapshot", (snapshot: any) => {
          snapshots.push(snapshot);
        });

        setTimeout(() => reject(new Error("Timeout waiting for presence.snapshot")), 10000);
      });
    });
  });

  describe("handleDisconnect", () => {
    it("should remove user from presence on disconnect", async () => {
      const token = await createValidToken({ id: "user-disconnect", name: "User Disconnect" });
      const socket = await connectWithToken(token);

      // Wait for initial connection
      await new Promise<void>((resolve) => {
        socket.on("presence.connected", () => resolve());
      });

      // Disconnect and wait for snapshot update
      await new Promise<void>((resolve, reject) => {
        // We need another socket to observe the snapshot
        const observerToken = createValidToken({ id: "observer", name: "Observer" });
        const observerSocket = io(`${serverUrl}/collaboration`, {
          auth: { token: observerToken },
          transports: ["websocket"],
          forceNew: true,
        });

        observerSocket.on("presence.snapshot", (snapshot: any) => {
          const user = snapshot.find((u: any) => u.userId === "user-disconnect");
          if (!user) {
            // User disconnected, check passed
            observerSocket.disconnect();
            resolve();
          }
        });

        socket.disconnect();

        setTimeout(() => reject(new Error("Timeout waiting for disconnect snapshot")), 5000);
      });
    });
  });

  describe("presence.join", () => {
    it("should allow authenticated user to join presence", async () => {
      const token = await createValidToken({ id: "user-join", name: "User Join" });
      const socket = await connectWithToken(token);

      const result = await new Promise<any>((resolve, reject) => {
        socket.emit("presence.join", {}, (response: any) => {
          resolve(response);
        });

        setTimeout(() => reject(new Error("Timeout waiting for presence.join response")), 5000);
      });

      expect(result).toEqual({ ok: true });

      socket.disconnect();
    });
  });

  describe("discussion.typing", () => {
    it("should broadcast typing indicator to all clients", async () => {
      const token1 = await createValidToken({ id: "user-typing", name: "User Typing" });
      const token2 = await createValidToken({ id: "user-observer", name: "Observer" });

      const socket1 = await connectWithToken(token1);
      const socket2 = await connectWithToken(token2);

      const typingData = await new Promise<any>((resolve, reject) => {
        socket2.on("discussion.typing", (data: any) => resolve(data));

        socket1.emit("discussion.typing", { taskId: "task-123" });

        setTimeout(() => reject(new Error("Timeout waiting for discussion.typing")), 5000);
      });

      expect(typingData).toEqual({
        taskId: "task-123",
        userName: "User Typing",
        userId: "user-typing",
      });

      socket1.disconnect();
      socket2.disconnect();
    });
  });
});
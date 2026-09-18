import { WsException } from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

import { WsJwtAuthGuard } from "./ws-jwt-auth.guard";

describe("WsJwtAuthGuard", () => {
  const jwtService = {
    verifyAsync: jest.fn(),
  } as unknown as JwtService;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === "auth.accessSecret") return "access-secret";
      return undefined;
    }),
  } as unknown as ConfigService;

  let guard: WsJwtAuthGuard;

  const createMockClient = (auth?: Record<string, unknown>, query?: Record<string, unknown>) => ({
    handshake: { auth, query },
    user: undefined as { id: string; email: string; name: string; role: string } | undefined,
  });

  const createMockContext = (client: ReturnType<typeof createMockClient>, data?: unknown) => ({
    switchToWs: () => ({
      getClient: () => client,
      getData: () => data,
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new WsJwtAuthGuard(jwtService, configService);
  });

  it("allows connection with valid token in handshake.auth", async () => {
    const client = createMockClient({ token: "valid-token" });
    const context = createMockContext(client);

    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "MEMBER",
    });

    const result = await guard.canActivate(context as never);

    expect(result).toBe(true);
    expect(client.user).toEqual({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "MEMBER",
    });
  });

  it("allows connection with valid token in handshake.query", async () => {
    const client = createMockClient(undefined, { token: "valid-token" });
    const context = createMockContext(client);

    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "MEMBER",
    });

    const result = await guard.canActivate(context as never);

    expect(result).toBe(true);
  });

  it("rejects connection with no token", async () => {
    const client = createMockClient();
    const context = createMockContext(client);

    await expect(guard.canActivate(context as never)).rejects.toThrow(WsException);
    await expect(guard.canActivate(context as never)).rejects.toThrow("Authentication required");
  });

  it("rejects connection with invalid token", async () => {
    const client = createMockClient({ token: "invalid-token" });
    const context = createMockContext(client);

    (jwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error("Invalid token"));

    await expect(guard.canActivate(context as never)).rejects.toThrow(WsException);
    await expect(guard.canActivate(context as never)).rejects.toThrow("Invalid or expired token");
  });

  it("rejects connection with expired token", async () => {
    const client = createMockClient({ token: "expired-token" });
    const context = createMockContext(client);

    (jwtService.verifyAsync as jest.Mock).mockRejectedValue(new Error("Token expired"));

    await expect(guard.canActivate(context as never)).rejects.toThrow(WsException);
    await expect(guard.canActivate(context as never)).rejects.toThrow("Invalid or expired token");
  });
});
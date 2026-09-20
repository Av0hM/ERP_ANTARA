import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { io, Socket } from "socket.io-client";
import { TaskCollaborationGateway } from "./task-collaboration.gateway";

describe("TaskCollaborationGateway (e2e)", () => {
  // Skip e2e tests in CI where database setup is complex
  // Run locally with: npm run test:e2e --workspace @antara/api
  if (process.env.CI) {
    it.skip("skipped in CI - run locally with database", () => {});
    return;
  }

  let app: INestApplication;
  let jwtService: JwtService;
  let accessSecret: string;
  let serverUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TaskCollaborationGateway, JwtService, ConfigService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));

    jwtService = app.get(JwtService);
    const configService = app.get(ConfigService);
    accessSecret = configService.get<string>("auth.accessSecret") ?? "dev-access-secret";

    await app.listen(0);
    const address = app.getHttpServer().address();
    serverUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const createToken = (overrides: Record<string, unknown> = {}, opts: { secret?: string; expiresIn?: JwtSignOptions["expiresIn"] } = {}) =>
    jwtService.signAsync(
      { id: "user-1", email: "test@example.com", name: "Test User", role: "MEMBER", ...overrides },
      { secret: opts.secret ?? accessSecret, expiresIn: opts.expiresIn ?? "15m" },
    );

  const connect = (token?: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(`${serverUrl}/collaboration`, {
        auth: token ? { token } : {},
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });

      const timeout = setTimeout(() => reject(new Error("timed out waiting for connect/disconnect")), 4000);

      socket.on("presence.connected", () => {
        clearTimeout(timeout);
        resolve(socket);
      });
      socket.on("disconnect", () => {
        clearTimeout(timeout);
        resolve(socket); // resolves disconnected — caller checks socket.connected
      });
      socket.on("connect_error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

  it("disconnects a client with no token", async () => {
    const socket = await connect(undefined);
    expect(socket.connected).toBe(false);
    socket.close();
  });

  it("disconnects a client with an invalid token", async () => {
    const badToken = await createToken({}, { secret: "wrong-secret" });
    const socket = await connect(badToken);
    expect(socket.connected).toBe(false);
    socket.close();
  });

  it("disconnects a client with an expired token", async () => {
    const expiredToken = await createToken({}, { expiresIn: "-10s" });
    const socket = await connect(expiredToken);
    expect(socket.connected).toBe(false);
    socket.close();
  });

  it("accepts a client with a valid token and emits presence.connected", async () => {
    const validToken = await createToken({ id: "user-42", name: "Valid User" });
    const socket = await connect(validToken);
    expect(socket.connected).toBe(true);
    socket.close();
  });
});
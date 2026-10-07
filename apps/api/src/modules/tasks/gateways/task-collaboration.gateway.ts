import { CoreAuthorizationService } from "../../../common/authorization/core-authorization.service";
import { canReadSubsystem } from "../../../common/authorization/authorization.policy";
import { Inject } from "@nestjs/common";
import { UseGuards } from "@nestjs/common";
import { WsJwtAuthGuard } from "../../auth/guards/ws-jwt-auth.guard";
import { SessionService } from "../../../common/sessions/session.service";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { WsException } from "@nestjs/websockets";

export interface AuthenticatedSocket {
  id: string;
  handshake: {
    auth?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };
  user?: { id: string; email: string; name: string; role: string };
  emit(event: string, payload: unknown): unknown;
  disconnect(close?: boolean): unknown;
}

@UseGuards(WsJwtAuthGuard)
@WebSocketGateway({
  cors: {
    origin: [
      process.env.FRONTEND_URL ??
        process.env.NEXTAUTH_URL ??
        "http://localhost:3000",
    ],
    credentials: true,
  },
  namespace: "/collaboration",
})
export class TaskCollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server?: Server;

  private readonly clients = new Map<string, AuthenticatedSocket>();

  private readonly onlineUsers = new Map<
    string,
    { socketId: string; name: string }
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(SessionService)
    private readonly sessions: Pick<SessionService, "authenticateAccess">,
    private readonly core: CoreAuthorizationService,
  ) {}

  private serializePresence() {
    return Array.from(this.onlineUsers.entries()).map(([userId, presence]) => ({
      userId,
      socketId: presence.socketId,
      name: presence.name,
    }));
  }

  async handleConnection(client: AuthenticatedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      client.emit("error", new Error("Authentication required"));
      client.disconnect(true);
      return;
    }

    const accessSecret =
      this.configService.get<string>("auth.accessSecret") ??
      "dev-access-secret";

    try {
      const payload = await this.jwtService.verifyAsync<
        Record<string, unknown>
      >(token, { secret: accessSecret });
      client.user = await this.sessions.authenticateAccess(payload);
    } catch {
      client.emit("error", new Error("Invalid or expired token"));
      client.disconnect(true);
      return;
    }

    const user = client.user;
    if (!user?.id) {
      client.emit("error", new Error("Authentication required"));
      client.disconnect(true);
      return;
    }

    this.clients.set(client.id, client);
    this.onlineUsers.set(user.id, {
      socketId: client.id,
      name: user.name,
    });

    client.emit("presence.connected", {
      socketId: client.id,
      onlineCount: 1,
      userId: user.id,
      userName: user.name,
    });

    client.emit(
      "presence.snapshot",
      this.serializePresence().filter(
        (presence) => presence.userId === client.user?.id,
      ),
    );
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    if (typeof client.handshake.auth?.token === "string") {
      return client.handshake.auth.token;
    }
    if (typeof client.handshake.query?.token === "string") {
      return client.handshake.query.token;
    }
    return null;
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.clients.delete(client.id);
    const user = client.user;
    if (user?.id) {
      this.onlineUsers.delete(user.id);
    }

    client.emit(
      "presence.snapshot",
      this.serializePresence().filter(
        (presence) => presence.userId === client.user?.id,
      ),
    );
  }

  @SubscribeMessage("presence.join")
  joinPresence(@ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.user;
    if (!user?.id) {
      return { ok: false, error: "Unauthenticated" };
    }

    this.onlineUsers.set(user.id, {
      socketId: client.id,
      name: user.name,
    });

    client.emit(
      "presence.snapshot",
      this.serializePresence().filter(
        (presence) => presence.userId === client.user?.id,
      ),
    );
    return { ok: true };
  }

  @SubscribeMessage("discussion.typing")
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { taskId: string },
  ) {
    const user = client.user;
    if (!user?.id) {
      return;
    }

    const actor = await this.core.actor(user.id);
    await this.core.task(actor, payload.taskId, "read");
    await this.deliver(payload.taskId, "discussion.typing", {
      taskId: payload.taskId,
      userName: user.name,
      userId: user.id,
    });
  }
  async invalidateTask(taskId: string) {
    // No task/comment payload travels over a stale socket subscription.
    await this.deliver(taskId, "tasks.invalidate", {});
  }

  private async deliver(taskId: string, event: string, payload: unknown) {
    for (const client of this.clients.values()) {
      try {
        const token = this.extractToken(client);
        if (!token) continue;
        const claims = await this.jwtService.verifyAsync<
          Record<string, unknown>
        >(token, {
          secret:
            this.configService.get<string>("auth.accessSecret") ??
            "dev-access-secret",
        });
        const user = await this.sessions.authenticateAccess(claims);
        const actor = await this.core.actor(user.id);
        if (await this.core.canReceiveTaskEvent(actor, taskId))
          client.emit(event, payload);
      } catch {
        // Invalid/revoked/unavailable recipients receive no protected event.
      }
    }
  }
}

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { UseGuards } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { WsException } from "@nestjs/websockets";

import { WsJwtAuthGuard } from "../../auth/guards/ws-jwt-auth.guard";

interface AuthenticatedSocket extends Socket {
  user: { id: string; email: string; name: string; role: string };
}

@UseGuards(WsJwtAuthGuard)
@WebSocketGateway({
  cors: {
    origin: [process.env.FRONTEND_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000"],
    credentials: true,
  },
  namespace: "/collaboration",
})
export class TaskCollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server?: Server;

  private readonly onlineUsers = new Map<string, { socketId: string; name: string }>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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
      client.disconnect(true);
      return;
    }

    const accessSecret = this.configService.get<string>("auth.accessSecret") ?? "dev-access-secret";

    try {
      const payload = await this.jwtService.verifyAsync(token, { secret: accessSecret });
      client.user = payload;
    } catch {
      client.disconnect(true);
      return;
    }

    const user = client.user;
    if (!user?.id) {
      client.disconnect(true);
      return;
    }

    this.onlineUsers.set(user.id, {
      socketId: client.id,
      name: user.name,
    });

    client.emit("presence.connected", {
      socketId: client.id,
      onlineCount: this.onlineUsers.size,
      userId: user.id,
      userName: user.name,
    });

    this.server?.emit("presence.snapshot", this.serializePresence());
  }

  private extractToken(client: AuthenticatedSocket): string | null {
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token as string;
    }
    if (client.handshake.query?.token) {
      return client.handshake.query.token as string;
    }
    return null;
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.user;
    if (user?.id) {
      this.onlineUsers.delete(user.id);
    }

    this.server?.emit("presence.snapshot", this.serializePresence());
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

    this.server?.emit("presence.snapshot", this.serializePresence());
    return { ok: true };
  }

  @SubscribeMessage("discussion.typing")
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { taskId: string },
  ) {
    const user = client.user;
    if (!user?.id) {
      return;
    }

    this.server?.emit("discussion.typing", {
      taskId: payload.taskId,
      userName: user.name,
      userId: user.id,
    });
  }
}

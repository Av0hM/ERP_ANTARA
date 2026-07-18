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

  private serializePresence() {
    return Array.from(this.onlineUsers.entries()).map(([userId, presence]) => ({
      userId,
      socketId: presence.socketId,
      name: presence.name,
    }));
  }

  handleConnection(client: Socket) {
    client.emit("presence.connected", {
      socketId: client.id,
      onlineCount: this.onlineUsers.size,
    });
  }

  handleDisconnect(client: Socket) {
    for (const [userId, presence] of this.onlineUsers.entries()) {
      if (presence.socketId === client.id) {
        this.onlineUsers.delete(userId);
      }
    }

    this.server?.emit("presence.snapshot", this.serializePresence());
  }

  @SubscribeMessage("presence.join")
  joinPresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string; name: string },
  ) {
    this.onlineUsers.set(payload.userId, {
      socketId: client.id,
      name: payload.name,
    });

    this.server?.emit("presence.snapshot", this.serializePresence());
    return { ok: true };
  }

  @SubscribeMessage("discussion.typing")
  handleTyping(@MessageBody() payload: { taskId: string; userName: string }) {
    this.server?.emit("discussion.typing", payload);
  }
}

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { WsException } from "@nestjs/websockets";

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();

    const token = this.extractToken(client, data);

    if (!token) {
      throw new WsException("Authentication required");
    }

    const accessSecret = this.configService.get<string>("auth.accessSecret") ?? "dev-access-secret";

    try {
      const payload = await this.jwtService.verifyAsync(token, { secret: accessSecret });
      client.user = payload;
      return true;
    } catch {
      throw new WsException("Invalid or expired token");
    }
  }

  private extractToken(client: { handshake: { auth?: Record<string, unknown>; query?: Record<string, unknown> } }, data: unknown): string | null {
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token as string;
    }
    if (client.handshake.query?.token) {
      return client.handshake.query.token as string;
    }
    if (data && typeof data === "object" && "token" in data) {
      const token = (data as { token?: string }).token;
      return token ?? null;
    }
    return null;
  }
}
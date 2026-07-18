import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { AppRole } from "@antara/contracts";

import { PrismaService } from "../../common/prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshSessionDto } from "./dto/refresh-session.dto";
import { RegisterDto } from "./dto/register.dto";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
};

type TokenBundle = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(payload: RegisterDto) {
    const existing = await this.usersService.findByEmail(payload.email);
    if (existing) {
      throw new UnauthorizedException("User already exists");
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const user = await this.usersService.create({
      email: payload.email,
      name: payload.name,
      passwordHash,
      role: payload.role ?? AppRole.MEMBER,
    });

    return this.createAuthResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  }

  async login(payload: LoginDto) {
    const user = await this.usersService.findByEmail(payload.email);
    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isMatch = await bcrypt.compare(payload.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.createAuthResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  }

  async googleCallback(payload: { email: string; name: string; avatarUrl?: string }) {
    let user = await this.usersService.findByEmail(payload.email);

    if (!user) {
      user = await this.usersService.create({
        email: payload.email,
        name: payload.name,
        role: AppRole.MEMBER,
      });
    }

    if (payload.avatarUrl && !user.avatarUrl) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: payload.avatarUrl },
      });
    }

    return this.createAuthResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  }

  async refreshSession(payload: RefreshSessionDto) {
    const refreshSecret = this.configService.get<string>("auth.refreshSecret") ?? "dev-refresh-secret";
    const decoded = await this.jwtService.verifyAsync<{ sub: string; type: string }>(payload.refreshToken, {
      secret: refreshSecret,
    });

    if (decoded.type !== "refresh") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const session = await this.prisma.session.findUnique({
      where: { refreshToken: payload.refreshToken },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Session expired");
    }

    const user = session.user;
    const tokens = await this.issueTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(tokens.refreshTokenExpiresAt),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    };
  }

  async logout(payload: LogoutDto) {
    await this.prisma.session.updateMany({
      where: { refreshToken: payload.refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  private async createAuthResponse(user: AuthUser) {
    const tokens = await this.issueTokens(user);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(tokens.refreshTokenExpiresAt),
      },
    });

    return {
      user,
      ...tokens,
    };
  }

  private async issueTokens(user: AuthUser): Promise<TokenBundle> {
    const accessSecret = this.configService.get<string>("auth.accessSecret") ?? "dev-access-secret";
    const refreshSecret = this.configService.get<string>("auth.refreshSecret") ?? "dev-refresh-secret";
    const accessTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const accessToken = await this.jwtService.signAsync(user, {
      secret: accessSecret,
      expiresIn: "15m",
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, type: "refresh" },
      {
        secret: refreshSecret,
        expiresIn: "7d",
      },
    );

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };
  }
}


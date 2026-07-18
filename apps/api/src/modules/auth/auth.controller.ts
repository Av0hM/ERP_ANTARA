import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshSessionDto } from "./dto/refresh-session.dto";
import { RegisterDto } from "./dto/register.dto";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() payload: RegisterDto) {
    return this.authService.register(payload);
  }

  @Post("login")
  login(@Body() payload: LoginDto) {
    return this.authService.login(payload);
  }

  @Post("google-callback")
  googleCallback(@Body() payload: { email: string; name: string; avatarUrl?: string }) {
    return this.authService.googleCallback(payload);
  }

  @Post("refresh")
  refresh(@Body() payload: RefreshSessionDto) {
    return this.authService.refreshSession(payload);
  }

  @Post("logout")
  logout(@Body() payload: LogoutDto) {
    return this.authService.logout(payload);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: unknown) {
    return user;
  }
}

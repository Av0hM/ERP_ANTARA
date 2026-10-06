import { RefreshThrottleGuard } from "./refresh-throttle.guard";
import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { LogoutDto } from "./dto/logout.dto";
import { RefreshSessionDto } from "./dto/refresh-session.dto";
import { GoogleCallbackDto } from "./dto/google-callback.dto";
import { Throttle, ThrottlerGuard, SkipThrottle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

// AuthController intentionally omits @UseGuards(RolesGuard) at class level:
// - register is always rejected; login/verified Google/refresh authenticate in the service
// - logout requires valid refresh token (validated in service)
// - /me endpoint uses JwtAuthGuard for authenticated user info
@Controller("auth")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register() {
    return this.authService.register();
  }

  @Post("login")
  login(@Body() payload: LoginDto) {
    return this.authService.login(payload);
  }

  @Post("google-callback")
  googleCallback(@Body() payload: GoogleCallbackDto) {
    return this.authService.googleCallback(payload);
  }

  @Post("refresh")
  @SkipThrottle()
  @UseGuards(RefreshThrottleGuard)
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

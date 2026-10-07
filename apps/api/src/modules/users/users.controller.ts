import { AccountLifecycleService } from "./account-lifecycle.service";
import { IsIn } from "class-validator";
import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString, Min } from "class-validator";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersService } from "./users.service";

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; role: string };
}

class UpdateProfileDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  weeklyCapacityHours?: number;
}

class UpdateRoleDto {
  @IsIn(["OWNER", "MEMBER"])
  role!: "OWNER" | "MEMBER";
}

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  @Get("members")
  @Roles("OWNER", "ADMIN", "MEMBER")
  listMembers(@Req() req: AuthenticatedRequest) {
    return this.usersService.listMembers(req.user.id);
  }

  @Patch(":id/role")
  @Roles("OWNER")
  updateRole(
    @Param("id") id: string,
    @Body() body: UpdateRoleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.lifecycle.updateRole(id, body.role, req.user.id);
  }

  @Patch(":id/deactivate")
  @Roles("OWNER")
  deactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.lifecycle.setActive(id, false, req.user.id);
  }

  @Patch(":id/reactivate")
  @Roles("OWNER")
  reactivate(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.lifecycle.setActive(id, true, req.user.id);
  }

  @Patch(":id/revoke-sessions")
  @Roles("OWNER")
  revokeSessions(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.lifecycle.revokeSessions(id, req.user.id);
  }

  @Patch(":id/profile")
  @Roles("OWNER", "ADMIN")
  updateProfile(
    @Param("id") id: string,
    @Body() body: UpdateProfileDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.updateProfile(id, body, req.user.id);
  }
}

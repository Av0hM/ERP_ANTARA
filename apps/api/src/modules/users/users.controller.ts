import { AppRole } from "@antara/contracts";
import { Body, Controller, Get, Patch, Param, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

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

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("members")
  @Roles("OWNER", "ADMIN")
  listMembers() {
    return this.usersService.listMembers();
  }

  @Patch(":id/role")
  @Roles("OWNER", "ADMIN")
  updateRole(@Param("id") id: string, @Body() body: { role: AppRole }, @Req() req: AuthenticatedRequest) {
    return this.usersService.updateRole(id, body.role, req.user.id);
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

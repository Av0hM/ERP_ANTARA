import { AppRole } from "@antara/contracts";
import { Body, Controller, Get, Patch, Param, Req, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersService } from "./users.service";

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; role: string };
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
}

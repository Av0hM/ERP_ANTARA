import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { SubsystemsService } from "./subsystems.service";

@Controller("subsystems")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubsystemsController {
  constructor(private readonly subsystemsService: SubsystemsService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  list() {
    return this.subsystemsService.list();
  }

  @Get(":slug/health")
  @Roles("OWNER", "ADMIN", "MEMBER")
  getHealth(@Param("slug") slug: string) {
    return this.subsystemsService.getHealth(slug);
  }
}

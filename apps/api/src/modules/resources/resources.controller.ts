import { Controller, Get, Param, Patch, Body, Query, Req, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ResourcesService } from "./resources.service";

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; role: string };
}

@Controller("resources")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get("allocation-board")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getAllocationBoard(@Query("horizonWeeks") horizonWeeks?: string) {
    const weeks = horizonWeeks ? parseInt(horizonWeeks, 10) : 4;
    return this.resourcesService.getResourceAllocationBoard(weeks);
  }

  @Get("suggested-moves")
  @Roles("OWNER", "ADMIN")
  async getSuggestedMoves() {
    return this.resourcesService.getSuggestedMoves();
  }

  @Patch("tasks/:id/assign")
  @Roles("OWNER", "ADMIN")
  async applyMove(
    @Param("id") id: string,
    @Body() body: { assigneeId: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.resourcesService.applyMove(id, body.assigneeId, req.user.id);
  }
}
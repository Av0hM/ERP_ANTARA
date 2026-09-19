import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DecisionsService } from "./decisions.service";
import { CreateDecisionDto, UpdateDecisionDto, DecisionQueryDto } from "./dto/decision.dto";

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; role: string };
}

@Controller("decisions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DecisionsController {
  constructor(private readonly decisionsService: DecisionsService) {}

  @Post()
  @Roles("OWNER", "ADMIN", "MEMBER")
  create(@Body() dto: CreateDecisionDto, @Req() req: AuthenticatedRequest) {
    return this.decisionsService.create(dto, req.user.id);
  }

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  findAll(@Query() query: DecisionQueryDto) {
    return this.decisionsService.findAll(query);
  }

  @Get(":id")
  @Roles("OWNER", "ADMIN", "MEMBER")
  findOne(@Param("id") id: string) {
    return this.decisionsService.findOne(id);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN")
  update(@Param("id") id: string, @Body() dto: UpdateDecisionDto, @Req() req: AuthenticatedRequest) {
    return this.decisionsService.update(id, dto, req.user.id);
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN")
  delete(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.decisionsService.delete(id, req.user.id);
  }
}
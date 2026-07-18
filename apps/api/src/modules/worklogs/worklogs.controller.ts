import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateWorklogDto } from "./dto/create-worklog.dto";
import { StartWorklogSessionDto } from "./dto/start-worklog-session.dto";
import { StopWorklogSessionDto } from "./dto/stop-worklog-session.dto";
import { WorklogsService } from "./worklogs.service";

@Controller("worklogs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorklogsController {
  constructor(private readonly worklogsService: WorklogsService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  list() {
    return this.worklogsService.list();
  }

  @Get("summary")
  @Roles("OWNER", "ADMIN", "MEMBER")
  summary() {
    return this.worklogsService.summary();
  }

  @Post()
  @Roles("OWNER", "ADMIN", "MEMBER")
  create(@Body() payload: CreateWorklogDto) {
    return this.worklogsService.create(payload);
  }

  @Post("start")
  @Roles("OWNER", "ADMIN", "MEMBER")
  start(@Body() payload: StartWorklogSessionDto) {
    return this.worklogsService.startSession(payload);
  }

  @Patch(":id/stop")
  @Roles("OWNER", "ADMIN", "MEMBER")
  stop(@Param("id") id: string, @Body() payload: StopWorklogSessionDto) {
    return this.worklogsService.stopSession(id, payload);
  }
}

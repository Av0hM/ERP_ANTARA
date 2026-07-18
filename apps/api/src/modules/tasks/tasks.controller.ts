import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateTaskCommentDto } from "./dto/create-task-comment.dto";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { TasksService } from "./tasks.service";

@Controller("tasks")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  getTasks() {
    return this.tasksService.findAll();
  }

  @Get("activity")
  @Roles("OWNER", "ADMIN", "MEMBER")
  getActivityFeed() {
    return this.tasksService.getActivityFeed();
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  createTask(@Body() payload: CreateTaskDto) {
    return this.tasksService.create(payload);
  }

  @Patch(":id/status")
  @Roles("OWNER", "ADMIN", "MEMBER")
  updateStatus(@Param("id") id: string, @Body() payload: UpdateTaskStatusDto) {
    return this.tasksService.updateStatus(id, payload);
  }

  @Patch(":id/assign")
  @Roles("OWNER", "ADMIN")
  reassign(@Param("id") id: string, @Body() body: { assignedToId?: string }) {
    return this.tasksService.reassign(id, body.assignedToId ?? null);
  }

  @Post(":id/comments")
  @Roles("OWNER", "ADMIN", "MEMBER")
  addComment(@Param("id") id: string, @Body() payload: CreateTaskCommentDto) {
    return this.tasksService.addComment(id, payload);
  }
}

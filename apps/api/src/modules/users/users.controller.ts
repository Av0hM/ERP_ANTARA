import { Controller, Get, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("members")
  listMembers() {
    return this.usersService.listMembers();
  }
}

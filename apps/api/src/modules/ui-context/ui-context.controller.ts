import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UiContextService } from "./ui-context.service";
@Controller("ui")
@UseGuards(JwtAuthGuard)
export class UiContextController {
  constructor(private readonly context: UiContextService) {}
  @Get("context")
  @Header("Cache-Control", "no-store")
  get(@CurrentUser() actor: { id: string }) {
    return this.context.get(actor.id);
  }
}

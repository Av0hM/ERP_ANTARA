import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AiJobsService } from "./ai-jobs.service";

export class SubmitAiDto {
  @IsIn(["SUMMARY", "INSIGHTS"]) operation!: "SUMMARY" | "INSIGHTS";
  @IsOptional() @IsString() @MinLength(1) @MaxLength(12000) text?: string;
  @IsOptional() @IsString() @MaxLength(500) context?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) subsystemId?: string;
}
export class SummaryDto {
  @IsString() @MinLength(1) @MaxLength(12000) text!: string;
  @IsOptional() @IsString() @MaxLength(500) context?: string;
}
@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiJobsController {
  constructor(private readonly jobs: AiJobsService) {}
  @Post("summarize") @HttpCode(202) summarize(
    @CurrentUser() actor: { id: string },
    @Body() body: SummaryDto,
  ) {
    return this.jobs.submit(actor.id, { ...body, operation: "SUMMARY" });
  }
  @Get("readiness") health(@CurrentUser() actor: { id: string }) {
    return this.jobs.health(actor.id);
  }
  @Post("jobs") @HttpCode(202) submit(
    @CurrentUser() actor: { id: string },
    @Body() body: SubmitAiDto,
  ) {
    return this.jobs.submit(actor.id, body);
  }
  @Get("jobs") list(@CurrentUser() actor: { id: string }) {
    return this.jobs.list(actor.id);
  }
  @Get("jobs/:id") read(
    @CurrentUser() actor: { id: string },
    @Param("id") id: string,
  ) {
    return this.jobs.read(actor.id, id);
  }
  @Post("jobs/:id/cancel") cancel(
    @CurrentUser() actor: { id: string },
    @Param("id") id: string,
  ) {
    return this.jobs.cancel(actor.id, id);
  }
  @Get("reconciliation") reconcile(
    @CurrentUser() actor: { id: string },
    @Query("cursor") cursor?: string,
  ) {
    return this.jobs.reconcile(actor.id, cursor);
  }
}

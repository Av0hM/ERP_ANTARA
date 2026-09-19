import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Body, Post } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { IsOptional, IsString, IsInt, Min } from "class-validator";
import { AiService } from "./ai.service";

class SummarizeDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  context?: string;
}

class ScheduleRiskDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  horizonDays?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  simulations?: number;
}

@Controller("ai")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get("insights")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getInsights() {
    return this.aiService.getInsights();
  }

  @Get("bundle")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getBundle() {
    return this.aiService.getBundle();
  }

  @Get("reminders")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getReminders() {
    return this.aiService.getSmartReminders();
  }

  @Get("schedule")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getSchedule() {
    return this.aiService.getSchedulingRecommendations();
  }

  @Get("workload")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getWorkload() {
    return this.aiService.getWorkloadSuggestions();
  }

  @Get("schedule-risk")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getScheduleRisk(@Query() query: ScheduleRiskDto) {
    return this.aiService.getScheduleRisk(query.horizonDays ?? 14, query.simulations ?? 1000);
  }

  @Post("summarize")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async summarize(@Body() payload: SummarizeDto) {
    return this.aiService.summarizeText(payload);
  }
}

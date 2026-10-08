import {
  Controller,
  Module,
  Post,
  Body,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FilesModule } from "./files.module";
import { FilesService } from "./files.service";
import { ReportsModule } from "../reports/reports.module";
import { ReportsService } from "../reports/reports.service";
import { MeetingsModule } from "../meetings/meetings.module";
import { MeetingAutomationService } from "../meetings/meetings.service";
import { AuthorizationModule } from "../../common/authorization/authorization.module";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
class OutputDto {
  @IsOptional() @IsString() @MaxLength(200) subsystemId?: string;
}
@Controller("files/outputs")
@UseGuards(JwtAuthGuard)
export class FileOutputsController {
  constructor(
    private readonly files: FilesService,
    private readonly reports: ReportsService,
    private readonly meetings: MeetingAutomationService,
    private readonly core: CoreAuthorizationService,
  ) {}
  @Post("handoff")
  async handoff(@Body() body: OutputDto, @CurrentUser() actor: { id: string }) {
    const current = await this.core.actor(actor.id);
    if (!body.subsystemId && !current.globalAuthority)
      throw new ForbiddenException(
        "Select an administered subsystem for a persisted export",
      );
    this.core.managementScope(current, body.subsystemId);
    const content = await this.reports.generateMarkdownHandoff(
      actor.id,
      body.subsystemId,
    );
    return this.save(content, "EXPORT", actor.id, body.subsystemId);
  }
  @Post("meeting-report")
  async meeting(@Body() body: OutputDto, @CurrentUser() actor: { id: string }) {
    if (!body.subsystemId)
      throw new ForbiddenException("Meeting subsystem required");
    this.core.managementScope(
      await this.core.actor(actor.id),
      body.subsystemId,
    );
    const agenda = await this.meetings.generateMeetingAgenda(
      body.subsystemId,
      new Date(),
      actor.id,
    );
    return this.save(
      await this.meetings.generateAgendaMarkdown(agenda),
      "MEETING_REPORT",
      actor.id,
      body.subsystemId,
    );
  }
  private async save(
    content: string,
    category: "EXPORT" | "MEETING_REPORT",
    actorId: string,
    subsystemId?: string,
  ) {
    const dir = await mkdtemp(join(tmpdir(), "antara-output-"));
    try {
      const path = join(dir, "content");
      await writeFile(path, content, { mode: 0o600 });
      return await this.files.upload(
        {
          path,
          name:
            category === "EXPORT"
              ? "antara-handoff.md"
              : "antara-meeting-report.md",
          mimeType: "text/markdown",
          category,
        },
        actorId,
        subsystemId ? [subsystemId] : [],
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
@Module({
  imports: [FilesModule, ReportsModule, MeetingsModule, AuthorizationModule],
  controllers: [FileOutputsController],
})
export class FileOutputsModule {}

import { Test } from "@nestjs/testing";
import { fixtureCore } from "../../../test/authorization.fixture";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { FilesService } from "./files.service";
import { ReportsService } from "../reports/reports.service";
import { MeetingAutomationService } from "../meetings/meetings.service";
import { FileOutputsController } from "./file-outputs.module";
describe("Persisted generated report scope", () => {
  async function setup(role: "OWNER" | "ADMIN" | "MEMBER") {
    const fixture = await fixtureCore({
      user: {
        findUnique: jest.fn(async () => ({
          id: "actor",
          role,
          isActive: true,
          deletedAt: null,
          memberships:
            role === "OWNER"
              ? []
              : [
                  {
                    subsystemId: "adcs",
                    accessLevel: role === "ADMIN" ? "ADMIN" : "MEMBER",
                  },
                ],
        })),
      },
    });
    const files = { upload: jest.fn(async () => ({ id: "file" })) };
    const reports = {
      generateMarkdownHandoff: jest.fn(async () => "authorized handoff"),
    };
    const meetings = {
      generateMeetingAgenda: jest.fn(async () => ({})),
      generateAgendaMarkdown: jest.fn(async () => "authorized agenda"),
    };
    const module = await Test.createTestingModule({
      controllers: [FileOutputsController],
      providers: [
        { provide: FilesService, useValue: files },
        { provide: ReportsService, useValue: reports },
        { provide: MeetingAutomationService, useValue: meetings },
        { provide: CoreAuthorizationService, useValue: fixture.core },
      ],
    }).compile();
    return {
      controller: module.get(FileOutputsController),
      files,
      reports,
      meetings,
    };
  }
  it("OWNER may persist a global export with OWNER-only source scope", async () => {
    const f = await setup("OWNER");
    await f.controller.handoff({}, { id: "actor" });
    expect(f.files.upload).toHaveBeenCalledWith(
      expect.objectContaining({ category: "EXPORT" }),
      "actor",
      [],
    );
  });
  it("ADMIN must select a persisted export scope", async () => {
    const f = await setup("ADMIN");
    await expect(f.controller.handoff({}, { id: "actor" })).rejects.toThrow(
      "Select",
    );
    expect(f.reports.generateMarkdownHandoff).not.toHaveBeenCalled();
  });
  it("ADMIN cannot persist an unrelated export", async () => {
    const f = await setup("ADMIN");
    await expect(
      f.controller.handoff({ subsystemId: "payload" }, { id: "actor" }),
    ).rejects.toThrow();
    expect(f.files.upload).not.toHaveBeenCalled();
  });
  it("ADMIN export retains the exact selected scope", async () => {
    const f = await setup("ADMIN");
    await f.controller.handoff({ subsystemId: "adcs" }, { id: "actor" });
    expect(f.files.upload).toHaveBeenCalledWith(
      expect.objectContaining({ category: "EXPORT" }),
      "actor",
      ["adcs"],
    );
  });
  it("meeting report uses the same Drive-routed metadata path", async () => {
    const f = await setup("ADMIN");
    await f.controller.meeting({ subsystemId: "adcs" }, { id: "actor" });
    expect(f.files.upload).toHaveBeenCalledWith(
      expect.objectContaining({ category: "MEETING_REPORT" }),
      "actor",
      ["adcs"],
    );
  });
  it("MEMBER cannot persist administrative output", async () => {
    const f = await setup("MEMBER");
    await expect(
      f.controller.handoff({ subsystemId: "adcs" }, { id: "actor" }),
    ).rejects.toThrow();
    await expect(
      f.controller.meeting({ subsystemId: "adcs" }, { id: "actor" }),
    ).rejects.toThrow();
  });
});

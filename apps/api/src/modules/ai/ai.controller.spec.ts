import { AiJobsController } from "./ai-jobs.controller";
describe("AI submission controller", () => {
  it("uses authenticated identity and returns queued state", async () => {
    const jobs = {
      submit: jest.fn().mockResolvedValue({ id: "job", status: "QUEUED" }),
    };
    const controller = new AiJobsController(jobs as never);
    await expect(
      controller.summarize({ id: "member" }, { text: "Notes" }),
    ).resolves.toEqual({ id: "job", status: "QUEUED" });
    expect(jobs.submit).toHaveBeenCalledWith("member", {
      operation: "SUMMARY",
      text: "Notes",
    });
  });
});

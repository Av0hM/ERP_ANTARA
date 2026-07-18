import { AiController } from "./ai.controller";

describe("AiController", () => {
  const aiService = {
    getInsights: jest.fn(),
    getSmartReminders: jest.fn(),
    getSchedulingRecommendations: jest.fn(),
    getWorkloadSuggestions: jest.fn(),
    summarizeText: jest.fn(),
  };

  let controller: AiController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AiController(aiService as never);
  });

  it("delegates summary requests to the AI service", async () => {
    aiService.summarizeText.mockResolvedValue({
      summary: "Condensed summary",
      source: "openai",
    });

    await expect(
      controller.summarize({
        text: "Payload integration notes.",
        context: "Subsystem sync",
      }),
    ).resolves.toEqual({
      summary: "Condensed summary",
      source: "openai",
    });
  });
});

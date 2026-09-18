import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

@Injectable()
export class OpenAiIntegrationService {
  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(this.configService.get<string>("integrations.openaiApiKey"));
  }

  async summarize(text: string, context?: string) {
    const apiKey = this.configService.get<string>("integrations.openaiApiKey");
    if (!apiKey) {
      return null;
    }

    const model = this.configService.get<string>("integrations.openaiModel") ?? "gpt-4.1-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You summarize technical collaboration notes for satellite engineering teams. Keep the output concise, actionable, and grounded in the provided text.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [context ? `Context: ${context}` : null, `Text: ${text}`].filter(Boolean).join("\n\n"),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI summary failed: ${response.status}`);
    }

    const payload = (await response.json()) as OpenAiResponse;
    const summary =
      payload.output_text ??
      payload.output?.flatMap((entry) => entry.content ?? []).find((item) => item.type === "output_text" && item.text)?.text ??
      payload.output?.[0]?.content?.[0]?.text ??
      "";

    return summary || null;
  }
}

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

type FunctionCall = {
  name: string;
  arguments: string;
};

type OpenAiOutputEntry =
  | {
      type: "output_text";
      content?: Array<{ type?: string; text?: string }>;
    }
  | {
      type: "function_call";
      function_call: FunctionCall;
    };

type OpenAiToolResponse = {
  output?: OpenAiOutputEntry[];
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

  async callWithFunctions<T>(input: {
    systemPrompt: string;
    userPrompt: string;
    functions: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }>;
    functionCall?: "auto" | { name: string };
  }): Promise<{ functionCall: FunctionCall | null; text: string }> {
    const apiKey = this.configService.get<string>("integrations.openaiApiKey");
    if (!apiKey) {
      return { functionCall: null, text: "" };
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
            content: [{ type: "input_text", text: input.systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: input.userPrompt }],
          },
        ],
        tools: input.functions.map((f) => ({
          type: "function",
          name: f.name,
          description: f.description,
          parameters: f.parameters,
        })),
        tool_choice: input.functionCall ?? "auto",
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI function call failed: ${response.status}`);
    }

    const payload = (await response.json()) as OpenAiToolResponse;
    const functionCall = payload.output?.find((entry) => entry.type === "function_call")?.function_call ?? null;
    const text = payload.output
      ?.filter((entry): entry is OpenAiOutputEntry & { type: "output_text" } => entry.type === "output_text")
      .flatMap((entry) => entry.content ?? [])
      .find((item) => item.type === "output_text" && item.text)?.text ?? "";

    return { functionCall, text };
  }
}

import { Injectable } from "@nestjs/common";
import { AiConfig } from "./ai.config";
import {
  AiFailure,
  AiProvider,
  aiSystemInstruction,
  outputSchema,
  parseOutput,
} from "./ai.provider";

@Injectable()
export class OllamaAiProvider extends AiProvider {
  constructor(private readonly config: AiConfig) {
    super();
  }

  private async request(path: string, body?: object) {
    if (!this.config.enabled) throw new AiFailure("AI_DISABLED");
    try {
      const response = await fetch(new URL(path, this.config.baseUrl), {
        method: body ? "POST" : "GET",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (!response.ok)
        throw new AiFailure(
          response.status === 404
            ? "MODEL_UNAVAILABLE"
            : "PROVIDER_UNAVAILABLE",
          response.status >= 500 || response.status === 429,
        );
      // Bound even a misconfigured/hostile provider response before JSON parsing.
      const reader = response.body?.getReader();
      if (!reader) throw new AiFailure("INVALID_MODEL_OUTPUT");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          throw new AiFailure("INVALID_MODEL_OUTPUT");
        }
        chunks.push(next.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch (error) {
      if (error instanceof AiFailure) throw error;
      if (error instanceof SyntaxError)
        throw new AiFailure("INVALID_MODEL_OUTPUT");
      throw new AiFailure("PROVIDER_UNAVAILABLE", true);
    }
  }
  async generate(context: unknown, operation: string) {
    const response = await this.request("/api/generate", {
      model: this.config.model,
      stream: false,
      format: outputSchema,
      system: aiSystemInstruction,
      prompt: JSON.stringify({ operation, untrustedContextData: context }),
      options: { temperature: 0, num_predict: 2048 },
    });
    if (
      !response ||
      typeof response !== "object" ||
      !("done" in response) ||
      response.done !== true ||
      !("response" in response) ||
      typeof response.response !== "string"
    )
      throw new AiFailure("INVALID_MODEL_OUTPUT");
    try {
      return parseOutput(JSON.parse(response.response));
    } catch {
      throw new AiFailure("INVALID_MODEL_OUTPUT");
    }
  }
  async readiness() {
    if (!this.config.enabled) return "disabled" as const;
    try {
      await this.request("/api/show", { model: this.config.model });
      return "available" as const;
    } catch {
      return "temporarily unavailable" as const;
    }
  }
}

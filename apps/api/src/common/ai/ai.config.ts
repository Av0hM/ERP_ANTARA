import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AiConfig {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  readonly workerEnabled: boolean;

  constructor(config: ConfigService) {
    const flag = config.get<string>("AI_ENABLED");
    if (flag && !["true", "false"].includes(flag))
      throw new Error("Invalid AI_ENABLED");
    this.enabled = flag === "true";
    this.workerEnabled = config.get<string>("AI_WORKER_ENABLED") !== "false";
    this.baseUrl = config.get<string>("OLLAMA_BASE_URL") ?? "";
    this.model = config.get<string>("OLLAMA_MODEL") ?? "";
    const number = (
      name: string,
      fallback: number,
      min: number,
      max: number,
    ) => {
      const value = Number(config.get<string>(name) ?? fallback);
      if (!Number.isInteger(value) || value < min || value > max)
        throw new Error(`Invalid ${name}`);
      return value;
    };
    this.timeoutMs = number("OLLAMA_REQUEST_TIMEOUT_MS", 60000, 1000, 180000);
    this.maxAttempts = number("AI_MAX_RETRIES", 2, 0, 5) + 1;
    this.retryDelayMs = number("AI_RETRY_BASE_DELAY_MS", 5000, 1000, 60000);
    if (this.enabled) {
      let url: URL;
      try {
        url = new URL(this.baseUrl);
      } catch {
        throw new Error("Invalid OLLAMA_BASE_URL");
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        throw new Error("Invalid OLLAMA_BASE_URL");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(this.model))
        throw new Error("Invalid OLLAMA_MODEL");
    }
  }
}

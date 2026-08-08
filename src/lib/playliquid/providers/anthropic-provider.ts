// Anthropic (Claude) provider adapter — uses the Anthropic Messages API.
// Reads ANTHROPIC_API_KEY + ANTHROPIC_MODEL env vars.

import type {
  LLMProviderAdapter,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../llm-provider-adapter";

export class AnthropicProviderAdapter implements LLMProviderAdapter {
  readonly name = "anthropic";
  readonly model: string;

  constructor() {
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";
  }

  private get apiKey(): string {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY env var is required when LLM_PROVIDER=anthropic");
    return key;
  }

  async completeChat(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    // Anthropic splits system message from the messages array.
    const systemMsg = req.messages.find((m) => m.role === "system");
    const userMsgs = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      messages: userMsgs,
    };
    if (systemMsg) body.system = systemMsg.content;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      content: text,
      provider: this.name,
      model: this.model,
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
      },
    };
  }
}

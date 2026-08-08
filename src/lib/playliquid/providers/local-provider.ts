// Local model provider adapter — uses an OpenAI-compatible local endpoint
// (Ollama, LM Studio, vLLM, etc.).
// Falls back to a deterministic rule-based generator if no endpoint is configured.

import type {
  LLMProviderAdapter,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../llm-provider-adapter";

export class LocalProviderAdapter implements LLMProviderAdapter {
  readonly name = "local";
  readonly model: string;

  constructor() {
    this.model = process.env.LOCAL_LLM_MODEL ?? "local";
  }

  private get baseUrl(): string | null {
    return process.env.LOCAL_LLM_BASE_URL ?? null;
  }

  async completeChat(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = this.baseUrl;

    if (!url) {
      const userMsg = req.messages.find((m) => m.role === "user");
      const content = userMsg?.content ?? "";
      if (content.includes("JSON") || content.includes("json")) {
        return {
          content: JSON.stringify({
            name: "@local/generated",
            displayName: content.slice(0, 40),
            family: "building",
            description: content.slice(0, 120),
            capabilities: [],
            provides: [],
            requires: [],
            spatial: { scale: "medium", anchorable: true },
          }),
          provider: this.name,
          model: this.model,
        };
      }
      return {
        content: `# Local generated package\n\nGenerated from: "${content.slice(0, 100)}"\n\n(Local provider — set LOCAL_LLM_BASE_URL for Ollama/LM Studio.)`,
        provider: this.name,
        model: this.model,
      };
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: req.messages,
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;

    const res = await fetch(`${url.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Local LLM API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return {
      content: data.choices[0]?.message?.content ?? "",
      provider: this.name,
      model: this.model,
    };
  }
}

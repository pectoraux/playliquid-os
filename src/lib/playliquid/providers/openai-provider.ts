// OpenAI provider adapter — uses the OpenAI-compatible chat completions API.
// Reads OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_MODEL env vars.

import type {
  LLMProviderAdapter,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../llm-provider-adapter";

export class OpenAIProviderAdapter implements LLMProviderAdapter {
  readonly name = "openai";
  readonly model: string;

  constructor() {
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o";
  }

  private get baseUrl(): string {
    return (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  }

  private get apiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY env var is required when LLM_PROVIDER=openai");
    return key;
  }

  async completeChat(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: req.messages,
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? "",
      provider: this.name,
      model: this.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
    };
  }
}

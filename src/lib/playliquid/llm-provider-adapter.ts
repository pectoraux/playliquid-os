// LLM Provider Adapter — the provider-agnostic boundary.
//
// PlayLiquid owns the SPECIFICATION and the PROMPT. It does NOT own the
// implementation backend. The user's LLM — whichever they choose —
// implements packages against PlayLiquid's contracts.
//
//   PlayLiquid
//       │
//       │ specification + compiled prompt
//       ▼
//   LLMProviderAdapter  ← this interface
//       │
//   ┌───┼───────────┐
//   │   │           │
//  Z.ai OpenAI    Anthropic
//   │   │           │
// Gemini  local    enterprise
//   │
//  etc.
//
// A provider adapter implements two operations:
//   1. completeChat() — used by the AI Architect (NL → canonical specification)
//   2. completeImplementation() — used by the Package implementer
//
// PlayLiquid knows nothing about which provider is active. The provider is
// selected via the LLM_PROVIDER env var and recorded in the package's
// provenance so the same specification can later be re-implemented by a
// different model without changing PlayLiquid.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  thinking?: "disabled" | "enabled";
  maxTokens?: number;
}

export interface ChatCompletionResponse {
  content: string;
  provider: string;
  model?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface LLMProviderAdapter {
  /** The provider name recorded in package provenance (e.g. "zai", "openai"). */
  readonly name: string;

  /** The model identifier (e.g. "glm-4-plus", "gpt-4o"). */
  readonly model: string;

  /** Complete a chat conversation. Used by the AI Architect + Package implementer. */
  completeChat(req: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

// ── Provider registry ─────────────────────────────────────────────
// Each provider adapter is registered here. The active provider is selected
// by the LLM_PROVIDER env var at runtime. New providers are added by
// implementing LLMProviderAdapter and registering below — no other code
// in the system changes.

import { ZAIProviderAdapter } from "./providers/zai-provider";
import { OpenAIProviderAdapter } from "./providers/openai-provider";
import { AnthropicProviderAdapter } from "./providers/anthropic-provider";
import { LocalProviderAdapter } from "./providers/local-provider";

let cached: LLMProviderAdapter | null = null;

export function getLLMProvider(): LLMProviderAdapter {
  if (cached) return cached;

  const providerName = (process.env.LLM_PROVIDER ?? "zai").toLowerCase();

  switch (providerName) {
    case "zai":
      cached = new ZAIProviderAdapter();
      break;
    case "openai":
      cached = new OpenAIProviderAdapter();
      break;
    case "anthropic":
    case "claude":
      cached = new AnthropicProviderAdapter();
      break;
    case "local":
    case "ollama":
    case "lmstudio":
      cached = new LocalProviderAdapter();
      break;
    default:
      throw new Error(
        `Unknown LLM_PROVIDER "${providerName}". Supported: zai, openai, anthropic, local.`
      );
  }

  return cached;
}

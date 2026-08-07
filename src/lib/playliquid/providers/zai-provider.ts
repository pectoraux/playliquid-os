// Z.ai provider adapter — wraps z-ai-web-dev-sdk.
// This is the default provider. It reads ZAI_* env vars (Vercel-compatible)
// and falls back to the file-based config for local dev.

import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";
import os from "os";
import type {
  LLMProviderAdapter,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../llm-provider-adapter";

type ZaiConfig = {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  token?: string;
  userId?: string;
};

let zaiInstance: ZAI | null = null;

async function getZAI(): Promise<ZAI> {
  if (zaiInstance) return zaiInstance;

  const fromEnv: ZaiConfig | null =
    process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY
      ? {
          baseUrl: process.env.ZAI_BASE_URL,
          apiKey: process.env.ZAI_API_KEY,
          chatId: process.env.ZAI_CHAT_ID,
          token: process.env.ZAI_TOKEN,
          userId: process.env.ZAI_USER_ID,
        }
      : null;

  if (fromEnv) {
    zaiInstance = new ZAI(fromEnv);
    return zaiInstance;
  }

  // Fallback: file config (local dev only).
  const configPaths = [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(os.homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
  ];
  for (const filePath of configPaths) {
    try {
      const configStr = await fs.promises.readFile(filePath, "utf-8");
      const config = JSON.parse(configStr) as ZaiConfig;
      if (config.baseUrl && config.apiKey) {
        zaiInstance = new ZAI(config);
        return zaiInstance;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Error reading z-ai config at ${filePath}:`, err);
      }
    }
  }

  throw new Error(
    "Z.ai config not found. Set ZAI_BASE_URL + ZAI_API_KEY env vars, or create .z-ai-config."
  );
}

export class ZAIProviderAdapter implements LLMProviderAdapter {
  readonly name = "zai";
  readonly model = "glm-4-plus";

  async completeChat(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      thinking: { type: req.thinking === "enabled" ? "enabled" : "disabled" },
    });
    return {
      content: completion.choices[0]?.message?.content ?? "",
      provider: this.name,
      model: this.model,
    };
  }
}

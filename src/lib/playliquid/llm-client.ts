// Vercel-compatible z-ai-web-dev-sdk client.
// The SDK's ZAI.create() reads a .z-ai-config file from disk — that doesn't
// work on Vercel's read-only serverless filesystem. This wrapper reads the
// same values from env vars and instantiates the client directly.
//
// Env vars (all server-only):
//   ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_TOKEN, ZAI_USER_ID
//
// Falls back to ZAI.create() (file config) if env vars are missing — keeps
// local dev identical to production.

import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";
import os from "os";

type ZaiConfig = {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  token?: string;
  userId?: string;
};

let cached: ZAI | null = null;

export async function getZAI(): Promise<ZAI> {
  if (cached) return cached;

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
    cached = new ZAI(fromEnv);
    return cached;
  }

  // Fallback: read the file config (local dev only).
  // Mirrors the SDK's own loadConfig() so behavior stays identical.
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
        cached = new ZAI(config);
        return cached;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`Error reading z-ai config at ${filePath}:`, err);
      }
    }
  }

  throw new Error(
    "z-ai config not found. Set ZAI_BASE_URL + ZAI_API_KEY env vars, or create .z-ai-config."
  );
}

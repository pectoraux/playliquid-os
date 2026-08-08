// ════════════════════════════════════════════════════════════════
// USER-OWNED LLM BOUNDARY
// ════════════════════════════════════════════════════════════════
//
// The canonical LLM flow is USER-OWNED:
//
//   PlayLiquid produces a Specification + a compiled Prompt
//       ↓
//   The user takes the prompt to THEIR LLM (ChatGPT, Claude, Gemini, Z.ai, local)
//       ↓
//   The user pastes the result back into PlayLiquid
//       ↓
//   PlayLiquid certifies + registers the package
//
// The server-side LLMProviderAdapter remains as an OPTIONAL CONVENIENCE
// adapter — useful for demos and automated flows — but it is NOT the
// architectural foundation. PlayLiquid should not need everyone's LLM
// API keys.

export interface CompiledPromptForUser {
  specification: Record<string, unknown>;
  prompt: string;
  // Where the user can take this prompt
  openTargets: Array<{
    name: string;
    url: string; // the prompt is appended as a query param or pasted manually
    description: string;
  }>;
}

// Build the "open in..." targets for a compiled prompt.
export function getOpenTargets(prompt: string): Array<{ name: string; url: string; description: string }> {
  // We can't auto-open with the prompt in a URL for most providers (too long),
  // but we can link to the chat interface and tell the user to paste.
  return [
    {
      name: "ChatGPT",
      url: "https://chat.openai.com/",
      description: "Open ChatGPT and paste the prompt",
    },
    {
      name: "Claude",
      url: "https://claude.ai/",
      description: "Open Claude and paste the prompt",
    },
    {
      name: "Gemini",
      url: "https://gemini.google.com/",
      description: "Open Gemini and paste the prompt",
    },
    {
      name: "Z.ai",
      url: "https://chat.z.ai/",
      description: "Open Z.ai and paste the prompt",
    },
  ];
}

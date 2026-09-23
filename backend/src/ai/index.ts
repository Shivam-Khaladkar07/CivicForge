import type { AIProvider } from "./provider.js";
import { DemoAIProvider } from "./demoProvider.js";
import { LiveAIProvider } from "./liveProvider.js";
import { readSecret } from "../config.js";

export function getAIProvider(): AIProvider {
  const key = readSecret("AI_API_KEY", readSecret("OPENAI_API_KEY"));
  if (!key) return new DemoAIProvider();
  return new LiveAIProvider(
    key,
    process.env.AI_API_BASE_URL || "https://api.openai.com/v1",
    process.env.AI_MODEL || "gpt-4o-mini",
    process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small"
  );
}

import type { AIProvider, ClassifyResult } from "./provider.js";
import { DemoAIProvider } from "./demoProvider.js";

type ChatResponse = { choices?: { message?: { content?: string } }[] };
type EmbeddingResponse = { data?: { embedding?: number[] }[] };

export class LiveAIProvider implements AIProvider {
  name: string;
  mode: "live" = "live";
  private readonly fallback = new DemoAIProvider();
  private readonly fallbackReasons = new Set<string>();

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly embeddingModel: string
  ) {
    this.name = `Live AI (${model})`;
  }

  getFallbackReasons() {
    return [...this.fallbackReasons];
  }

  private recordFallback(operation: string, error: unknown) {
    const reason = error instanceof Error
      ? error.name === "AbortError" ? "request timed out" : error.message.slice(0, 160)
      : "unknown provider failure";
    this.fallbackReasons.add(`${operation}: ${reason}`);
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Live AI request failed with status ${response.status}`);
      return await response.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async classify(text: string): Promise<ClassifyResult> {
    try {
      const response = await this.request<ChatResponse>("/chat/completions", {
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Classify a Jharkhand societal challenge. Return JSON with categorySlug, secondarySlug, subDomain, suggestedTags, skills, technologies, urgencyHint from 1 to 5, confidence from 0 to 1, and summary. Allowed categories: education, healthcare, agriculture, water, sanitation, environment, energy, accessibility, urban_infra, rural_livelihoods, public_admin. This is advisory decision support." },
          { role: "user", content: text.slice(0, 8000) },
        ],
      });
      const parsed = JSON.parse(response.choices?.[0]?.message?.content || "{}") as Partial<ClassifyResult>;
      if (!parsed.categorySlug || !Array.isArray(parsed.skills) || !Array.isArray(parsed.technologies)) throw new Error("Live AI returned an invalid classification");
      return {
        categorySlug: parsed.categorySlug,
        secondarySlug: parsed.secondarySlug,
        subDomain: parsed.subDomain,
        suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
        skills: parsed.skills,
        technologies: parsed.technologies,
        urgencyHint: Math.min(5, Math.max(1, Number(parsed.urgencyHint || 3))),
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence || 0.5))),
        summary: parsed.summary || "Live AI analysis completed; human review is required.",
        pipeline: [
          { id: "lang", label: "Language understood", done: true },
          { id: "domain", label: "Domain identified", done: true },
          { id: "related", label: "Related challenges searched", done: true },
          { id: "priority", label: "Priority calculated", done: true },
          { id: "skills", label: "Required skills extracted", done: true },
          { id: "institutions", label: "Institutions matched", done: false },
        ],
      };
    } catch (error) {
      this.recordFallback("classification", error);
      return this.fallback.classify(text);
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.request<EmbeddingResponse>("/embeddings", { model: this.embeddingModel, input: text.slice(0, 8000) });
      const embedding = response.data?.[0]?.embedding;
      if (!embedding?.length) throw new Error("Live AI returned no embedding");
      return embedding;
    } catch (error) {
      this.recordFallback("embedding", error);
      return this.fallback.embed(text);
    }
  }

  async summarize(text: string): Promise<string> {
    try {
      const response = await this.request<ChatResponse>("/chat/completions", {
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: "Summarize this societal challenge in no more than 90 words. Do not invent facts. State that human validation is required." },
          { role: "user", content: text.slice(0, 8000) },
        ],
      });
      const summary = response.choices?.[0]?.message?.content?.trim();
      if (!summary) throw new Error("Live AI returned no summary");
      return summary;
    } catch (error) {
      this.recordFallback("summary", error);
      return this.fallback.summarize(text);
    }
  }
}

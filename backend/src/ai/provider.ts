export interface ClassifyResult {
  categorySlug: string;
  secondarySlug?: string;
  subDomain?: string;
  suggestedTags: string[];
  skills: string[];
  technologies: string[];
  urgencyHint: number;
  confidence: number;
  summary: string;
  pipeline: { id: string; label: string; done: boolean }[];
}

export interface AIProvider {
  name: string;
  mode: "demo" | "live";
  classify(text: string): Promise<ClassifyResult>;
  embed(text: string): Promise<number[]>;
  summarize(text: string): Promise<string>;
  getFallbackReasons?(): string[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

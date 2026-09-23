import { v4 as uuid } from "uuid";
import { query } from "../db/index.js";
import { getAIProvider } from "../ai/index.js";
import { computePriority } from "./priority.js";
import { similarChallenges } from "./similarity.js";
import { audit, notify, activity } from "./audit.js";
import type { AuthUser } from "../types.js";

export async function persistAnalysis(challengeId: string, title: string, description: string) {
  const ai = getAIProvider();
  const classified = await ai.classify(`${title} ${description}`);
  const summary = await ai.summarize(description);
  const embedding = await ai.embed(`${title} ${description}`);
  const fallbackReasons = ai.getFallbackReasons?.() ?? [];
  const persistedMode = fallbackReasons.length > 0 ? "demo_fallback" : ai.mode;
  await query(
    `INSERT INTO ai_analysis (id, challenge_id, provider, mode, category_slug, secondary_slug, sub_domain, summary, suggested_tags, skills_json, technologies_json, pipeline_json, confidence, confidence_label, fallback_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      uuid(),
      challengeId,
      ai.name,
      persistedMode,
      classified.categorySlug,
      classified.secondarySlug ?? null,
      classified.subDomain ?? null,
      summary,
      JSON.stringify(classified.suggestedTags),
      JSON.stringify(classified.skills),
      JSON.stringify(classified.technologies),
      JSON.stringify(classified.pipeline),
      classified.confidence,
      persistedMode === "live" ? "Live AI system score — not measured accuracy" : "Demo / system score — not a measured ML accuracy",
      fallbackReasons.length ? fallbackReasons.join("; ") : null,
    ]
  );
  await query(`INSERT INTO ai_embeddings (id, challenge_id, vector_json, provider) VALUES ($1,$2,$3,$4)`, [
    uuid(),
    challengeId,
    JSON.stringify(embedding),
    ai.name,
  ]);
  const priority = await computePriority(challengeId);
  const similar = await similarChallenges(challengeId);
  for (const s of similar.slice(0, 5)) {
    await query(
      `INSERT INTO duplicate_reviews (id, challenge_id, related_challenge_id, similarity, reason, relation_type, decision)
       VALUES ($1,$2,$3,$4,$5,$6,'pending')`,
      [uuid(), challengeId, s.challenge_id, s.similarity_pct, s.reason, s.relation_type]
    );
  }
  return { classified, summary, mode: persistedMode, provider: ai.name, fallback_reason: fallbackReasons.join("; ") || null, priority, similar };
}

export async function createChallenge(
  user: AuthUser,
  body: {
    title: string;
    description: string;
    category_slug: string;
    district: string;
    block_or_ward?: string;
    severity: number;
    urgency?: number;
    population_estimate?: number | null;
    lat?: number;
    lng?: number;
    locality?: string;
    language?: string;
    impact_description?: string;
    golden_key?: string;
    is_demo?: boolean;
  }
) {
  const cat = (
    await query<{ id: string }>("SELECT id FROM challenge_categories WHERE slug = $1", [body.category_slug])
  ).rows[0];
  if (!cat) throw new Error("Unknown category");
  const id = uuid();
  await query(
    `INSERT INTO challenges (id, title, description, category_id, reporter_id, status, district, block_or_ward, severity, urgency, population_estimate, is_demo, language, impact_description, golden_key)
     VALUES ($1,$2,$3,$4,$5,'ai_screened',$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
      body.title,
      body.description,
      cat.id,
      user.id,
      body.district,
      body.block_or_ward ?? null,
      body.severity,
      body.urgency ?? body.severity,
      body.population_estimate ?? null,
      body.is_demo !== false,
      body.language ?? "en",
      body.impact_description ?? null,
      body.golden_key ?? null,
    ]
  );
  if (body.lat && body.lng) {
    await query(
      `INSERT INTO challenge_locations (id, challenge_id, district, locality, lat, lng) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuid(), id, body.district, body.locality ?? body.district, Number(body.lat), Number(body.lng)]
    );
  }
  const analysis = await persistAnalysis(id, body.title, body.description);
  await query("UPDATE challenges SET status = 'validation_pending', updated_at = NOW() WHERE id = $1", [id]);
  await audit(user.id, "challenge.create", "challenge", id, body.title);
  await activity("challenge", id, user.id, "submitted", "Citizen submitted a challenge");
  const govUsers = await query<{ id: string }>("SELECT id FROM users WHERE role_id = 'government'");
  for (const g of govUsers.rows) {
    await notify(g.id, "Validation pending", `${body.title} (${body.district})`, `/government/challenges/${id}`);
  }
  return { id, analysis };
}

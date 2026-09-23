import { query, queryOne } from "../db/index.js";
import { cosineSimilarity } from "../ai/provider.js";
import type { AuthUser } from "../types.js";

export async function similarChallenges(challengeId: string, limit = 8, viewer?: AuthUser) {
  const mine = await queryOne<{
    vector_json: string;
    district: string;
    category_id: string;
    created_at: string;
    title: string;
  }>(
    `SELECT e.vector_json, c.district, c.category_id, c.created_at, c.title
     FROM ai_embeddings e JOIN challenges c ON c.id = e.challenge_id
     WHERE e.challenge_id = $1 ORDER BY e.created_at DESC LIMIT 1`,
    [challengeId]
  );
  if (!mine) return [];
  const params: unknown[] = [challengeId];
  let visibility = "";
  if (viewer) {
    params.push(viewer.id);
    const mayReadSensitive = viewer.role_id === "admin" || viewer.permissions.includes("citizen:read_sensitive");
    params.push(mayReadSensitive);
    const mayReadUnvalidated = viewer.role_id !== "citizen" || viewer.permissions.includes("challenge:read_all");
    params.push(mayReadUnvalidated);
    visibility = ` AND (c.reporter_id = $2 OR ((COALESCE(c.is_sensitive, FALSE) = FALSE OR $3::boolean) AND (c.status = 'validated' OR $4::boolean)))`;
  }
  const others = await query<{
    challenge_id: string;
    vector_json: string;
    title: string;
    district: string;
    status: string;
    category_id: string;
    created_at: string;
    block_or_ward: string | null;
  }>(
    `SELECT e.challenge_id, e.vector_json, c.title, c.district, c.status, c.category_id, c.created_at, c.block_or_ward
     FROM ai_embeddings e JOIN challenges c ON c.id = e.challenge_id
     WHERE e.challenge_id <> $1${visibility}`,
    params
  );
  const v = JSON.parse(mine.vector_json) as number[];
  return others.rows
    .map((o) => {
      const semantic = cosineSimilarity(v, JSON.parse(o.vector_json));
      const locBoost = o.district === mine.district ? 0.08 : 0;
      const domainBoost = o.category_id === mine.category_id ? 0.06 : 0;
      const days = Math.abs(new Date(o.created_at).getTime() - new Date(mine.created_at).getTime()) / 86400000;
      const temporal = days < 180 ? 0.04 : 0;
      const similarity = Math.min(0.99, semantic + locBoost + domainBoost + temporal);
      const relation_type = similarity >= 0.78 ? "duplicate_candidate" : "related";
      const reasons = [
        `Semantic overlap ${(semantic * 100).toFixed(0)}%`,
        o.district === mine.district ? `Same district (${o.district})` : `Different district (${o.district})`,
        o.category_id === mine.category_id ? "Same primary domain" : "Adjacent domain",
      ];
      return {
        challenge_id: o.challenge_id,
        title: o.title,
        district: o.district,
        status: o.status,
        similarity,
        similarity_pct: Math.round(similarity * 100),
        relation_type,
        reason: reasons.join(" · "),
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

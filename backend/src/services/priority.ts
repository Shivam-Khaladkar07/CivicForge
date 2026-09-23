import { v4 as uuid } from "uuid";
import { query, queryOne } from "../db/index.js";

export interface WeightSet {
  population: number;
  urgency: number;
  recurrence: number;
  evidence: number;
  geographic_spread: number;
  validation: number;
  strategic: number;
}

export const DEFAULT_PRIORITY_WEIGHTS: WeightSet = {
  population: 0.2,
  urgency: 0.2,
  recurrence: 0.15,
  evidence: 0.1,
  geographic_spread: 0.1,
  validation: 0.15,
  strategic: 0.1,
};

export const DEFAULT_MATCH_WEIGHTS = {
  category: 0.35,
  expertise: 0.25,
  labs: 0.15,
  location: 0.1,
  previous: 0.1,
  availability: 0.05,
};

export async function getPriorityWeights(): Promise<WeightSet> {
  const row = await queryOne<{ value_json: string }>(
    "SELECT value_json FROM system_settings WHERE key = $1",
    ["priority_weights"]
  );
  if (!row) return DEFAULT_PRIORITY_WEIGHTS;
  try {
    return { ...DEFAULT_PRIORITY_WEIGHTS, ...JSON.parse(row.value_json) };
  } catch {
    return DEFAULT_PRIORITY_WEIGHTS;
  }
}

export async function getMatchWeights() {
  const row = await queryOne<{ value_json: string }>(
    "SELECT value_json FROM system_settings WHERE key = $1",
    ["match_weights"]
  );
  if (!row) return DEFAULT_MATCH_WEIGHTS;
  try {
    return { ...DEFAULT_MATCH_WEIGHTS, ...JSON.parse(row.value_json) };
  } catch {
    return DEFAULT_MATCH_WEIGHTS;
  }
}

const STRATEGIC = new Set(["Palamu", "Dumka", "Giridih", "Hazaribagh"]);

export async function computePriority(challengeId: string) {
  const ch = await queryOne<{
    severity: number;
    urgency: number | null;
    population_estimate: number | null;
    district: string;
    cluster_id: string | null;
    status: string;
  }>(
    "SELECT severity, urgency, population_estimate, district, cluster_id, status FROM challenges WHERE id = $1",
    [challengeId]
  );
  if (!ch) throw new Error("Challenge not found");

  const weights = await getPriorityWeights();
  const media = await queryOne<{ c: string }>("SELECT COUNT(*)::text AS c FROM challenge_media WHERE challenge_id = $1", [
    challengeId,
  ]);
  const clusterSize = ch.cluster_id
    ? await queryOne<{ c: string }>("SELECT COUNT(*)::text AS c FROM challenges WHERE cluster_id = $1", [ch.cluster_id])
    : { c: "1" };
  const districtsInCluster = ch.cluster_id
    ? await queryOne<{ c: string }>(
        "SELECT COUNT(DISTINCT district)::text AS c FROM challenges WHERE cluster_id = $1",
        [ch.cluster_id]
      )
    : { c: "1" };

  const urgencyN = Math.min(5, Math.max(1, Number(ch.urgency ?? ch.severity))) / 5;
  const popN = Math.min(1, (ch.population_estimate ?? 500) / 20000);
  const recurrenceN = Math.min(1, Number(clusterSize?.c ?? 1) / 8);
  const evidenceN = Math.min(1, Number(media?.c ?? 0) / 3 + 0.25);
  const geoN = Math.min(1, Number(districtsInCluster?.c ?? 1) / 4);
  const validationN = ch.status === "validated" ? 1 : ch.status === "needs_information" ? 0.4 : 0.2;
  const strategicN = STRATEGIC.has(ch.district) ? 1 : 0.45;

  const weighted =
    weights.population * popN +
    weights.urgency * urgencyN +
    weights.recurrence * recurrenceN +
    weights.evidence * evidenceN +
    weights.geographic_spread * geoN +
    weights.validation * validationN +
    weights.strategic * strategicN;

  const score = Math.round(Math.min(100, Math.max(0, weighted * 100)));
  const breakdown = {
    population: Math.round(popN * 100),
    urgency: Math.round(urgencyN * 100),
    recurrence: Math.round(recurrenceN * 100),
    evidence: Math.round(evidenceN * 100),
    geographic_spread: Math.round(geoN * 100),
    validation: Math.round(validationN * 100),
    strategic_importance: Math.round(strategicN * 100),
  };
  const formulaNote =
    "CivicForge Decision Support Score (0–100). Admin-configurable weights. Not a scientific or official government formula.";

  const id = uuid();
  await query(
    `INSERT INTO priority_scores (id, challenge_id, score, breakdown_json, weights_json, formula_note)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, challengeId, score, JSON.stringify(breakdown), JSON.stringify(weights), formulaNote]
  );
  return { id, score, label: "CivicForge Decision Support Score", breakdown, weights, formulaNote };
}

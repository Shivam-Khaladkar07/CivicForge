import { v4 as uuid } from "uuid";
import { query } from "../db/index.js";
import { getMatchWeights } from "./priority.js";

function pct(n: number) {
  return Math.round(Math.min(1, Math.max(0, n)) * 100);
}

export async function recommendUniversities(clusterId: string) {
  const cluster = (
    await query<{ id: string; category_id: string | null; district_focus: string | null }>(
      "SELECT id, category_id, district_focus FROM challenge_clusters WHERE id = $1",
      [clusterId]
    )
  ).rows[0];
  if (!cluster) throw new Error("Cluster not found");

  const cat = cluster.category_id
    ? (
        await query<{ slug: string }>("SELECT slug FROM challenge_categories WHERE id = $1", [cluster.category_id])
      ).rows[0]
    : null;

  const universities = (
    await query<{
      id: string;
      name: string;
      district: string;
      capacity: number | null;
      technologies: string | null;
    }>("SELECT id, name, district, capacity, technologies FROM universities")
  ).rows;

  const weights = await getMatchWeights();
  const results = [];

  for (const uni of universities) {
    const depts = (await query<{ domain: string }>("SELECT domain FROM departments WHERE university_id = $1", [uni.id])).rows;
    const labs = (
      await query<{ capability: string }>("SELECT capability FROM laboratories WHERE university_id = $1", [uni.id])
    ).rows;
    const tags = (
      await query<{ tag: string }>(
        `SELECT e.tag FROM expertise e JOIN faculty f ON f.id = e.faculty_id WHERE f.university_id = $1`,
        [uni.id]
      )
    ).rows;
    const prior = (
      await query<{ title: string }>("SELECT title FROM institution_projects WHERE university_id = $1", [uni.id])
    ).rows;
    const active = (
      await query<{ c: string }>("SELECT COUNT(*)::text AS c FROM projects WHERE university_id = $1 AND stage <> 'completed'", [
        uni.id,
      ])
    ).rows[0];

    const domains = new Set(depts.map((d) => d.domain));
    const catHit = cat && (domains.has(cat.slug) || domains.has("agriculture") || domains.has("energy")) ? (domains.has(cat.slug) ? 0.96 : 0.7) : 0.25;
    const slugWords = (cat?.slug ?? "").replaceAll("_", " ");
    const expertiseHit = tags.length
      ? tags.some((t) => t.tag.toLowerCase().includes(slugWords) || slugWords.includes(t.tag.toLowerCase()) || /electrical|irrigation|iot|energy|agricultur/.test(t.tag.toLowerCase()))
        ? 0.9
        : 0.45
      : 0.2;
    const labHit = labs.length ? Math.min(0.95, 0.4 + labs.length * 0.18) : 0.2;
    const locHit = cluster.district_focus && uni.district === cluster.district_focus ? 0.88 : 0.55;
    const prevHit = prior.length ? Math.min(0.95, 0.5 + prior.length * 0.15) : 0.3;
    const cap = uni.capacity ?? 4;
    const used = Number(active?.c ?? 0);
    const availHit = Math.max(0.35, 1 - used / Math.max(cap, 1));

    const score01 =
      (weights.category ?? 0.35) * catHit +
      (weights.expertise ?? 0.25) * expertiseHit +
      (weights.labs ?? 0.15) * labHit +
      (weights.location ?? 0.1) * locHit +
      (weights.previous ?? 0.1) * prevHit +
      (weights.availability ?? 0.05) * availHit;

    const breakdown = {
      domain_expertise: pct(catHit),
      faculty_expertise: pct(expertiseHit),
      lab_capability: pct(labHit),
      geography: pct(locHit),
      previous_work: pct(prevHit),
      availability: pct(availHit),
    };
    const matchScore = pct(score01);
    const matchId = uuid();
    await query(
      `INSERT INTO university_matches (id, cluster_id, university_id, match_score, status, recommended_by, institution_status, breakdown_json)
       VALUES ($1,$2,$3,$4,'recommended','system','pending',$5)`,
      [matchId, clusterId, uni.id, matchScore, JSON.stringify(breakdown)]
    );
    const reasons = [
      { reason: "Domain Expertise", evidence: `${breakdown.domain_expertise}% · ${depts.map((d) => d.domain).join(", ") || "none mapped"}` },
      { reason: "Faculty Expertise", evidence: `${breakdown.faculty_expertise}% · ${tags.map((t) => t.tag).slice(0, 8).join(", ") || "none"}` },
      { reason: "Lab Capability", evidence: `${breakdown.lab_capability}% · ${labs.map((l) => l.capability).join("; ") || "none"}` },
      { reason: "Geography", evidence: `${breakdown.geography}% · ${uni.district} vs ${cluster.district_focus ?? "statewide"}` },
      { reason: "Previous Work", evidence: `${breakdown.previous_work}% · ${prior.map((p) => p.title).slice(0, 2).join("; ") || "none listed"}` },
      { reason: "Availability", evidence: `${breakdown.availability}% · ${used}/${cap} active projects vs capacity` },
    ];
    for (const r of reasons) {
      await query(`INSERT INTO match_explanations (id, match_id, reason, evidence) VALUES ($1,$2,$3,$4)`, [
        uuid(),
        matchId,
        r.reason,
        r.evidence,
      ]);
    }
    results.push({ matchId, university: uni, score: matchScore, breakdown, reasons });
  }

  results.sort((a, b) => b.score - a.score);
  return {
    weights,
    note: "CivicForge match scores use admin-configurable weights. Humans must approve, then the university must accept.",
    results,
  };
}

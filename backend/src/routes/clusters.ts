import { Router } from "express";
import { body } from "express-validator";
import { v4 as uuid } from "uuid";
import { query, queryOne } from "../db/index.js";
import { authRequired, requirePermission, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { handleValidation } from "../middleware/error.js";
import { recommendUniversities } from "../services/matching.js";
import { audit, notify } from "../services/audit.js";

export const clusterRouter = Router();
clusterRouter.use(authRequired);

clusterRouter.get("/", requirePermission("challenge:read"), requireRole("government", "university_admin", "faculty", "industry"), async (_req, res) => {
  const rows = await query(
    `SELECT cl.*, cat.name AS category_name,
            (SELECT COUNT(*)::int FROM challenges ch WHERE ch.cluster_id = cl.id) AS challenge_count
     FROM challenge_clusters cl
     LEFT JOIN challenge_categories cat ON cat.id = cl.category_id
     ORDER BY cl.created_at DESC`
  );
  res.json({ data: rows.rows, provenance: "Prototype Data" });
});

clusterRouter.get("/:id", requirePermission("challenge:read"), requireRole("government", "university_admin", "faculty", "industry"), async (req, res) => {
  const id = req.params.id as string;
  const cluster = await queryOne(
    `SELECT cl.*, cat.name AS category_name FROM challenge_clusters cl
     LEFT JOIN challenge_categories cat ON cat.id = cl.category_id WHERE cl.id = $1`,
    [id]
  );
  if (!cluster) return res.status(404).json({ error: "Cluster not found" });
  const challenges = await query(
    `SELECT c.id, c.title, c.district, c.status, c.severity, c.population_estimate FROM challenges c WHERE cluster_id = $1`,
    [id]
  );
  const matches = await query(
    `SELECT m.*, u.name AS university_name, u.district AS university_district
     FROM university_matches m JOIN universities u ON u.id = m.university_id
     WHERE m.cluster_id = $1 ORDER BY m.match_score DESC`,
    [id]
  );
  const explanations = await query(
    `SELECT e.* FROM match_explanations e
     JOIN university_matches m ON m.id = e.match_id WHERE m.cluster_id = $1`,
    [id]
  );
  const projects = await query("SELECT id, title, stage, irl_level FROM projects WHERE cluster_id = $1", [id]);
  const locations = await query(
    `SELECT loc.*, c.title FROM challenge_locations loc JOIN challenges c ON c.id = loc.challenge_id WHERE c.cluster_id = $1`,
    [id]
  );
  const clusterChallenges = challenges.rows as { district: string; population_estimate?: number }[];
  const districts = [...new Set(clusterChallenges.map((c) => c.district))];
  const population = clusterChallenges.reduce((s, c) => s + Number(c.population_estimate || 0), 0);
  res.json({
    cluster,
    challenges: challenges.rows,
    matches: matches.rows,
    explanations: explanations.rows,
    projects: projects.rows,
    locations: locations.rows,
    stats: {
      reports: challenges.rows.length,
      villages: districts.length,
      districts,
      affected_population: population,
    },
    provenance: "DEMO / SYNTHETIC DATA",
  });
});

clusterRouter.post(
  "/",
  requirePermission("challenge:cluster"),
  body("title").isLength({ min: 8 }),
  body("summary").isLength({ min: 20 }),
  body("challenge_ids").isArray({ min: 1 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const { title, summary, category_id, district_focus, challenge_ids } = req.body as {
      title: string;
      summary: string;
      category_id?: string;
      district_focus?: string;
      challenge_ids: string[];
    };
    const id = uuid();
    await query(
      `INSERT INTO challenge_clusters (id, title, category_id, summary, district_focus, status)
       VALUES ($1,$2,$3,$4,$5,'open')`,
      [id, title, category_id ?? null, summary, district_focus ?? null]
    );
    for (const cid of challenge_ids) {
      await query("UPDATE challenges SET cluster_id = $1, updated_at = NOW() WHERE id = $2", [id, cid]);
    }
    await audit(req.user!.id, "cluster.create", "cluster", id, title);
    res.status(201).json({ id });
  }
);

clusterRouter.post("/:id/assign-challenge", requirePermission("challenge:cluster"), async (req: AuthedRequest, res) => {
  const { challenge_id } = req.body as { challenge_id: string };
  await query("UPDATE challenges SET cluster_id = $1 WHERE id = $2", [req.params.id, challenge_id]);
  res.json({ ok: true });
});

clusterRouter.post("/:id/recommend-matches", requirePermission("match:recommend"), async (req: AuthedRequest, res) => {
  await query("DELETE FROM university_matches WHERE cluster_id = $1 AND status = 'recommended'", [req.params.id]);
  const result = await recommendUniversities(req.params.id as string);
  await audit(req.user!.id, "match.recommend", "cluster", req.params.id as string);
  res.json(result);
});

clusterRouter.post(
  "/matches/:matchId/decide",
  requirePermission("match:approve"),
  requireRole("government"),
  body("decision").isIn(["approved", "rejected"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const matchId = String(req.params.matchId);
    const { decision } = req.body as { decision: string };
    const match = await queryOne<{ id: string; cluster_id: string; university_id: string }>(
      "SELECT id, cluster_id, university_id FROM university_matches WHERE id = $1",
      [matchId]
    );
    if (!match) return res.status(404).json({ error: "Match not found" });
    await query("UPDATE university_matches SET status = $1, approved_by = $2 WHERE id = $3", [
      decision,
      req.user!.id,
      matchId,
    ]);
    if (decision === "approved") {
      await query("UPDATE challenge_clusters SET status = 'matched' WHERE id = $1", [match.cluster_id]);
      const uniAdmins = await query<{ id: string }>("SELECT id FROM users WHERE role_id IN ('university_admin','faculty')");
      for (const u of uniAdmins.rows) {
        await notify(u.id, "University match approved", "A government officer approved an institutional match. Form a team to proceed.");
      }
    }
    await audit(req.user!.id, "match.decide", "university_match", matchId, decision);
    res.json({ ok: true, note: "Human approval recorded. Assignment is not automatic from AI scores." });
  }
);

clusterRouter.post(
  "/matches/:matchId/institution",
  requirePermission("match:accept"),
  requireRole("university_admin", "faculty"),
  body("decision").isIn(["accepted", "declined"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const match = await queryOne<{ id: string; cluster_id: string; status: string }>(
      "SELECT id, cluster_id, status FROM university_matches WHERE id = $1",
      [req.params.matchId]
    );
    if (!match) return res.status(404).json({ error: "Match not found" });
    if (match.status !== "approved") {
      return res.status(400).json({ error: "Government must approve this match before the university can accept." });
    }
    await query(
      `UPDATE university_matches SET institution_status = $1, institution_note = $2 WHERE id = $3`,
      [req.body.decision, req.body.note ?? null, req.params.matchId]
    );
    if (req.body.decision === "accepted") {
      await query("UPDATE challenge_clusters SET status = 'accepted' WHERE id = $1", [match.cluster_id]);
    }
    await audit(req.user!.id, "match.institution", "university_match", req.params.matchId as string, req.body.decision);
    const gov = await query<{ id: string }>("SELECT id FROM users WHERE role_id = 'government'");
    for (const g of gov.rows) {
      await notify(g.id, "University response", `Institution ${req.body.decision} a recommended match.`, `/government/clusters`);
    }
    res.json({ ok: true });
  }
);

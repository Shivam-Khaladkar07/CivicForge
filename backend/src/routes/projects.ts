import { Router } from "express";
import { body } from "express-validator";
import { v4 as uuid } from "uuid";
import multer from "multer";
import { query, queryOne, withTransaction } from "../db/index.js";
import { authRequired, requirePermission, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { handleValidation } from "../middleware/error.js";
import { audit, notify, activity } from "../services/audit.js";
import { assertTransition, irlLabel, stageToSuggestedIrl } from "../services/lifecycle.js";
import { IRL_LABELS } from "../types.js";
import { canReadProject } from "../services/access.js";
import { signedDownloadUrl, storePrivateUpload } from "../services/files.js";

export const projectRouter = Router();
projectRouter.use(authRequired);

const projectUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Allowed project files: PDF, DOCX, TXT, JPEG, PNG, WEBP (max 25MB)"));
    cb(null, true);
  },
});

projectRouter.get("/", requirePermission("project:read"), async (req: AuthedRequest, res) => {
  const params: unknown[] = [];
  let scope = "";
  if (req.user!.role_id === "student") {
    params.push(req.user!.id);
    scope = `WHERE EXISTS (SELECT 1 FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.id WHERE pt.project_id = p.id AND tm.user_id = $1)`;
  } else if (req.user!.role_id === "faculty") {
    params.push(req.user!.id);
    scope = `WHERE EXISTS (SELECT 1 FROM mentors me JOIN faculty f ON f.id = me.faculty_id WHERE me.project_id = p.id AND f.user_id = $1)`;
  } else if (req.user!.role_id === "university_admin") {
    params.push(req.user!.id);
    scope = `WHERE p.lead_user_id = $1 OR p.university_id IN (SELECT un.id FROM universities un JOIN user_organizations uo ON uo.organization_id = un.organization_id WHERE uo.user_id = $1) OR EXISTS (SELECT 1 FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.id WHERE pt.project_id = p.id AND tm.user_id = $1)`;
  } else if (req.user!.role_id === "citizen") {
    params.push(req.user!.id);
    scope = `WHERE EXISTS (SELECT 1 FROM challenges c WHERE c.cluster_id = p.cluster_id AND c.reporter_id = $1)`;
  }
  const rows = await query(
    `SELECT p.*, u.name AS university_name, cl.title AS cluster_title
     FROM projects p
     LEFT JOIN universities u ON u.id = p.university_id
     JOIN challenge_clusters cl ON cl.id = p.cluster_id
     ${scope}
     ORDER BY p.created_at DESC`
    , params
  );
  res.json({ data: rows.rows, provenance: "DEMO / SYNTHETIC DATA" });
});

projectRouter.get("/directory/people", requirePermission("project:read"), requireRole("university_admin", "faculty"), async (_req, res) => {
  const students = await query("SELECT id, full_name, role_id FROM users WHERE role_id = 'student' AND is_active = TRUE");
  const faculty = await query(
    `SELECT f.id, f.title, u.full_name, u.id AS user_id FROM faculty f LEFT JOIN users u ON u.id = f.user_id`
  );
  res.json({ students: students.rows, faculty: faculty.rows });
});

projectRouter.get(
  "/industry-opportunities",
  requirePermission("project:read"),
  requireRole("university_admin", "faculty"),
  async (req: AuthedRequest, res) => {
    const projectScope = req.user!.role_id === "faculty"
      ? `EXISTS (SELECT 1 FROM mentors me JOIN faculty f ON f.id = me.faculty_id WHERE me.project_id = p.id AND f.user_id = $1)`
      : `(p.lead_user_id = $1 OR p.university_id IN (SELECT un.id FROM universities un JOIN user_organizations uo ON uo.organization_id = un.organization_id WHERE uo.user_id = $1) OR EXISTS (SELECT 1 FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.id WHERE pt.project_id = p.id AND tm.user_id = $1))`;
    const projects = await query<{ id: string; title: string; category: string; district: string | null }>(
      `SELECT p.id, p.title, COALESCE(cat.slug, '') AS category, cl.district_focus AS district
       FROM projects p JOIN challenge_clusters cl ON cl.id = p.cluster_id
       LEFT JOIN challenge_categories cat ON cat.id = cl.category_id
       WHERE ${projectScope} ORDER BY p.created_at DESC`,
      [req.user!.id]
    );
    const partners = await query<{ id: string; name: string; kind: string; sector: string; district: string | null; focus: string }>(
      `SELECT i.id, i.name, 'industry' AS kind, i.sector, i.district, i.sector AS focus FROM industries i
       UNION ALL
       SELECT c.id, c.name, 'csr' AS kind, 'CSR' AS sector, o.district, c.focus FROM csr_organizations c JOIN organizations o ON o.id = c.organization_id
       UNION ALL
       SELECT s.id, s.name, 'startup' AS kind, 'Startup' AS sector, o.district, s.focus FROM startups s JOIN organizations o ON o.id = s.organization_id`
    );
    const opportunities = projects.rows.flatMap((project) => partners.rows.map((partner) => {
      const haystack = `${partner.name} ${partner.sector} ${partner.focus}`.toLowerCase();
      const domainHit = project.category && haystack.includes(project.category.replaceAll("_", " "));
      const energyAgriculture = /energy|electrical|agri|irrigation|solar|iot|rural/.test(haystack) && /agriculture|energy/.test(project.category);
      const geography = Boolean(project.district && partner.district === project.district);
      const score = Math.min(95, 48 + (domainHit ? 25 : energyAgriculture ? 18 : 0) + (geography ? 12 : 0));
      return {
        project_id: project.id,
        project_title: project.title,
        partner_id: partner.id,
        partner_name: partner.name,
        partner_kind: partner.kind,
        sector: partner.sector,
        district: partner.district,
        focus: partner.focus,
        match_score: score,
        reason: [domainHit || energyAgriculture ? "sector alignment" : "general innovation capacity", geography ? "same district" : "statewide opportunity"].join(" · "),
      };
    })).sort((a, b) => b.match_score - a.match_score);
    res.json({ data: opportunities, provenance: "Demo partner profiles. Scores are decision support, not guaranteed support." });
  }
);

projectRouter.use("/:id", async (req: AuthedRequest, res, next) => {
  if (req.method === "GET") return next();
  if (req.user?.role_id === "admin") return next();
  if (req.user?.role_id === "industry" && (req.path.endsWith("/offers") || req.path.includes("/industry-requests/"))) return next();
  const projectId = req.params.id as string;
  const direct = await queryOne<{ lead_user_id: string | null }>("SELECT lead_user_id FROM projects WHERE id = $1", [projectId]);
  if (!direct) return res.status(404).json({ error: "Project not found" });
  if (direct.lead_user_id === req.user?.id) return next();
  if (req.user?.role_id === "university_admin") {
    const institutional = await queryOne(
      `SELECT p.id FROM projects p JOIN universities un ON un.id = p.university_id
       JOIN user_organizations uo ON uo.organization_id = un.organization_id
       WHERE p.id = $1 AND uo.user_id = $2`,
      [projectId, req.user.id]
    );
    if (institutional) return next();
  }
  const member = await queryOne(
    `SELECT tm.id FROM team_members tm JOIN project_teams pt ON pt.id = tm.team_id
     WHERE pt.project_id = $1 AND tm.user_id = $2`,
    [projectId, req.user?.id]
  );
  const mentor = await queryOne(
    `SELECT m.id FROM mentors m JOIN faculty f ON f.id = m.faculty_id
     WHERE m.project_id = $1 AND f.user_id = $2`,
    [projectId, req.user?.id]
  );
  if (member || mentor) return next();
  return res.status(403).json({ error: "Only a project lead, assigned team member, or mentor can change this project." });
});

projectRouter.get("/:id", requirePermission("project:read"), async (req: AuthedRequest, res) => {
  const id = req.params.id as string;
  if (!(await canReadProject(req.user!, id))) return res.status(403).json({ error: "You do not have access to this project." });
  const project = await queryOne(
    `SELECT p.*, u.name AS university_name, cl.title AS cluster_title
     FROM projects p
     LEFT JOIN universities u ON u.id = p.university_id
     JOIN challenge_clusters cl ON cl.id = p.cluster_id
     WHERE p.id = $1`,
    [id]
  );
  if (!project) return res.status(404).json({ error: "Project not found" });
  const teams = await query("SELECT * FROM project_teams WHERE project_id = $1", [id]);
  const members = await query(
    `SELECT tm.*, us.full_name, us.role_id FROM team_members tm
     JOIN project_teams t ON t.id = tm.team_id
     JOIN users us ON us.id = tm.user_id
     WHERE t.project_id = $1`,
    [id]
  );
  const mentors = await query(
    `SELECT m.*, f.title AS faculty_title, us.full_name
     FROM mentors m
     JOIN faculty f ON f.id = m.faculty_id
     LEFT JOIN users us ON us.id = f.user_id
     WHERE m.project_id = $1`,
    [id]
  );
  const milestones = await query("SELECT * FROM milestones WHERE project_id = $1 ORDER BY sort_order", [id]);
  const tasks = await query(
    `SELECT t.* FROM tasks t JOIN milestones m ON m.id = t.milestone_id WHERE m.project_id = $1`,
    [id]
  );
  const prototypes = await query("SELECT * FROM prototypes WHERE project_id = $1", [id]);
  const tests = await query(
    `SELECT te.* FROM tests te JOIN prototypes pr ON pr.id = te.prototype_id WHERE pr.project_id = $1`,
    [id]
  );
  const pilots = await query("SELECT * FROM pilots WHERE project_id = $1", [id]);
  const interests = await query("SELECT * FROM industry_interests WHERE project_id = $1", [id]);
  const funding = await query("SELECT * FROM funding_offers WHERE project_id = $1", [id]);
  const mentorship = await query("SELECT * FROM mentorship_offers WHERE project_id = $1", [id]);
  const impact = await query("SELECT * FROM impact_metrics WHERE project_id = $1", [id]);
  const messages = await query(
    `SELECT m.*, u.full_name FROM messages m JOIN users u ON u.id = m.user_id WHERE project_id = $1 ORDER BY m.created_at`,
    [id]
  );
  const documents = await query<{ id: string; project_id: string; title: string; url: string; doc_type: string; file_name: string | null; mime_type: string | null; scan_status: string }>("SELECT * FROM documents WHERE project_id = $1", [id]);
  const irl = await query(
    `SELECT r.*, s.full_name AS submitter, rv.full_name AS reviewer
     FROM irl_records r
     LEFT JOIN users s ON s.id = r.submitted_by
     LEFT JOIN users rv ON rv.id = r.reviewed_by
     WHERE r.project_id = $1 ORDER BY r.level, r.created_at`,
    [id]
  );
  const collab = await query(
    `SELECT c.*, u.full_name FROM collaborations c JOIN users u ON u.id = c.offered_by WHERE project_id = $1 ORDER BY c.created_at`,
    [id]
  );
  const industryRequests = await query(
    `SELECT ir.*, u.full_name AS requested_by_name,
            CASE ir.partner_kind WHEN 'industry' THEN i.name WHEN 'csr' THEN c.name WHEN 'startup' THEN s.name END AS partner_name
     FROM industry_requests ir JOIN users u ON u.id=ir.requested_by
     LEFT JOIN industries i ON ir.partner_kind='industry' AND i.id=ir.partner_id
     LEFT JOIN csr_organizations c ON ir.partner_kind='csr' AND c.id=ir.partner_id
     LEFT JOIN startups s ON ir.partner_kind='startup' AND s.id=ir.partner_id
     WHERE ir.project_id=$1 ORDER BY ir.created_at DESC`,
    [id]
  );
  const events = await query(
    `SELECT a.*, u.full_name FROM activity_events a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.entity_type = 'project' AND a.entity_id = $1 ORDER BY a.created_at`,
    [id]
  );
  const limitedView = req.user!.role_id === "industry" || req.user!.role_id === "citizen";
  res.json({
    project,
    teams: teams.rows,
    members: limitedView ? [] : members.rows,
    mentors: limitedView ? [] : mentors.rows,
    milestones: milestones.rows,
    tasks: tasks.rows,
    prototypes: prototypes.rows,
    tests: tests.rows,
    pilots: pilots.rows,
    industry_interests: interests.rows,
    funding: funding.rows,
    mentorship: mentorship.rows,
    impact: impact.rows,
    messages: limitedView ? [] : messages.rows,
    documents: limitedView ? [] : documents.rows.map((item) => ({ ...item, url: signedDownloadUrl("project", id, item.id) })),
    irl: irl.rows,
    collaborations: collab.rows,
    industry_requests: industryRequests.rows,
    activity: limitedView ? [] : events.rows,
    irl_labels: IRL_LABELS,
    provenance: "DEMO / SYNTHETIC DATA — predicted vs verified impact are labeled separately",
  });
});

projectRouter.get("/:id/tracking", requirePermission("project:read"), async (req: AuthedRequest, res) => {
  const id = req.params.id as string;
  if (!(await canReadProject(req.user!, id))) return res.status(403).json({ error: "You do not have access to this project." });
  const project = await queryOne<{ stage: string; irl_level: number; created_at: string }>(
    "SELECT stage, COALESCE(irl_level,1) AS irl_level, created_at FROM projects WHERE id = $1",
    [id]
  );
  if (!project) return res.status(404).json({ error: "Project not found" });
  const counts = await queryOne<{ members: string; mentors: string; prototypes: string; tests: string; pilots: string; impact: string; collaborations: string }>(
    `SELECT
      (SELECT COUNT(*)::text FROM team_members tm JOIN project_teams pt ON pt.id = tm.team_id WHERE pt.project_id = $1) AS members,
      (SELECT COUNT(*)::text FROM mentors WHERE project_id = $1) AS mentors,
      (SELECT COUNT(*)::text FROM prototypes WHERE project_id = $1) AS prototypes,
      (SELECT COUNT(*)::text FROM tests t JOIN prototypes p ON p.id = t.prototype_id WHERE p.project_id = $1) AS tests,
      (SELECT COUNT(*)::text FROM pilots WHERE project_id = $1) AS pilots,
      (SELECT COUNT(*)::text FROM impact_metrics WHERE project_id = $1) AS impact,
      (SELECT COUNT(*)::text FROM collaborations WHERE project_id = $1) AS collaborations`,
    [id]
  );
  const events = await query(
    `SELECT a.action, a.detail, a.created_at, COALESCE(u.full_name,'System') AS actor
     FROM activity_events a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.entity_type = 'project' AND a.entity_id = $1 ORDER BY a.created_at`,
    [id]
  );
  const stageOrder = ["proposal", "prototype", "lab_testing", "pilot", "field_validation", "deployment", "impact_measurement", "completed"];
  const current = stageOrder.indexOf(project.stage);
  const steps = stageOrder.map((key, index) => ({
    key,
    label: key.replaceAll("_", " "),
    status: index < current ? "complete" : index === current ? "current" : "upcoming",
  }));
  res.json({ project, counts, steps, events: events.rows });
});

projectRouter.get("/workspace/tasks", requirePermission("project:read"), requireRole("student"), async (req: AuthedRequest, res) => {
  const rows = await query(
    `SELECT t.id, t.title, t.status, t.notes, m.title AS milestone_title, m.due_date,
            p.id AS project_id, p.title AS project_title, p.stage
     FROM tasks t JOIN milestones m ON m.id = t.milestone_id JOIN projects p ON p.id = m.project_id
     WHERE t.assignee_id = $1 ORDER BY CASE t.status WHEN 'review' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'todo' THEN 3 ELSE 4 END, m.due_date NULLS LAST`,
    [req.user!.id]
  );
  res.json({ data: rows.rows });
});

projectRouter.get("/workspace/reviews", requirePermission("project:read"), requireRole("faculty"), async (req: AuthedRequest, res) => {
  const rows = await query(
    `SELECT r.id, r.level, r.title, r.evidence, r.status, r.created_at, p.id AS project_id, p.title AS project_title,
            s.full_name AS submitted_by
     FROM irl_records r JOIN projects p ON p.id = r.project_id
     LEFT JOIN users s ON s.id = r.submitted_by
     WHERE EXISTS (SELECT 1 FROM mentors me JOIN faculty f ON f.id = me.faculty_id WHERE me.project_id = p.id AND f.user_id = $1)
     ORDER BY CASE r.status WHEN 'submitted' THEN 1 ELSE 2 END, r.created_at DESC`,
    [req.user!.id]
  );
  res.json({ data: rows.rows });
});

projectRouter.get("/workspace/team", requirePermission("project:read"), requireRole("university_admin"), async (req: AuthedRequest, res) => {
  const rows = await query(
    `SELECT p.id, p.title, p.stage,
            (SELECT COUNT(*)::int FROM team_members tm JOIN project_teams pt ON pt.id = tm.team_id WHERE pt.project_id = p.id) AS member_count,
            (SELECT COUNT(*)::int FROM mentors me WHERE me.project_id = p.id) AS mentor_count,
            (SELECT COUNT(*)::int FROM tasks t JOIN milestones m ON m.id = t.milestone_id WHERE m.project_id = p.id AND t.status <> 'done') AS open_tasks
     FROM projects p WHERE p.lead_user_id = $1 OR p.university_id IN (
       SELECT un.id FROM universities un JOIN user_organizations uo ON uo.organization_id = un.organization_id WHERE uo.user_id = $1
     ) OR EXISTS (
       SELECT 1 FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.id WHERE pt.project_id = p.id AND tm.user_id = $1
     ) ORDER BY p.created_at DESC`,
    [req.user!.id]
  );
  res.json({ data: rows.rows });
});

projectRouter.get("/workspace/collaborations", requirePermission("project:read"), requireRole("industry"), async (req: AuthedRequest, res) => {
  const rows = await query(
    `SELECT c.id, c.offer_type, c.notes, c.status, c.created_at, p.id AS project_id, p.title AS project_title, p.stage
     FROM collaborations c JOIN projects p ON p.id = c.project_id
     WHERE c.offered_by = $1 ORDER BY c.created_at DESC`,
    [req.user!.id]
  );
  res.json({ data: rows.rows });
});

projectRouter.get("/workspace/industry-requests", requirePermission("project:read"), requireRole("industry"), async (req: AuthedRequest, res) => {
  const rows = await query(
    `SELECT ir.*, p.title AS project_title, p.stage, u.full_name AS requested_by_name,
            CASE ir.partner_kind WHEN 'industry' THEN i.name WHEN 'csr' THEN c.name WHEN 'startup' THEN s.name END AS partner_name
     FROM industry_requests ir JOIN projects p ON p.id=ir.project_id JOIN users u ON u.id=ir.requested_by
     LEFT JOIN industries i ON ir.partner_kind='industry' AND i.id=ir.partner_id
     LEFT JOIN csr_organizations c ON ir.partner_kind='csr' AND c.id=ir.partner_id
     LEFT JOIN startups s ON ir.partner_kind='startup' AND s.id=ir.partner_id
     WHERE COALESCE(i.organization_id,c.organization_id,s.organization_id) IN (SELECT organization_id FROM user_organizations WHERE user_id=$1)
     ORDER BY ir.created_at DESC`,
    [req.user!.id]
  );
  res.json({ data: rows.rows });
});

projectRouter.post(
  "/",
  requirePermission("project:write"),
  body("cluster_id").isString(),
  body("title").isLength({ min: 8 }),
  body("summary").isLength({ min: 20 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const { cluster_id, university_id, title, summary } = req.body;
    const approved = await queryOne<{ university_id: string; institution_status?: string }>(
      "SELECT university_id, institution_status FROM university_matches WHERE cluster_id = $1 AND status = 'approved' AND institution_status = 'accepted' LIMIT 1",
      [cluster_id]
    );
    if (!approved) return res.status(400).json({ error: "Cluster needs a government-approved and university-accepted match first" });
    if (university_id && university_id !== approved.university_id) {
      return res.status(400).json({ error: "Project university must match the institution that accepted the approved recommendation." });
    }
    const id = uuid();
    await query(
      `INSERT INTO projects (id, cluster_id, university_id, title, summary, stage, irl_level, lead_user_id, golden_key)
       VALUES ($1,$2,$3,$4,$5,'proposal',2,$6,$7)`,
      [
        id,
        cluster_id,
        approved.university_id,
        title,
        summary,
        req.user!.id,
        req.body.golden_key ?? null,
      ]
    );
    const teamId = uuid();
    await query("INSERT INTO project_teams (id, project_id, name) VALUES ($1,$2,$3)", [teamId, id, "Core team"]);
    await query("INSERT INTO team_members (id, team_id, user_id, role_in_team) VALUES ($1,$2,$3,$4)", [
      uuid(),
      teamId,
      req.user!.id,
      "lead",
    ]);
    const stages = ["Problem framing", "Prototype", "Lab tests", "Pilot", "Field validation", "Deployment playbook"];
    for (let i = 0; i < stages.length; i++) {
      await query(`INSERT INTO milestones (id, project_id, title, status, sort_order) VALUES ($1,$2,$3,'pending',$4)`, [
        uuid(),
        id,
        stages[i],
        i + 1,
      ]);
    }
    await audit(req.user!.id, "project.create", "project", id);
    res.status(201).json({ id });
  }
);

projectRouter.post("/:id/stage", requirePermission("project:write"), requireRole("university_admin", "faculty"), body("stage").isString(), handleValidation, async (req: AuthedRequest, res) => {
  const project = await queryOne<{ stage: string; irl_level: number }>("SELECT stage, COALESCE(irl_level, 1) AS irl_level FROM projects WHERE id = $1", [req.params.id]);
  if (!project) return res.status(404).json({ error: "Project not found" });
  assertTransition(project.stage, req.body.stage);
  const irl = stageToSuggestedIrl(req.body.stage);
  if (project.irl_level < irl) {
    return res.status(400).json({ error: `${irlLabel(irl)} must be approved before advancing to ${String(req.body.stage).replaceAll("_", " ")}.` });
  }
  await query("UPDATE projects SET stage = $1 WHERE id = $2", [req.body.stage, req.params.id]);
  await audit(req.user!.id, "project.stage", "project", req.params.id as string, `${project.stage}→${req.body.stage}`);
  await activity("project", req.params.id as string, req.user!.id, "stage", `${project.stage} → ${req.body.stage}`);
  const members = await query<{ user_id: string }>(
    `SELECT tm.user_id FROM team_members tm JOIN project_teams t ON t.id = tm.team_id WHERE t.project_id = $1`,
    [req.params.id]
  );
  for (const m of members.rows) {
    await notify(m.user_id, "Project stage updated", `Now at ${req.body.stage.replaceAll("_", " ")}`, `/university/projects/${req.params.id}`);
  }
  res.json({ ok: true, stage: req.body.stage, suggested_irl: irlLabel(irl) });
});

projectRouter.post("/:id/milestones/:mid", requirePermission("project:write"), requireRole("university_admin", "faculty"), body("status").isIn(["pending", "in_progress", "review", "done"]), handleValidation, async (req: AuthedRequest, res) => {
  await query("UPDATE milestones SET status = $1 WHERE id = $2 AND project_id = $3", [
    req.body.status,
    req.params.mid,
    req.params.id,
  ]);
  await audit(req.user!.id, "milestone.update", "project", req.params.id as string, `${req.params.mid}:${req.body.status}`);
  res.json({ ok: true });
});

projectRouter.post(
  "/:id/prototypes",
  requirePermission("project:write"),
  body("name").isLength({ min: 4 }),
  body("description").isLength({ min: 10 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const id = uuid();
    await query("INSERT INTO prototypes (id, project_id, name, description, status) VALUES ($1,$2,$3,$4,$5)", [
      id,
      req.params.id,
      req.body.name,
      req.body.description,
      req.body.status || "in_lab",
    ]);
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/pilots",
  requirePermission("project:write"),
  requireRole("university_admin", "faculty"),
  body("location").isLength({ min: 4 }),
  handleValidation,
  async (req, res) => {
    const id = uuid();
    await query(
      `INSERT INTO pilots (id, project_id, location, start_date, status, beneficiaries_estimate)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        id,
        req.params.id,
        req.body.location,
        req.body.start_date ?? null,
        req.body.status || "planned",
        req.body.beneficiaries_estimate ?? null,
      ]
    );
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/impact",
  requirePermission("project:write"),
  requireRole("university_admin", "faculty", "government"),
  body("name").isString(),
  body("unit").isString(),
  handleValidation,
  async (req, res) => {
    const id = uuid();
    await query(
      `INSERT INTO impact_metrics (id, project_id, name, unit, predicted_value, verified_value, verification_note, measured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        req.params.id,
        req.body.name,
        req.body.unit,
        req.body.predicted_value ?? null,
        req.body.verified_value ?? null,
        req.body.verification_note ?? null,
        req.body.verified_value !== undefined && req.body.verified_value !== null ? new Date().toISOString() : null,
      ]
    );
    res.status(201).json({ id, note: "Keep predicted and verified values distinct in all reports." });
  }
);

projectRouter.post(
  "/:id/messages",
  requirePermission("project:write"),
  body("body").isLength({ min: 1, max: 2000 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const id = uuid();
    await query("INSERT INTO messages (id, project_id, user_id, body) VALUES ($1,$2,$3,$4)", [
      id,
      req.params.id,
      req.user!.id,
      req.body.body,
    ]);
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/documents",
  requirePermission("project:write"),
  projectUpload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "Please choose a project document." });
    const stored = await storePrivateUpload(req.file, "project");
    const id = uuid();
    await query("INSERT INTO documents (id, project_id, title, url, doc_type, file_name, mime_type, scan_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
      id,
      req.params.id,
      String(req.body.title || req.file.originalname).slice(0, 180),
      stored.storageUrl,
      String(req.body.doc_type || "evidence").slice(0, 40),
      req.file.originalname,
      req.file.mimetype,
      stored.scanMode,
    ]);
    await audit(req.user!.id, "document.upload", "project", req.params.id as string, `${req.file.originalname} · ${stored.scanMode}`);
    await activity("project", req.params.id as string, req.user!.id, "document", `Uploaded ${req.file.originalname}`);
    res.status(201).json({ id, title: req.file.originalname, url: signedDownloadUrl("project", req.params.id as string, id), scan_status: stored.scanMode });
  }
);

projectRouter.post(
  "/:id/industry-requests",
  requirePermission("project:write"),
  requireRole("university_admin", "faculty"),
  body("partner_kind").isIn(["industry", "csr", "startup"]),
  body("partner_id").isString(),
  body("request_type").isIn(["mentorship", "funding", "technology", "testing", "pilot", "consortium"]),
  body("message").isLength({ min: 10, max: 1500 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const table = req.body.partner_kind === "industry" ? "industries" : req.body.partner_kind === "csr" ? "csr_organizations" : "startups";
    const partner = await queryOne<{ id: string; organization_id: string; name: string }>(`SELECT id, organization_id, name FROM ${table} WHERE id=$1`, [req.body.partner_id]);
    if (!partner) return res.status(404).json({ error: "Industry partner not found" });
    const existing = await queryOne("SELECT id FROM industry_requests WHERE project_id=$1 AND partner_kind=$2 AND partner_id=$3 AND request_type=$4", [req.params.id, req.body.partner_kind, req.body.partner_id, req.body.request_type]);
    if (existing) return res.status(409).json({ error: "This request type has already been sent to that partner for this project." });
    const id = uuid();
    await query(`INSERT INTO industry_requests (id,project_id,partner_kind,partner_id,request_type,message,status,requested_by) VALUES ($1,$2,$3,$4,$5,$6,'requested',$7)`, [id, req.params.id, req.body.partner_kind, req.body.partner_id, req.body.request_type, req.body.message, req.user!.id]);
    const recipients = await query<{ user_id: string }>("SELECT user_id FROM user_organizations WHERE organization_id=$1", [partner.organization_id]);
    for (const recipient of recipients.rows) await notify(recipient.user_id, "University collaboration request", `${partner.name}: ${req.body.request_type}`, `/industry/collaborations`);
    await audit(req.user!.id, "industry.request.create", "project", req.params.id as string, `${partner.name} · ${req.body.request_type}`);
    await activity("project", req.params.id as string, req.user!.id, "industry_request", `Requested ${req.body.request_type} support from ${partner.name}`);
    res.status(201).json({ id, status: "requested" });
  }
);

projectRouter.post(
  "/:id/industry-requests/:requestId/decision",
  requirePermission("industry:offer"),
  requireRole("industry"),
  body("status").isIn(["accepted", "declined"]),
  body("response_note").optional().isLength({ max: 1000 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const request = await queryOne<{ id: string; request_type: string; message: string; requested_by: string; partner_organization_id: string }>(
      `SELECT ir.id,ir.request_type,ir.message,ir.requested_by,COALESCE(i.organization_id,c.organization_id,s.organization_id) AS partner_organization_id
       FROM industry_requests ir
       LEFT JOIN industries i ON ir.partner_kind='industry' AND i.id=ir.partner_id
       LEFT JOIN csr_organizations c ON ir.partner_kind='csr' AND c.id=ir.partner_id
       LEFT JOIN startups s ON ir.partner_kind='startup' AND s.id=ir.partner_id
       WHERE ir.id=$1 AND ir.project_id=$2 AND ir.status='requested'`, [req.params.requestId, req.params.id]
    );
    if (!request) return res.status(404).json({ error: "Pending industry request not found" });
    const member = await queryOne("SELECT id FROM user_organizations WHERE user_id=$1 AND organization_id=$2", [req.user!.id, request.partner_organization_id]);
    if (!member && req.user!.role_id !== "admin") return res.status(403).json({ error: "This request was sent to another partner organization." });
    await withTransaction(async () => {
      await query("UPDATE industry_requests SET status=$1,response_note=$2,responded_by=$3,responded_at=NOW() WHERE id=$4", [req.body.status, req.body.response_note ?? null, req.user!.id, request.id]);
      if (req.body.status === "accepted") {
        await query("INSERT INTO collaborations (id,project_id,offered_by,offer_type,notes,status) VALUES ($1,$2,$3,$4,$5,'approved')", [uuid(), req.params.id, req.user!.id, request.request_type, req.body.response_note || request.message]);
      }
      await audit(req.user!.id, "industry.request.decision", "project", req.params.id as string, `${req.body.status} ${request.request_type}`);
      await activity("project", req.params.id as string, req.user!.id, "industry_request_decision", `${req.body.status} ${request.request_type} request`);
    });
    await notify(request.requested_by, `Industry request ${req.body.status}`, request.request_type, `/university/projects/${req.params.id}`);
    res.json({ ok: true, status: req.body.status });
  }
);

projectRouter.post(
  "/:id/offers",
  requirePermission("industry:offer"),
  body("kind").isIn(["funding", "mentorship", "interest"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const { kind } = req.body as { kind: string };
    const id = uuid();
    if (kind === "funding") {
      await query(
        `INSERT INTO funding_offers (id, project_id, organization_name, amount_inr, status, notes)
         VALUES ($1,$2,$3,$4,'proposed',$5)`,
        [id, req.params.id, req.body.organization_name, req.body.amount_inr, req.body.notes ?? "Demo offer"]
      );
    } else if (kind === "mentorship") {
      await query(
        `INSERT INTO mentorship_offers (id, project_id, from_name, expertise, status) VALUES ($1,$2,$3,$4,'open')`,
        [id, req.params.id, req.user!.full_name, req.body.expertise]
      );
    } else {
      await query(
        `INSERT INTO industry_interests (id, project_id, interest_type, notes) VALUES ($1,$2,$3,$4)`,
        [id, req.params.id, req.body.interest_type || "collaboration", req.body.notes ?? ""]
      );
    }
    await audit(req.user!.id, "industry.offer", "project", req.params.id as string, kind);
    await query(
      `INSERT INTO collaborations (id, project_id, offered_by, offer_type, notes, status) VALUES ($1,$2,$3,$4,$5,'expressed')`,
      [uuid(), req.params.id, req.user!.id, kind, req.body.notes ?? kind]
    );
    const leads = await query<{ lead_user_id: string | null }>("SELECT lead_user_id FROM projects WHERE id = $1", [req.params.id]);
    if (leads.rows[0]?.lead_user_id) {
      await notify(leads.rows[0].lead_user_id, "Industry interest", `${req.user!.full_name} offered ${kind}`, `/university/projects/${req.params.id}`);
    }
    res.status(201).json({ id, note: "Offer recorded. Funding is not guaranteed until approved." });
  }
);

projectRouter.post(
  "/:id/collaborations/:cid/decide",
  requirePermission("project:write"),
  requireRole("university_admin", "faculty"),
  body("status").isIn(["approved", "active", "completed", "rejected"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    await query("UPDATE collaborations SET status = $1, decided_by = $2 WHERE id = $3 AND project_id = $4", [
      req.body.status,
      req.user!.id,
      req.params.cid,
      req.params.id,
    ]);
    await audit(req.user!.id, "collaboration.decide", "project", req.params.id as string, req.body.status);
    res.json({ ok: true });
  }
);

projectRouter.post(
  "/:id/team",
  requirePermission("project:write"),
  requireRole("university_admin"),
  body("user_id").isString(),
  body("role_in_team").isLength({ min: 2 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const team = await queryOne<{ id: string }>("SELECT id FROM project_teams WHERE project_id = $1 LIMIT 1", [req.params.id]);
    if (!team) return res.status(404).json({ error: "Team not found" });
    const student = await queryOne("SELECT id FROM users WHERE id = $1 AND role_id = 'student' AND is_active = TRUE", [req.body.user_id]);
    if (!student) return res.status(400).json({ error: "Only an active student account can be added as a student team member." });
    const duplicate = await queryOne("SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2", [team.id, req.body.user_id]);
    if (duplicate) return res.status(409).json({ error: "This student is already on the project team." });
    const id = uuid();
    await query("INSERT INTO team_members (id, team_id, user_id, role_in_team) VALUES ($1,$2,$3,$4)", [
      id,
      team.id,
      req.body.user_id,
      req.body.role_in_team,
    ]);
    await notify(req.body.user_id, "Added to a project team", req.body.role_in_team, `/student/projects/${req.params.id}`);
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/mentors",
  requirePermission("project:write"),
  requireRole("university_admin"),
  body("faculty_id").isString(),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const faculty = await queryOne<{ user_id: string | null }>("SELECT user_id FROM faculty WHERE id = $1", [req.body.faculty_id]);
    if (!faculty) return res.status(400).json({ error: "Choose a valid faculty profile." });
    const duplicate = await queryOne("SELECT id FROM mentors WHERE project_id = $1 AND faculty_id = $2", [req.params.id, req.body.faculty_id]);
    if (duplicate) return res.status(409).json({ error: "This faculty member is already a project mentor." });
    const id = uuid();
    await query("INSERT INTO mentors (id, project_id, faculty_id, notes) VALUES ($1,$2,$3,$4)", [
      id,
      req.params.id,
      req.body.faculty_id,
      req.body.notes ?? null,
    ]);
    if (faculty.user_id) await notify(faculty.user_id, "You were assigned as mentor", "A project needs your review.", `/faculty/projects/${req.params.id}`);
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/tasks",
  requirePermission("project:write"),
  requireRole("university_admin", "faculty"),
  body("title").isLength({ min: 3 }),
  body("milestone_id").isString(),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const milestone = await queryOne<{ id: string }>("SELECT id FROM milestones WHERE id = $1 AND project_id = $2", [req.body.milestone_id, req.params.id]);
    if (!milestone) return res.status(400).json({ error: "Choose a milestone that belongs to this project." });
    if (req.body.assignee_id) {
      const member = await queryOne(
        `SELECT tm.id FROM team_members tm JOIN project_teams pt ON pt.id = tm.team_id
         WHERE pt.project_id = $1 AND tm.user_id = $2`,
        [req.params.id, req.body.assignee_id]
      );
      if (!member) return res.status(400).json({ error: "Tasks can only be assigned to a member of this project team." });
    }
    const id = uuid();
    await query(
      `INSERT INTO tasks (id, milestone_id, title, assignee_id, status, notes) VALUES ($1,$2,$3,$4,'todo',$5)`,
      [id, req.body.milestone_id, req.body.title, req.body.assignee_id ?? null, req.body.notes ?? null]
    );
    if (req.body.assignee_id) {
      await notify(req.body.assignee_id, "Task assigned", req.body.title, `/student/tasks`);
    }
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/tasks/:tid",
  requirePermission("project:write"),
  body("status").isIn(["todo", "in_progress", "review", "done", "open"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const task = await queryOne<{ assignee_id: string | null }>(
      "SELECT t.assignee_id FROM tasks t JOIN milestones m ON m.id = t.milestone_id WHERE t.id = $1 AND m.project_id = $2",
      [req.params.tid, req.params.id]
    );
    if (!task) return res.status(404).json({ error: "Task not found in this project." });
    if (req.user!.role_id === "student" && task.assignee_id !== req.user!.id) {
      return res.status(403).json({ error: "Students may update only their assigned tasks." });
    }
    await query("UPDATE tasks SET status = $1, notes = COALESCE($2, notes) WHERE id = $3 AND milestone_id IN (SELECT id FROM milestones WHERE project_id = $4)", [
      req.body.status,
      req.body.notes ?? null,
      req.params.tid,
      req.params.id,
    ]);
    if (req.body.status === "review") {
      const fac = await query<{ user_id: string }>(
        `SELECT f.user_id FROM mentors m JOIN faculty f ON f.id = m.faculty_id WHERE m.project_id = $1 AND f.user_id IS NOT NULL`,
        [req.params.id]
      );
      for (const f of fac.rows) await notify(f.user_id, "Review required", "A student requested mentor review.", `/faculty/reviews`);
    }
    res.json({ ok: true });
  }
);

projectRouter.post(
  "/:id/irl",
  requirePermission("project:write"),
  requireRole("student"),
  body("level").isInt({ min: 1, max: 8 }),
  body("evidence").isLength({ min: 8 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const project = await queryOne<{ irl_level: number }>("SELECT COALESCE(irl_level,1) AS irl_level FROM projects WHERE id = $1", [req.params.id]);
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (Number(req.body.level) !== Math.min(8, project.irl_level + 1)) return res.status(400).json({ error: `Submit evidence for IRL-${Math.min(8, project.irl_level + 1)} next.` });
    const pending = await queryOne("SELECT id FROM irl_records WHERE project_id = $1 AND level = $2 AND status = 'submitted'", [req.params.id, req.body.level]);
    if (pending) return res.status(409).json({ error: "Evidence for this IRL is already awaiting review." });
    const id = uuid();
    await query(
      `INSERT INTO irl_records (id, project_id, level, title, evidence, status, submitted_by)
       VALUES ($1,$2,$3,$4,$5,'submitted',$6)`,
      [id, req.params.id, req.body.level, irlLabel(Number(req.body.level)), req.body.evidence, req.user!.id]
    );
    const fac = await query<{ user_id: string }>(
      `SELECT f.user_id FROM mentors m JOIN faculty f ON f.id = m.faculty_id WHERE m.project_id = $1 AND f.user_id IS NOT NULL`,
      [req.params.id]
    );
    for (const f of fac.rows) {
      await notify(f.user_id, "IRL evidence submitted", irlLabel(Number(req.body.level)), `/faculty/reviews`);
    }
    res.status(201).json({ id });
  }
);

projectRouter.post(
  "/:id/irl/:rid/review",
  requirePermission("irl:approve"),
  body("status").isIn(["approved", "changes_requested"]),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const rec = await queryOne<{ level: number; project_id: string }>(
      "SELECT level, project_id FROM irl_records WHERE id = $1 AND project_id = $2",
      [req.params.rid, req.params.id]
    );
    if (!rec) return res.status(404).json({ error: "IRL record not found" });
    await query(
      `UPDATE irl_records SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3`,
      [req.body.status, req.user!.id, req.params.rid]
    );
    if (req.body.status === "approved") {
      await query("UPDATE projects SET irl_level = CASE WHEN COALESCE(irl_level,0) > $1 THEN irl_level ELSE $1 END WHERE id = $2", [rec.level, req.params.id]);
    }
    await audit(req.user!.id, "irl.review", "project", req.params.id as string, `${req.body.status} IRL-${rec.level}`);
    res.json({ ok: true });
  }
);

projectRouter.post(
  "/:id/tests",
  requirePermission("project:write"),
  body("prototype_id").isString(),
  body("name").isLength({ min: 3 }),
  body("result").isLength({ min: 3 }),
  handleValidation,
  async (req, res) => {
    const prototype = await queryOne("SELECT id FROM prototypes WHERE id = $1 AND project_id = $2", [req.body.prototype_id, req.params.id]);
    if (!prototype) return res.status(400).json({ error: "Choose a prototype that belongs to this project." });
    const id = uuid();
    await query("INSERT INTO tests (id, prototype_id, name, result, notes) VALUES ($1,$2,$3,$4,$5)", [
      id,
      req.body.prototype_id,
      req.body.name,
      req.body.result,
      req.body.notes ?? "DEMO / SYNTHETIC DATA",
    ]);
    res.status(201).json({ id });
  }
);

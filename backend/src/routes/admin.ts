import { Router } from "express";
import { body } from "express-validator";
import { query, queryOne, withTransaction } from "../db/index.js";
import { v4 as uuid } from "uuid";
import { authRequired, requirePermission, type AuthedRequest } from "../middleware/auth.js";
import { handleValidation } from "../middleware/error.js";
import { audit } from "../services/audit.js";

export const adminRouter = Router();
adminRouter.use(authRequired);

adminRouter.get("/settings", requirePermission("admin:settings"), async (_req, res) => {
  const rows = await query("SELECT key, value_json, description, updated_at FROM system_settings");
  res.json({ data: rows.rows });
});

adminRouter.put(
  "/settings/:key",
  requirePermission("admin:settings"),
  body("value").isObject(),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const key = req.params.key as string;
    const existing = await queryOne("SELECT key FROM system_settings WHERE key = $1", [key]);
    if (!existing) return res.status(404).json({ error: "Unknown setting" });
    if (key === "priority_weights" || key === "match_weights") {
      const expected = key === "priority_weights"
        ? ["population", "urgency", "recurrence", "evidence", "geographic_spread", "validation", "strategic"]
        : ["category", "expertise", "labs", "location", "previous", "availability"];
      const value = req.body.value as Record<string, unknown>;
      if (Object.keys(value).some((item) => !expected.includes(item)) || expected.some((item) => typeof value[item] !== "number" || Number(value[item]) < 0 || Number(value[item]) > 1)) {
        return res.status(400).json({ error: `Use only these weights with values from 0 to 1: ${expected.join(", ")}.` });
      }
      const total = expected.reduce((sum, item) => sum + Number(value[item]), 0);
      if (Math.abs(total - 1) > 0.001) return res.status(400).json({ error: "Scoring weights must add up to 1.00." });
    }
    await query("UPDATE system_settings SET value_json = $1, updated_at = NOW() WHERE key = $2", [
      JSON.stringify(req.body.value),
      key,
    ]);
    await audit(req.user!.id, "settings.update", "system_settings", key);
    res.json({ ok: true });
  }
);

adminRouter.get("/users", requirePermission("admin:users"), async (_req, res) => {
  const rows = await query(
    `SELECT id, email, full_name, role_id, is_demo, is_active, created_at FROM users ORDER BY created_at`
  );
  res.json({ data: rows.rows });
});

adminRouter.get("/audit", requirePermission("admin:audit"), async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  const action = String(req.query.action ?? "").trim().slice(0, 80);
  const params: unknown[] = [];
  let where = "";
  if (action) {
    params.push(`%${action}%`);
    where = `WHERE a.action ILIKE $${params.length}`;
  }
  params.push(limit, offset);
  const rows = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.detail, a.created_at,
            COALESCE(u.full_name, 'System') AS full_name
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs a ${where}`,
    action ? [params[0]] : []
  );
  res.json({ data: rows.rows, total: Number(total?.count ?? 0), limit, offset });
});

adminRouter.get("/metrics", requirePermission("admin:audit"), async (_req, res) => {
  const database = await queryOne<{
    users: string; challenges: string; pending_validation: string; projects: string; pending_reviews: string; unread_notifications: string;
  }>(`SELECT
      (SELECT COUNT(*)::text FROM users WHERE is_active=TRUE) AS users,
      (SELECT COUNT(*)::text FROM challenges) AS challenges,
      (SELECT COUNT(*)::text FROM challenges WHERE status IN ('validation_pending','needs_information')) AS pending_validation,
      (SELECT COUNT(*)::text FROM projects) AS projects,
      (SELECT COUNT(*)::text FROM irl_records WHERE status='submitted') AS pending_reviews,
      (SELECT COUNT(*)::text FROM notifications WHERE is_read=FALSE) AS unread_notifications`);
  res.json({ service: "civicforge-api", uptime_seconds: Math.round(process.uptime()), memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024), database, checked_at: new Date().toISOString() });
});

adminRouter.post("/users/:id/active", requirePermission("admin:users"), async (req: AuthedRequest, res) => {
  if (req.params.id === req.user!.id && !Boolean(req.body.is_active)) return res.status(400).json({ error: "You cannot disable your own active administrator session." });
  await query("UPDATE users SET is_active = $1 WHERE id = $2", [Boolean(req.body.is_active), req.params.id]);
  await audit(req.user!.id, "user.active", "user", req.params.id as string);
  res.json({ ok: true });
});

adminRouter.post("/users/:id/role", requirePermission("admin:users"), body("role_id").isString(), handleValidation, async (req: AuthedRequest, res) => {
  if (req.params.id === req.user!.id && req.body.role_id !== "admin") return res.status(400).json({ error: "You cannot remove your own administrator role." });
  const role = await queryOne("SELECT id FROM roles WHERE id = $1", [req.body.role_id]);
  if (!role) return res.status(400).json({ error: "Unknown role" });
  await query("UPDATE users SET role_id = $1 WHERE id = $2", [req.body.role_id, req.params.id]);
  await audit(req.user!.id, "user.role", "user", req.params.id as string, req.body.role_id);
  res.json({ ok: true });
});

adminRouter.post("/demo/reset", requirePermission("demo:reset"), async (req: AuthedRequest, res) => {
  const { resetGoldenDemo } = await import("../services/goldenDemo.js");
  const result = await resetGoldenDemo(req.user!.id);
  res.json(result);
});

adminRouter.get("/institutions", requirePermission("admin:settings"), async (_req, res) => {
  const rows = await query(
    `SELECT un.id, un.name, un.district, un.website, un.capacity, un.technologies, un.verified_on,
            o.id AS organization_id, o.description,
            (SELECT COUNT(*)::int FROM departments d WHERE d.university_id = un.id) AS department_count,
            (SELECT COUNT(*)::int FROM projects p WHERE p.university_id = un.id) AS project_count
     FROM universities un JOIN organizations o ON o.id = un.organization_id ORDER BY un.name`
  );
  res.json({ data: rows.rows, provenance: "Demo institutional profiles — not official rankings" });
});

adminRouter.post(
  "/institutions",
  requirePermission("admin:settings"),
  body("name").isLength({ min: 3, max: 160 }),
  body("district").isLength({ min: 2, max: 80 }),
  body("capacity").optional().isInt({ min: 0, max: 1000 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const result = await withTransaction(async () => {
      const organizationId = uuid();
      const universityId = uuid();
      await query("INSERT INTO organizations (id,name,type,district,description,is_demo) VALUES ($1,$2,'university',$3,$4,TRUE)", [organizationId, req.body.name, req.body.district, req.body.description ?? "Demo university profile"]);
      await query("INSERT INTO universities (id,organization_id,name,district,website,capacity,technologies,verified_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [universityId, organizationId, req.body.name, req.body.district, req.body.website ?? null, req.body.capacity ?? 4, req.body.technologies ?? null, req.body.verified_on ?? null]);
      await audit(req.user!.id, "institution.create", "university", universityId, req.body.name);
      return { id: universityId };
    });
    res.status(201).json(result);
  }
);

adminRouter.put(
  "/institutions/:id",
  requirePermission("admin:settings"),
  body("name").isLength({ min: 3, max: 160 }),
  body("district").isLength({ min: 2, max: 80 }),
  handleValidation,
  async (req: AuthedRequest, res) => {
    const institution = await queryOne<{ organization_id: string }>("SELECT organization_id FROM universities WHERE id = $1", [req.params.id]);
    if (!institution) return res.status(404).json({ error: "Institution not found" });
    await withTransaction(async () => {
      await query("UPDATE universities SET name=$1,district=$2,website=$3,capacity=$4,technologies=$5,verified_on=$6 WHERE id=$7", [req.body.name, req.body.district, req.body.website ?? null, req.body.capacity ?? 4, req.body.technologies ?? null, req.body.verified_on ?? null, req.params.id]);
      await query("UPDATE organizations SET name=$1,district=$2,description=$3 WHERE id=$4", [req.body.name, req.body.district, req.body.description ?? "Demo university profile", institution.organization_id]);
      await audit(req.user!.id, "institution.update", "university", req.params.id as string, req.body.name);
    });
    res.json({ ok: true });
  }
);

adminRouter.delete("/institutions/:id", requirePermission("admin:settings"), async (req: AuthedRequest, res) => {
  const institution = await queryOne<{ organization_id: string; dependencies: number }>(
    `SELECT un.organization_id,
       ((SELECT COUNT(*) FROM departments WHERE university_id=un.id) + (SELECT COUNT(*) FROM faculty WHERE university_id=un.id) + (SELECT COUNT(*) FROM projects WHERE university_id=un.id) + (SELECT COUNT(*) FROM university_matches WHERE university_id=un.id))::int AS dependencies
     FROM universities un WHERE un.id=$1`, [req.params.id]
  );
  if (!institution) return res.status(404).json({ error: "Institution not found" });
  if (institution.dependencies > 0) return res.status(409).json({ error: "This institution has linked departments, faculty, matches, or projects and cannot be deleted." });
  await withTransaction(async () => {
    await query("DELETE FROM universities WHERE id=$1", [req.params.id]);
    await query("DELETE FROM organizations WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM universities WHERE organization_id=$1)", [institution.organization_id]);
    await audit(req.user!.id, "institution.delete", "university", req.params.id as string);
  });
  res.json({ ok: true });
});

adminRouter.get("/domains", requirePermission("admin:settings"), async (_req, res) => {
  const rows = await query(`SELECT c.id,c.slug,c.name,(SELECT COUNT(*)::int FROM challenges ch WHERE ch.category_id=c.id) AS challenge_count FROM challenge_categories c ORDER BY c.name`);
  res.json({ data: rows.rows });
});

adminRouter.post("/domains", requirePermission("admin:settings"), body("slug").matches(/^[a-z][a-z0-9_]{1,39}$/), body("name").isLength({ min: 2, max: 80 }), handleValidation, async (req: AuthedRequest, res) => {
  if (await queryOne("SELECT id FROM challenge_categories WHERE slug=$1", [req.body.slug])) return res.status(409).json({ error: "That domain slug already exists." });
  const id = uuid();
  await query("INSERT INTO challenge_categories (id,slug,name) VALUES ($1,$2,$3)", [id, req.body.slug, req.body.name]);
  await audit(req.user!.id, "domain.create", "challenge_category", id, req.body.slug);
  res.status(201).json({ id });
});

adminRouter.put("/domains/:id", requirePermission("admin:settings"), body("name").isLength({ min: 2, max: 80 }), handleValidation, async (req: AuthedRequest, res) => {
  const updated = await query("UPDATE challenge_categories SET name=$1 WHERE id=$2 RETURNING id", [req.body.name, req.params.id]);
  if (!updated.rows[0]) return res.status(404).json({ error: "Domain not found" });
  await audit(req.user!.id, "domain.update", "challenge_category", req.params.id as string, req.body.name);
  res.json({ ok: true });
});

adminRouter.delete("/domains/:id", requirePermission("admin:settings"), async (req: AuthedRequest, res) => {
  const dependency = await queryOne<{ count: string }>("SELECT ((SELECT COUNT(*) FROM challenges WHERE category_id=$1)+(SELECT COUNT(*) FROM challenge_clusters WHERE category_id=$1))::text AS count", [req.params.id]);
  if (Number(dependency?.count ?? 0) > 0) return res.status(409).json({ error: "This domain is used by challenges or clusters and cannot be deleted." });
  await query("DELETE FROM challenge_categories WHERE id=$1", [req.params.id]);
  await audit(req.user!.id, "domain.delete", "challenge_category", req.params.id as string);
  res.json({ ok: true });
});

adminRouter.get("/search", requirePermission("admin:settings"), async (req: AuthedRequest, res) => {
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (q.length < 2) return res.json({ challenges: [], clusters: [], projects: [], universities: [], industries: [] });
  const like = `%${q}%`;
  const challenges = await query(
    `SELECT id, title, district, status FROM challenges WHERE title ILIKE $1 OR description ILIKE $1 LIMIT 8`,
    [like]
  );
  const clusters = await query(`SELECT id, title, district_focus FROM challenge_clusters WHERE title ILIKE $1 LIMIT 5`, [like]);
  const projects = await query(`SELECT id, title, stage FROM projects WHERE title ILIKE $1 OR summary ILIKE $1 LIMIT 5`, [like]);
  const universities = await query(`SELECT id, name, district FROM universities WHERE name ILIKE $1 LIMIT 5`, [like]);
  const industries = await query(`SELECT id, name, sector FROM industries WHERE name ILIKE $1 OR sector ILIKE $1 LIMIT 5`, [like]);
  const faculty = await query(
    `SELECT f.id, u.full_name, f.title FROM faculty f LEFT JOIN users u ON u.id = f.user_id WHERE u.full_name ILIKE $1 OR f.bio ILIKE $1 LIMIT 5`,
    [like]
  );
  res.json({
    challenges: challenges.rows,
    clusters: clusters.rows,
    projects: projects.rows,
    universities: universities.rows,
    industries: industries.rows,
    faculty: faculty.rows,
  });
});


export const catalogRouter = Router();
catalogRouter.use(authRequired);

catalogRouter.get("/categories", async (_req, res) => {
  res.json({ data: (await query("SELECT * FROM challenge_categories ORDER BY name")).rows });
});

catalogRouter.get("/universities", async (_req, res) => {
  const unis = await query("SELECT * FROM universities");
  const depts = await query("SELECT * FROM departments");
  const labs = await query("SELECT * FROM laboratories");
  const faculty = await query(
    `SELECT f.*, u.full_name FROM faculty f LEFT JOIN users u ON u.id = f.user_id`
  );
  res.json({
    universities: unis.rows,
    departments: depts.rows,
    laboratories: labs.rows,
    faculty: faculty.rows,
    provenance: "Demo institutional profiles — not official rankings",
  });
});

catalogRouter.get("/industry", async (_req, res) => {
  res.json({
    industries: (await query("SELECT * FROM industries")).rows,
    startups: (await query("SELECT * FROM startups")).rows,
    csr: (await query("SELECT * FROM csr_organizations")).rows,
    provenance: "Demo partner profiles",
  });
});

catalogRouter.get("/dashboard", async (_req, res) => {
  const counts = await queryOne<{
    challenges: string;
    validated: string;
    clusters: string;
    projects: string;
    pilots: string;
  }>(
    `SELECT
      (SELECT COUNT(*)::text FROM challenges) AS challenges,
      (SELECT COUNT(*)::text FROM challenges WHERE status = 'validated') AS validated,
      (SELECT COUNT(*)::text FROM challenge_clusters) AS clusters,
      (SELECT COUNT(*)::text FROM projects) AS projects,
      (SELECT COUNT(*)::text FROM projects WHERE stage NOT IN ('completed')) AS active_projects,
      (SELECT COUNT(*)::text FROM universities) AS heis,
      (SELECT COUNT(*)::text FROM industries) AS industry_partners,
      (SELECT COUNT(*)::text FROM prototypes) AS prototypes,
      (SELECT COUNT(*)::text FROM pilots) AS pilots,
      (SELECT COUNT(*)::text FROM pilots WHERE status IN ('active','completed')) AS deployments,
      (SELECT COALESCE(SUM(CASE WHEN verified_value IS NOT NULL THEN verified_value ELSE 0 END),0)::text FROM impact_metrics WHERE unit = 'households') AS communities_impacted`
  );
  const byDistrict = await query(
    `SELECT district, COUNT(*)::int AS count FROM challenges GROUP BY district ORDER BY count DESC`
  );
  const byCategory = await query(
    `SELECT cat.name, COUNT(*)::int AS count
     FROM challenges c JOIN challenge_categories cat ON cat.id = c.category_id
     GROUP BY cat.name ORDER BY count DESC`
  );
  const byStage = await query(`SELECT stage, COUNT(*)::int AS count FROM projects GROUP BY stage`);
  const pipeline = await query(
    `SELECT status, COUNT(*)::int AS count FROM challenges GROUP BY status`
  );
  const unvalidated = await query(
    `SELECT c.id, c.title, c.district, c.status,
            (SELECT score FROM priority_scores ps WHERE ps.challenge_id = c.id ORDER BY created_at DESC LIMIT 1) AS priority_score
     FROM challenges c WHERE c.status IN ('submitted','ai_screened','validation_pending')
     ORDER BY priority_score DESC NULLS LAST LIMIT 8`
  );
  const delayed = await query(
    `SELECT id, title, stage FROM projects WHERE stage IN ('proposal','prototype','lab_testing') ORDER BY created_at LIMIT 8`
  );
  const awaitingUni = await query(
    `SELECT m.id, u.name AS university_name, m.status, m.institution_status, cl.title AS cluster_title
     FROM university_matches m
     JOIN universities u ON u.id = m.university_id
     JOIN challenge_clusters cl ON cl.id = m.cluster_id
     WHERE m.status = 'approved' AND COALESCE(m.institution_status,'pending') = 'pending'
     LIMIT 8`
  );
  res.json({
    counts,
    byDistrict: byDistrict.rows,
    byCategory: byCategory.rows,
    byStage: byStage.rows,
    pipeline: pipeline.rows,
    attention: {
      unvalidated: unvalidated.rows,
      delayed: delayed.rows,
      awaiting_university: awaitingUni.rows,
    },
    provenance: "DEMO / SYNTHETIC DATA — not official government statistics",
  });
});

catalogRouter.get("/notifications", async (req: AuthedRequest, res) => {
  const rows = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user!.id]
  );
  res.json({ data: rows.rows });
});

catalogRouter.post("/notifications/:id/read", async (req: AuthedRequest, res) => {
  await query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2", [
    req.params.id,
    req.user!.id,
  ]);
  res.json({ ok: true });
});

catalogRouter.get("/roles", async (_req, res) => {
  res.json({ data: (await query("SELECT * FROM roles")).rows });
});

catalogRouter.get("/search", async (req: AuthedRequest, res) => {
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (q.length < 2) return res.json({ challenges: [], clusters: [], projects: [], universities: [], industries: [], faculty: [], technologies: [] });
  const like = `%${q}%`;
  const user = req.user!;
  const challengeParams: unknown[] = [like];
  const challengeWhere = ["title ILIKE $1"];
  if (user.role_id === "citizen") {
    challengeParams.push(user.id);
    challengeWhere.push(`(reporter_id = $2 OR status = 'validated')`);
  } else if (user.role_id === "industry") {
    challengeWhere.push("status = 'validated'");
  }
  if (user.role_id !== "admin" && !user.permissions.includes("citizen:read_sensitive")) {
    challengeWhere.push("COALESCE(is_sensitive, FALSE) = FALSE");
  }

  const projectParams: unknown[] = [like];
  const projectWhere = ["p.title ILIKE $1"];
  if (user.role_id === "citizen") {
    projectParams.push(user.id);
    projectWhere.push("EXISTS (SELECT 1 FROM challenges c WHERE c.cluster_id = p.cluster_id AND c.reporter_id = $2)");
  } else if (user.role_id === "student") {
    projectParams.push(user.id);
    projectWhere.push("EXISTS (SELECT 1 FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.id WHERE pt.project_id = p.id AND tm.user_id = $2)");
  } else if (user.role_id === "faculty") {
    projectParams.push(user.id);
    projectWhere.push("EXISTS (SELECT 1 FROM mentors me JOIN faculty f ON f.id = me.faculty_id WHERE me.project_id = p.id AND f.user_id = $2)");
  } else if (user.role_id === "university_admin") {
    projectParams.push(user.id);
    projectWhere.push("(p.lead_user_id = $2 OR p.university_id IN (SELECT un.id FROM universities un JOIN user_organizations uo ON uo.organization_id = un.organization_id WHERE uo.user_id = $2) OR EXISTS (SELECT 1 FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.id WHERE pt.project_id = p.id AND tm.user_id = $2))");
  }
  res.json({
    challenges: (await query(`SELECT id, title, district, status FROM challenges WHERE ${challengeWhere.join(" AND ")} LIMIT 8`, challengeParams)).rows,
    clusters: user.role_id === "citizen" ? [] : (await query(`SELECT id, title, district_focus FROM challenge_clusters WHERE title ILIKE $1 OR summary ILIKE $1 LIMIT 5`, [like])).rows,
    projects: (await query(`SELECT p.id, p.title, p.stage FROM projects p WHERE ${projectWhere.join(" AND ")} LIMIT 5`, projectParams)).rows,
    universities: (await query(`SELECT id, name, district FROM universities WHERE name ILIKE $1 OR COALESCE(technologies,'') ILIKE $1 LIMIT 5`, [like])).rows,
    industries: (await query(
      `SELECT id,name,sector,'industry' AS kind FROM industries WHERE name ILIKE $1 OR sector ILIKE $1
       UNION ALL SELECT id,name,focus AS sector,'csr' AS kind FROM csr_organizations WHERE name ILIKE $1 OR focus ILIKE $1
       UNION ALL SELECT id,name,focus AS sector,'startup' AS kind FROM startups WHERE name ILIKE $1 OR focus ILIKE $1 LIMIT 8`, [like]
    )).rows,
    faculty: (
      await query(
        `SELECT DISTINCT f.id, u.full_name, f.title FROM faculty f LEFT JOIN users u ON u.id = f.user_id LEFT JOIN expertise e ON e.faculty_id=f.id
         WHERE COALESCE(u.full_name,'') ILIKE $1 OR f.title ILIKE $1 OR COALESCE(f.bio,'') ILIKE $1 OR COALESCE(e.tag,'') ILIKE $1 LIMIT 5`,
        [like]
      )
    ).rows,
    technologies: (await query(
      `SELECT id,name AS source_name,technologies AS value,'university' AS source_type FROM universities WHERE COALESCE(technologies,'') ILIKE $1
       UNION ALL SELECT id,name AS source_name,capability AS value,'laboratory' AS source_type FROM laboratories WHERE capability ILIKE $1
       UNION ALL SELECT e.id,COALESCE(u.full_name,'Faculty') AS source_name,e.tag AS value,'expertise' AS source_type FROM expertise e JOIN faculty f ON f.id=e.faculty_id LEFT JOIN users u ON u.id=f.user_id WHERE e.tag ILIKE $1 LIMIT 8`, [like]
    )).rows,
  });
});

catalogRouter.post("/notifications/read-all", async (req: AuthedRequest, res) => {
  await query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1", [req.user!.id]);
  res.json({ ok: true });
});

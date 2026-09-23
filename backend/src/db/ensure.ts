import { query, queryOne } from "./index.js";
import { v4 as uuid } from "uuid";
import { ensureGoldenRelated } from "../services/goldenDemo.js";
import { DEFAULT_MATCH_WEIGHTS, DEFAULT_PRIORITY_WEIGHTS } from "../services/priority.js";

async function ensureScoringSetting(key: string, defaults: object, description: string) {
  const row = await queryOne<{ value_json: string }>("SELECT value_json FROM system_settings WHERE key = $1", [key]);
  if (!row) {
    await query(
      "INSERT INTO system_settings (key, value_json, description) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING",
      [key, JSON.stringify(defaults), description]
    );
    return;
  }
  let valid = false;
  try {
    const saved = JSON.parse(row.value_json) as Record<string, unknown>;
    valid = saved !== null && typeof saved === "object" && !Array.isArray(saved)
      && Object.keys(saved).length === Object.keys(defaults).length
      && Object.keys(defaults).every((factor) => typeof saved[factor] === "number" && Number.isFinite(saved[factor]) && Number(saved[factor]) >= 0 && Number(saved[factor]) <= 1)
      && Math.abs(Object.values(saved).reduce<number>((sum, value) => sum + Number(value), 0) - 1) <= 0.001;
  } catch { /* Legacy or malformed settings need a one-time migration. */ }
  if (!valid) {
    await query("UPDATE system_settings SET value_json = $1, description = $2, updated_at = NOW() WHERE key = $3", [
      JSON.stringify(defaults), description, key,
    ]);
  }
}

const EXTRA_PERMS: [string, string, string][] = [
  ["p15", "challenge:read_all", "Read all challenges"],
  ["p16", "match:accept", "University accept/decline match"],
  ["p17", "project:create", "Create innovation projects"],
  ["p18", "irl:approve", "Approve IRL progression"],
  ["p19", "demo:reset", "Reset Golden Demo"],
  ["p20", "search:use", "Global search"],
];

const GRANTS: Record<string, string[]> = {
  citizen: ["p20"],
  government: ["p15", "p20"],
  university_admin: ["p15", "p16", "p17", "p20"],
  faculty: ["p15", "p17", "p18", "p20"],
  student: ["p15", "p20"],
  industry: ["p15", "p20"],
  admin: ["p15", "p16", "p17", "p18", "p19", "p20"],
};

export async function ensureRuntimeExtras() {
  for (const p of EXTRA_PERMS) {
    await query("INSERT INTO permissions (id, code, description) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING", p);
  }
  for (const [role, ids] of Object.entries(GRANTS)) {
    for (const pid of ids) {
      await query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT (role_id, permission_id) DO NOTHING",
        [role, pid]
      );
    }
  }
  await ensureScoringSetting("priority_weights", DEFAULT_PRIORITY_WEIGHTS, "CivicForge Decision Support Score weights — admin configurable, not a scientific formula");
  await ensureScoringSetting("match_weights", DEFAULT_MATCH_WEIGHTS, "University matching weights — admin configurable");
  await query(`UPDATE projects SET stage = 'proposal' WHERE stage IN ('team_forming','team forming')`);
  await query(`UPDATE projects SET irl_level = 1 WHERE irl_level IS NULL`);

  const demoMemberships = await query<{ user_id: string; organization_id: string; role_title: string }>(
    `SELECT u.id AS user_id, o.id AS organization_id,
            CASE u.role_id WHEN 'university_admin' THEN 'University administrator' WHEN 'industry' THEN 'CSR representative' ELSE 'Government officer' END AS role_title
     FROM users u JOIN organizations o ON
       (u.role_id = 'university_admin' AND o.id = (SELECT id FROM organizations WHERE type = 'university' ORDER BY name LIMIT 1)) OR
       (u.role_id = 'industry' AND o.id = (SELECT id FROM organizations WHERE type IN ('industry','csr') ORDER BY CASE WHEN type = 'csr' THEN 0 ELSE 1 END, name LIMIT 1)) OR
       (u.role_id = 'government' AND o.id = (SELECT id FROM organizations WHERE type = 'government' ORDER BY name LIMIT 1))
     WHERE u.is_demo = TRUE`
  );
  for (const membership of demoMemberships.rows) {
    await query(
      `INSERT INTO user_organizations (id, user_id, organization_id, role_title, is_primary)
       VALUES ($1,$2,$3,$4,TRUE) ON CONFLICT (user_id, organization_id) DO NOTHING`,
      [uuid(), membership.user_id, membership.organization_id, membership.role_title]
    );
  }

  const uni = await queryOne<{ id: string }>("SELECT id FROM universities ORDER BY name LIMIT 1");
  if (uni) {
    const agri = await queryOne("SELECT id FROM departments WHERE university_id = $1 AND domain = 'agriculture'", [uni.id]);
    if (!agri) {
      await query("INSERT INTO departments (id, university_id, name, domain) VALUES ($1,$2,$3,$4)", [
        uuid(),
        uni.id,
        "Agricultural Engineering (demo)",
        "agriculture",
      ]);
    }
    const energy = await queryOne("SELECT id FROM departments WHERE university_id = $1 AND domain = 'energy'", [uni.id]);
    if (!energy) {
      await query("INSERT INTO departments (id, university_id, name, domain) VALUES ($1,$2,$3,$4)", [
        uuid(),
        uni.id,
        "Electrical & Energy Systems (demo)",
        "energy",
      ]);
    }
    const fac = await queryOne<{ id: string }>("SELECT id FROM faculty WHERE university_id = $1 LIMIT 1", [uni.id]);
    if (fac) {
      for (const tag of ["electrical engineering", "irrigation energy", "IoT"]) {
        const exists = await queryOne("SELECT id FROM expertise WHERE faculty_id = $1 AND tag = $2", [fac.id, tag]);
        if (!exists) await query("INSERT INTO expertise (id, faculty_id, tag) VALUES ($1,$2,$3)", [uuid(), fac.id, tag]);
      }
    }
  }
  await ensureGoldenRelated();
}

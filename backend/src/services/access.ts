import { queryOne } from "../db/index.js";
import type { AuthUser } from "../types.js";

export async function canReadProject(user: AuthUser, projectId: string) {
  if (["admin", "government"].includes(user.role_id)) return true;
  if (user.role_id === "industry") {
    return Boolean(await queryOne(
      `SELECT p.id FROM projects p
       WHERE p.id = $1 AND (
         EXISTS (SELECT 1 FROM collaborations c WHERE c.project_id = p.id AND c.offered_by = $2 AND c.status IN ('approved','active','completed'))
         OR EXISTS (
           SELECT 1 FROM industry_requests ir
           LEFT JOIN industries i ON ir.partner_kind='industry' AND i.id=ir.partner_id
           LEFT JOIN csr_organizations c ON ir.partner_kind='csr' AND c.id=ir.partner_id
           LEFT JOIN startups s ON ir.partner_kind='startup' AND s.id=ir.partner_id
           WHERE ir.project_id=p.id AND ir.status='accepted' AND COALESCE(i.organization_id,c.organization_id,s.organization_id) IN (
             SELECT organization_id FROM user_organizations WHERE user_id=$2
           )
         )
       ) LIMIT 1`,
      [projectId, user.id]
    ));
  }
  if (user.role_id === "citizen") {
    return Boolean(await queryOne(
      `SELECT p.id FROM projects p JOIN challenges c ON c.cluster_id = p.cluster_id
       WHERE p.id = $1 AND c.reporter_id = $2 LIMIT 1`,
      [projectId, user.id]
    ));
  }
  if (user.role_id === "university_admin") {
    return Boolean(await queryOne(
      `SELECT p.id FROM projects p LEFT JOIN project_teams pt ON pt.project_id = p.id
       LEFT JOIN team_members tm ON tm.team_id = pt.id
       WHERE p.id = $1 AND (p.lead_user_id = $2 OR tm.user_id = $2 OR p.university_id IN (
         SELECT un.id FROM universities un JOIN user_organizations uo ON uo.organization_id = un.organization_id WHERE uo.user_id = $2
       )) LIMIT 1`,
      [projectId, user.id]
    ));
  }
  if (user.role_id === "student") {
    return Boolean(await queryOne(
      `SELECT p.id FROM projects p JOIN project_teams pt ON pt.project_id = p.id
       JOIN team_members tm ON tm.team_id = pt.id WHERE p.id = $1 AND tm.user_id = $2 LIMIT 1`,
      [projectId, user.id]
    ));
  }
  if (user.role_id === "faculty") {
    return Boolean(await queryOne(
      `SELECT p.id FROM projects p JOIN mentors me ON me.project_id = p.id
       JOIN faculty f ON f.id = me.faculty_id WHERE p.id = $1 AND f.user_id = $2 LIMIT 1`,
      [projectId, user.id]
    ));
  }
  return false;
}

export async function canReadChallenge(user: AuthUser, challengeId: string) {
  const challenge = await queryOne<{ reporter_id: string; status: string; is_sensitive: boolean }>(
    "SELECT reporter_id, status, COALESCE(is_sensitive,FALSE) AS is_sensitive FROM challenges WHERE id = $1",
    [challengeId]
  );
  if (!challenge) return false;
  if (challenge.reporter_id === user.id || user.role_id === "admin") return true;
  if (challenge.is_sensitive && !user.permissions.includes("citizen:read_sensitive")) return false;
  if (user.role_id === "citizen" && !user.permissions.includes("challenge:read_all")) return challenge.status === "validated";
  return user.permissions.includes("challenge:read");
}

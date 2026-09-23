import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { query } from "../db/index.js";
import type { AuthUser, Permission, RoleId } from "../types.js";
import { readSecret } from "../config.js";

const SECRET = () => readSecret("JWT_SECRET", "dev-only-secret");

export function signToken(user: { id: string; email: string; role_id: string }) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role_id }, SECRET(), { expiresIn: "7d" });
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export async function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = jwt.verify(token, SECRET()) as { sub: string };
    const user = await query<{
      id: string;
      email: string;
      full_name: string;
      role_id: RoleId;
      is_demo: boolean;
      is_active: boolean;
    }>("SELECT id, email, full_name, role_id, is_demo, is_active FROM users WHERE id = $1", [payload.sub]);
    const row = user.rows[0];
    if (!row || !row.is_active) return res.status(401).json({ error: "Invalid session" });
    const perms = await query<{ code: Permission }>(
      `SELECT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1`,
      [row.role_id]
    );
    req.user = {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role_id: row.role_id,
      is_demo: row.is_demo,
      permissions: perms.rows.map((p) => p.code),
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requirePermission(...needed: Permission[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const ok = needed.some((p) => user.permissions.includes(p) || user.role_id === "admin");
    if (!ok) return res.status(403).json({ error: "You do not have permission to do that.", needed });
    next();
  };
}

export function requireRole(...roles: RoleId[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Authentication required" });
    if (user.role_id === "admin" || roles.includes(user.role_id)) return next();
    return res.status(403).json({ error: "This action is limited to another CivicForge role." });
  };
}

export function optionalAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return next();
  return authRequired(req, res, next);
}

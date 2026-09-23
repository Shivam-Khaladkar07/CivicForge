import { Router } from "express";
import { query } from "../db/index.js";

export const publicRouter = Router();

publicRouter.get("/challenges", async (_req, res) => {
  const rows = await query(
    `SELECT c.id, c.title, c.district, c.status, cat.name AS category_name, c.created_at, c.is_demo
     FROM challenges c JOIN challenge_categories cat ON cat.id = c.category_id
     WHERE c.status = 'validated' AND COALESCE(c.is_sensitive, FALSE) = FALSE
     ORDER BY c.created_at DESC LIMIT 40`
  );
  res.json({ data: rows.rows, provenance: "DEMO / SYNTHETIC DATA" });
});

publicRouter.get("/challenges/:id", async (req, res) => {
  const rows = await query(
    `SELECT c.id, c.title, c.description, c.district, c.status, cat.name AS category_name, c.is_demo
     FROM challenges c JOIN challenge_categories cat ON cat.id = c.category_id
     WHERE c.id = $1 AND c.status = 'validated' AND COALESCE(c.is_sensitive, FALSE) = FALSE`,
    [req.params.id]
  );
  const ch = rows.rows[0];
  if (!ch) return res.status(404).json({ error: "This challenge is not on the public register." });
  res.json({ challenge: ch, provenance: "DEMO / SYNTHETIC DATA" });
});

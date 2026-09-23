import { Router } from "express";
import bcrypt from "bcryptjs";
import { body } from "express-validator";
import { v4 as uuid } from "uuid";
import { query, queryOne } from "../db/index.js";
import { authRequired, signToken, type AuthedRequest } from "../middleware/auth.js";
import { handleValidation } from "../middleware/error.js";
import { audit } from "../services/audit.js";
import type { Permission, RoleId } from "../types.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  body("email").isEmail(),
  body("password").isLength({ min: 8 }),
  handleValidation,
  async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await queryOne<{
      id: string;
      email: string;
      password_hash: string;
      full_name: string;
      role_id: RoleId;
      is_demo: boolean;
      is_active: boolean;
    }>("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    if (!user || !user.is_active) return res.status(401).json({ error: "Invalid email or password" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });
    const token = signToken(user);
    await audit(user.id, "auth.login", "user", user.id);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role_id: user.role_id,
        is_demo: user.is_demo,
      },
    });
  }
);

authRouter.post(
  "/register",
  body("email").isEmail(),
  body("password").isLength({ min: 8 }),
  body("full_name").isLength({ min: 2, max: 120 }),
  body("district").optional().isLength({ max: 80 }),
  handleValidation,
  async (req, res) => {
    const { email, password, full_name, district } = req.body as {
      email: string;
      password: string;
      full_name: string;
      district?: string;
    };
    const exists = await queryOne("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (exists) return res.status(409).json({ error: "Email already registered" });
    const id = uuid();
    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO users (id, email, password_hash, full_name, role_id, is_demo) VALUES ($1,$2,$3,$4,'citizen', FALSE)`,
      [id, email.toLowerCase(), hash, full_name]
    );
    await query(`INSERT INTO citizens (id, user_id, district) VALUES ($1,$2,$3)`, [uuid(), id, district ?? null]);
    await audit(id, "auth.register", "user", id);
    const token = signToken({ id, email: email.toLowerCase(), role_id: "citizen" });
    res.status(201).json({
      token,
      user: { id, email: email.toLowerCase(), full_name, role_id: "citizen", is_demo: false },
    });
  }
);

authRouter.get("/me", authRequired, async (req: AuthedRequest, res) => {
  const user = req.user!;
  res.json({ user, permissions: user.permissions as Permission[] });
});

authRouter.get("/demo-accounts", async (_req, res) => {
  if (process.env.DEMO_ENV !== "true") return res.status(404).json({ error: "Demo accounts are disabled." });
  const rows = await query<{ email: string; full_name: string; role_id: string }>(
    `SELECT email, full_name, role_id FROM users WHERE is_demo = TRUE ORDER BY role_id`
  );
  res.json({
    password: "Demo@12345",
    note: "Demo accounts for the SIH prototype. Not real officials.",
    accounts: rows.rows,
  });
});

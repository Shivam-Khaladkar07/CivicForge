import fs from "node:fs";
import { Router } from "express";
import { authRequired, type AuthedRequest } from "../middleware/auth.js";
import { queryOne } from "../db/index.js";
import { canReadChallenge, canReadProject } from "../services/access.js";
import { resolvePrivateFile, verifyDownloadSignature } from "../services/files.js";

export const fileRouter = Router();
fileRouter.use(authRequired);

fileRouter.get("/:scope/:entityId/:fileId", async (req: AuthedRequest, res) => {
  const scope = req.params.scope as string;
  const entityId = req.params.entityId as string;
  const fileId = req.params.fileId as string;
  const expires = String(req.query.expires || "");
  const signature = String(req.query.signature || "");
  if (!verifyDownloadSignature(scope, entityId, fileId, expires, signature)) return res.status(403).json({ error: "This secure download link is invalid or has expired." });

  let record: { url: string; file_name: string; mime_type: string } | null = null;
  if (scope === "challenge") {
    if (!(await canReadChallenge(req.user!, entityId))) return res.status(403).json({ error: "You do not have access to this evidence." });
    record = await queryOne("SELECT url, file_name, mime_type FROM challenge_media WHERE id = $1 AND challenge_id = $2", [fileId, entityId]);
  } else if (scope === "project") {
    if (!(await canReadProject(req.user!, entityId))) return res.status(403).json({ error: "You do not have access to this document." });
    record = await queryOne("SELECT url, COALESCE(file_name,title) AS file_name, COALESCE(mime_type,'application/octet-stream') AS mime_type FROM documents WHERE id = $1 AND project_id = $2", [fileId, entityId]);
  } else {
    return res.status(404).json({ error: "Unknown file scope." });
  }
  if (!record) return res.status(404).json({ error: "File record not found." });
  const filePath = resolvePrivateFile(record.url);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Stored file not found." });
  res.setHeader("Content-Type", record.mime_type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.download(filePath, record.file_name);
});

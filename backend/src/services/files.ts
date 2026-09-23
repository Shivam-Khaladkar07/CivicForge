import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import net from "node:net";
import { v4 as uuid } from "uuid";
import { readSecret } from "../config.js";

const runFile = promisify(execFile);
export const privateUploadDir = path.resolve(process.env.PRIVATE_UPLOAD_DIR || process.env.UPLOAD_DIR || "./private-uploads");

function signingSecret() {
  return readSecret("FILE_SIGNING_SECRET", readSecret("JWT_SECRET", "development-only-change-me"));
}

function signaturePayload(scope: string, entityId: string, fileId: string, expires: number) {
  return `${scope}:${entityId}:${fileId}:${expires}`;
}

export function signedDownloadUrl(scope: "challenge" | "project", entityId: string, fileId: string, ttlSeconds = 300) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = crypto.createHmac("sha256", signingSecret()).update(signaturePayload(scope, entityId, fileId, expires)).digest("hex");
  return `/api/files/${scope}/${encodeURIComponent(entityId)}/${encodeURIComponent(fileId)}?expires=${expires}&signature=${signature}`;
}

export function verifyDownloadSignature(scope: string, entityId: string, fileId: string, expiresRaw: string, signature: string) {
  const expires = Number(expiresRaw);
  if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac("sha256", signingSecret()).update(signaturePayload(scope, entityId, fileId, expires)).digest("hex");
  const supplied = Buffer.from(signature, "hex");
  const calculated = Buffer.from(expected, "hex");
  return supplied.length === calculated.length && crypto.timingSafeEqual(supplied, calculated);
}

function hasExpectedSignature(mime: string, buffer: Buffer) {
  const hex = buffer.subarray(0, 16).toString("hex");
  if (mime === "application/pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mime === "image/png") return hex.startsWith("89504e470d0a1a0a");
  if (mime === "image/webp") return buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  if (mime === "video/mp4" || mime === "audio/mp4") return buffer.subarray(4, 12).toString().includes("ftyp");
  if (mime === "video/webm" || mime === "audio/webm") return hex.startsWith("1a45dfa3");
  if (mime === "audio/wav") return buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WAVE";
  if (mime === "audio/mpeg") return buffer.subarray(0, 3).toString() === "ID3" || hex.startsWith("fffb") || hex.startsWith("fff3") || hex.startsWith("fff2");
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return hex.startsWith("504b0304");
  if (mime === "text/plain") return !buffer.includes(0);
  return false;
}

async function scanStoredFile(filePath: string, buffer: Buffer) {
  const text = buffer.toString("utf8");
  if (text.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE") || text.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR")) {
    throw new Error("The uploaded file was rejected by malware scanning.");
  }
  const clamHost = process.env.CLAMAV_HOST?.trim();
  if (clamHost) {
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection({ host: clamHost, port: Number(process.env.CLAMAV_PORT || 3310) });
      let response = "";
      socket.setTimeout(30_000);
      socket.on("connect", () => {
        socket.write(Buffer.from("zINSTREAM\0"));
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
          const chunk = buffer.subarray(offset, Math.min(buffer.length, offset + 64 * 1024));
          const length = Buffer.alloc(4); length.writeUInt32BE(chunk.length); socket.write(length); socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
      socket.on("data", (chunk) => { response += chunk.toString(); });
      socket.on("end", () => resolve(response));
      socket.on("timeout", () => { socket.destroy(); reject(new Error("ClamAV scan timed out")); });
      socket.on("error", reject);
    });
    if (!/\bOK\b/.test(reply) || /FOUND|ERROR/i.test(reply)) throw new Error("The uploaded file was rejected or could not be cleared by malware scanning.");
    return "clamav_instream";
  }
  const command = process.env.MALWARE_SCANNER_COMMAND?.trim();
  if (!command) {
    if (process.env.REQUIRE_MALWARE_SCANNER === "true") throw new Error("The configured malware scanner is unavailable; upload was not saved.");
    return "basic_signature_scan";
  }
  try {
    await runFile(command, [filePath], { timeout: 30_000, windowsHide: true });
    return "external_scanner";
  } catch {
    throw new Error("The uploaded file was rejected or could not be cleared by malware scanning.");
  }
}

export async function storePrivateUpload(file: Express.Multer.File, scope: string) {
  if (!file.buffer?.length) throw new Error("The uploaded file is empty.");
  if (!hasExpectedSignature(file.mimetype, file.buffer)) throw new Error("The file content does not match its declared type.");
  fs.mkdirSync(privateUploadDir, { recursive: true });
  const extension = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const storedName = `${scope}-${uuid()}${extension}`;
  const filePath = path.join(privateUploadDir, storedName);
  fs.writeFileSync(filePath, file.buffer, { flag: "wx" });
  try {
    const scanMode = await scanStoredFile(filePath, file.buffer);
    return { storedName, storageUrl: `private://${storedName}`, scanMode };
  } catch (error) {
    fs.rmSync(filePath, { force: true });
    throw error;
  }
}

export function resolvePrivateFile(storageUrl: string) {
  const storedName = path.basename(storageUrl.replace(/^private:\/\//, "").replace(/^\/uploads\//, ""));
  const resolved = path.resolve(privateUploadDir, storedName);
  if (path.dirname(resolved) !== privateUploadDir) throw new Error("Invalid stored file path");
  return resolved;
}

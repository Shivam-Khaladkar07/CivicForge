import { v4 as uuid } from "uuid";
import { query } from "../db/index.js";

export async function audit(userId: string | null, action: string, entityType?: string, entityId?: string, detail?: string) {
  await query(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [uuid(), userId, action, entityType ?? null, entityId ?? null, detail ?? null]
  );
}

export async function notify(userId: string, title: string, body: string, linkUrl?: string) {
  await query(
    `INSERT INTO notifications (id, user_id, title, body, link_url) VALUES ($1,$2,$3,$4,$5)`,
    [uuid(), userId, title, body, linkUrl ?? null]
  );
}

export async function activity(entityType: string, entityId: string, userId: string | null, action: string, detail?: string) {
  await query(
    `INSERT INTO activity_events (id, entity_type, entity_id, user_id, action, detail) VALUES ($1,$2,$3,$4,$5,$6)`,
    [uuid(), entityType, entityId, userId, action, detail ?? null]
  );
}

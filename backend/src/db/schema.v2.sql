-- CivicForge schema v2 (additive)

CREATE TABLE IF NOT EXISTS duplicate_reviews (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  related_challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  similarity NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'related',
  decision TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS irl_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  title TEXT NOT NULL,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_by TEXT REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS collaborations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  offered_by TEXT NOT NULL REFERENCES users(id),
  offer_type TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'expressed',
  decided_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_organizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_title TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (user_id, organization_id)
);

CREATE TABLE IF NOT EXISTS industry_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  partner_kind TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  requested_by TEXT NOT NULL REFERENCES users(id),
  responded_by TEXT REFERENCES users(id),
  response_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (project_id, partner_kind, partner_id, request_type)
);

CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_district ON challenges(district);
CREATE INDEX IF NOT EXISTS idx_challenges_reporter ON challenges(reporter_id);
CREATE INDEX IF NOT EXISTS idx_challenges_cluster ON challenges(cluster_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_stage ON projects(stage);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_user ON user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_mentors_project ON mentors(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_matches_cluster ON university_matches(cluster_id, status);
CREATE INDEX IF NOT EXISTS idx_industry_requests_project ON industry_requests(project_id, status);
CREATE INDEX IF NOT EXISTS idx_industry_requests_partner ON industry_requests(partner_kind, partner_id, status);

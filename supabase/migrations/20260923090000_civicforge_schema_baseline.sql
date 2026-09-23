-- CivicForge database baseline: tables, additive columns, indexes, and private Data API posture.
-- Application access remains through the existing Express service and JWT/RBAC middleware.
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  phone TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS citizens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  district TEXT,
  block_or_ward TEXT,
  health_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  district TEXT,
  description TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS government_departments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  user_id TEXT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS universities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  website TEXT
);
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS faculty (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  university_id TEXT NOT NULL REFERENCES universities(id),
  department_id TEXT REFERENCES departments(id),
  title TEXT NOT NULL,
  bio TEXT
);
CREATE TABLE IF NOT EXISTS expertise (
  id TEXT PRIMARY KEY,
  faculty_id TEXT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  tag TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS laboratories (
  id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capability TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS institution_projects (
  id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  year INTEGER
);
CREATE TABLE IF NOT EXISTS industries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  district TEXT
);
CREATE TABLE IF NOT EXISTS startups (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  focus TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS csr_organizations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  focus TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS challenge_categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS challenge_clusters (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category_id TEXT REFERENCES challenge_categories(id),
  summary TEXT NOT NULL,
  district_focus TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES challenge_categories(id),
  reporter_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'submitted',
  district TEXT NOT NULL,
  block_or_ward TEXT,
  severity INTEGER NOT NULL DEFAULT 3,
  population_estimate INTEGER,
  is_demo BOOLEAN NOT NULL DEFAULT TRUE,
  cluster_id TEXT REFERENCES challenge_clusters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS challenge_locations (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  district TEXT NOT NULL,
  locality TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS challenge_tags (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  tag TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS challenge_media (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS challenge_relations (
  id TEXT PRIMARY KEY,
  from_challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  to_challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  relation TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_analysis (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL,
  category_slug TEXT,
  summary TEXT NOT NULL,
  suggested_tags TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  confidence_label TEXT NOT NULL,
  human_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ai_embeddings (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  vector_json TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  description TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS priority_scores (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  breakdown_json TEXT NOT NULL,
  weights_json TEXT NOT NULL,
  formula_note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS university_matches (
  id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL REFERENCES challenge_clusters(id),
  university_id TEXT NOT NULL REFERENCES universities(id),
  match_score NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'recommended',
  recommended_by TEXT NOT NULL DEFAULT 'system',
  approved_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS match_explanations (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES university_matches(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  evidence TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL REFERENCES challenge_clusters(id),
  university_id TEXT REFERENCES universities(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'team_forming',
  lead_user_id TEXT REFERENCES users(id),
  is_demo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS project_teams (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES project_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role_in_team TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mentors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  faculty_id TEXT NOT NULL REFERENCES faculty(id),
  notes TEXT
);
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  milestone_id TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assignee_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  doc_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prototypes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_lab',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  prototype_id TEXT NOT NULL REFERENCES prototypes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  result TEXT NOT NULL,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS pilots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  location TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'planned',
  beneficiaries_estimate INTEGER
);
CREATE TABLE IF NOT EXISTS industry_interests (
  id TEXT PRIMARY KEY,
  industry_id TEXT REFERENCES industries(id),
  startup_id TEXT REFERENCES startups(id),
  csr_id TEXT REFERENCES csr_organizations(id),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  interest_type TEXT NOT NULL,
  notes TEXT
);
CREATE TABLE IF NOT EXISTS funding_offers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  amount_inr INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  notes TEXT
);
CREATE TABLE IF NOT EXISTS mentorship_offers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_name TEXT NOT NULL,
  expertise TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE TABLE IF NOT EXISTS impact_metrics (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  predicted_value NUMERIC,
  verified_value NUMERIC,
  verification_note TEXT,
  measured_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS impact_description TEXT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS urgency INTEGER DEFAULT 3;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS assigned_department TEXT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN DEFAULT FALSE;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS info_request TEXT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS info_response TEXT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS info_responded_at TIMESTAMPTZ;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS golden_key TEXT;
ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS secondary_slug TEXT;
ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS sub_domain TEXT;
ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS skills_json TEXT;
ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS technologies_json TEXT;
ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS pipeline_json TEXT;
ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS fallback_reason TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS irl_level INTEGER DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS golden_key TEXT;
ALTER TABLE university_matches ADD COLUMN IF NOT EXISTS institution_status TEXT DEFAULT 'pending';
ALTER TABLE university_matches ADD COLUMN IF NOT EXISTS institution_note TEXT;
ALTER TABLE university_matches ADD COLUMN IF NOT EXISTS breakdown_json TEXT;
ALTER TABLE universities ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4;
ALTER TABLE universities ADD COLUMN IF NOT EXISTS technologies TEXT;
ALTER TABLE universities ADD COLUMN IF NOT EXISTS verified_on DATE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE industry_interests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'expressed';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE challenge_media ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'legacy_unscanned';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'legacy_unscanned';
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['roles','permissions','role_permissions','users','citizens','organizations','government_departments','universities','departments','faculty','expertise','laboratories','institution_projects','industries','startups','csr_organizations','challenge_categories','challenge_clusters','challenges','challenge_locations','challenge_tags','challenge_media','challenge_relations','ai_analysis','ai_embeddings','system_settings','priority_scores','university_matches','match_explanations','projects','project_teams','team_members','mentors','milestones','tasks','documents','prototypes','tests','pilots','industry_interests','funding_offers','mentorship_offers','impact_metrics','notifications','comments','messages','audit_logs','duplicate_reviews','irl_records','collaborations','activity_events','user_organizations','industry_requests'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t); END LOOP; END $$;

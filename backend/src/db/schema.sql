-- CivicForge — Jharkhand (prototype schema)

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

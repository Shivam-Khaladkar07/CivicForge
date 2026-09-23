# CivicForge — Jharkhand

**From Community Problems to Deployable Solutions.** CivicForge is an SIH 2026 GovTech prototype that turns community-reported societal problems into validated university–industry innovation projects.

> **Demo Environment:** all seeded records, impact figures, institutional profiles, and coordinates are synthetic prototype data. They are not official government data.

## Product flow

Citizen → AI intelligence → human validation → challenge cluster → university match → multidisciplinary team → industry offer → prototype → pilot → deployment → impact.

AI is always advisory: validation and university assignment require a human decision. The **CivicForge Decision Support Score** and university-match weights are configurable by an admin and are not a scientific universal formula. Predicted and verified impact remain separate.

## Architecture

- `frontend/`: React, TypeScript, Vite, Tailwind, shadcn-style primitives, Leaflet/OpenStreetMap, and Recharts.
- `backend/`: Express REST API, JWT authentication, bcrypt password hashing, server-enforced RBAC, request validation, rate limiting, Helmet, audit logs, and validated uploads.
- Database: Supabase managed PostgreSQL. CivicForge keeps its existing Express SQL backend and permissions. The local PGlite database is selected only explicitly for isolated tests.
- AI: a swappable `AIProvider` interface. An OpenAI-compatible adapter can be enabled with environment variables; deterministic **Demo AI Mode** remains the zero-key fallback. It classifies, summarizes, embeds, finds related reports with cosine similarity, and extracts skills/technologies.

## Setup

```bash
npm install
npm run install:all
npm run dev
```

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

Use the Supabase connection URL and the project's CA certificate for CivicForge runtime. See [Supabase database migration](docs/SUPABASE_DATABASE_MIGRATION.md) for schema, preserved local source data, transfer, and deployment connection setup.

### Environment

Copy `backend/.env.example` to `backend/.env` and set:

```env
PORT=4000
JWT_SECRET=replace-in-production
DATABASE_URL=postgres://user:password@host:5432/civicforge  # mandatory in production
PGLITE_DATA_DIR=./data/pglite                              # optional local fallback
PRIVATE_UPLOAD_DIR=./private-uploads
FILE_SIGNING_SECRET=replace-with-an-independent-random-secret
METRICS_TOKEN=replace-with-a-third-independent-random-secret
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CLAMAV_HOST=                    # optional locally; required by production compose
CLAMAV_PORT=3310
REQUIRE_MALWARE_SCANNER=false   # set true in production
DEMO_ENV=true
SEED_ON_STARTUP=true
REQUIRE_POSTGRES=false
AI_API_KEY=                           # optional
AI_API_BASE_URL=https://api.openai.com/v1 # optional OpenAI-compatible endpoint
AI_MODEL=gpt-4o-mini                  # optional
AI_EMBEDDING_MODEL=text-embedding-3-small
```

Database schemas are applied when the API starts. Relational synthetic data is seeded only when `DEMO_ENV=true` or `SEED_ON_STARTUP=true`; production does not silently introduce demonstration records. The schema includes organization memberships and indexes for project teams, mentors, tasks, matches, and access-control queries.

## Demo accounts

Every demo account uses password `Demo@12345`.

| Email | Role |
| --- | --- |
| citizen@demo.in | Citizen |
| citizen2@demo.in | Citizen |
| gov@demo.in | Government / Panchayat-ULB |
| uniadmin@demo.in | University Admin |
| faculty@demo.in | Faculty / Mentor |
| student@demo.in | Student |
| student2@demo.in | Student |
| industry@demo.in | Industry / CSR |
| admin@demo.in | System Admin |

Server-side authorization is enforced in addition to protected frontend routes. Citizens only see their own restricted reports; students see projects and tasks assigned to them; faculty see mentored projects; university admins see their institution's work; and sensitive challenge details stay restricted to authorized roles.

## Golden Demo

1. Sign in as `admin@demo.in`, open Settings, and choose **Reset Golden Demo** to restore the irrigation challenge at the human-validation step. The reset retains unrelated data.
2. Sign in as `citizen@demo.in` to inspect the saved report, persisted Demo AI analysis, related-report candidates, transparent priority score, and tracking timeline.
3. Sign in as `gov@demo.in`; validate the challenge, cluster related reports, generate recommendations, and approve a university match.
4. Sign in as `uniadmin@demo.in`; accept the match, create the project, add the student and mentor, and assign a task.
5. Sign in as `student@demo.in`; move the assigned task to review and submit IRL evidence.
6. Sign in as `faculty@demo.in`; approve that IRL evidence.
7. Sign in as `industry@demo.in`; create a support offer. Offers do not imply guaranteed funding.
8. Return as University Admin to approve collaboration, advance the permitted lifecycle stage, plan the pilot, and record predicted impact.
9. Government tracking and dashboard values update directly from the same database records.

`admin@demo.in` can use **Reset Golden Demo**. It resets the predefined irrigation workflow while retaining unrelated records and related similarity reports.

## API highlights

- `/api/auth`: registration, login, current user, demo accounts.
- `/api/challenges`: reports, evidence uploads, analysis, duplicate review, validation, tracking, comments, and map GeoJSON.
- `/api/clusters`: systemic clusters and explainable university matching.
- `/api/projects`: scoped project lists, university team workspace, student tasks, faculty reviews, industry collaborations and recommendations, tracking, documents, team, mentors, tasks, IRL evidence/reviews, lifecycle, prototypes, testing, offers, pilots, impact, and threaded messages.
- `/api/admin`: user/role management, configurable scoring settings, searchable catalog, audit log, and Golden Demo reset.

## Commands

```bash
npm run typecheck  # frontend and backend TypeScript checks
npm test           # compiled Node test suite
npm run build      # backend and frontend production builds
npm run dev        # local API and Vite frontend
npm run test:e2e   # Playwright role/workflow browser suite
npm run backup     # managed database dump or timestamped isolated PGlite backup
npm run prod:prepare       # generate strong local secret files without printing values
npm run prod:validate      # fail-fast validation for production secrets/services
npm run restore:drill:local # create, restore, and compare an isolated local backup
npm run security:audit     # dependency vulnerability audit for all packages
```

## Secure evidence storage

Evidence is stored outside the public web root. Every download URL is HMAC-signed, expires after five minutes, and is still checked against the requesting user's challenge/project access. Uploads are size- and MIME-restricted, checked against file signatures, screened for the EICAR test signature, and can be scanned through ClamAV using its `INSTREAM` protocol. Production deployment sets `REQUIRE_MALWARE_SCANNER=true`; an unavailable scanner then fails closed.

## Monitoring, backup, and deployment

- `/api/health/live` is the process liveness endpoint.
- `/api/health/ready` verifies database readiness.
- `/api/admin/metrics` provides authenticated operational business counts. `/internal/metrics` exposes bearer-protected Prometheus process/request metrics only on the internal container network and is blocked at the public edge.
- API requests emit privacy-limited structured JSON logs with request IDs, route groups, status codes, and duration. An optional secret-backed HTTPS log sink is supported.
- `compose.production.yml` uses Supabase managed PostgreSQL, Caddy automatic HTTPS, nginx, the Express API, ClamAV, Prometheus, Alertmanager, scheduled encrypted Restic backups, and an isolated restore-drill tool. Only Caddy publishes host ports.
- The official ClamAV container persists its signed definition database and runs FreshClam updates. Uploads fail closed when the scanner is unavailable.
- Production PostgreSQL dumps and private uploads are encrypted by Restic and sent to the configured S3-compatible off-host repository with daily/weekly/monthly retention.
- Prometheus rules alert on API availability, server-error rate, latency, memory, and failed or stale encrypted backups. Alertmanager sends to an operator-owned HTTPS webhook loaded from a secret file.
- `.github/workflows/ci.yml` verifies code, builds, browser tests, and production Compose structure. `.github/workflows/security.yml` adds dependency audit, CodeQL, and scheduled/manual OWASP ZAP baseline scanning.
- See [Production runbook](docs/PRODUCTION_RUNBOOK.md), [security policy](SECURITY.md), and [independent penetration-test scope](docs/PENETRATION_TEST_SCOPE.md).

## Verified checks

- Frontend and backend type checks and production builds
- Deterministic AI and lifecycle unit tests
- Isolated API acceptance test covering authentication, information requests, tracking, map filters, admin CRUD, private files, industry requests, and metrics
- Backend migration and seed on fresh PGlite
- Shared-record Golden Demo API flow: citizen → AI → government → university → student → faculty → industry → lifecycle → impact → dashboard
- Admin-only Golden Demo reset
- Browser checks for university opportunities/team, student tasks, and faculty review states
- Playwright browser journeys for citizen information response, university partner/search workflow, and government map intelligence
- Internal security review fixed industry project-access and sensitive challenge-tracking authorization gaps
- Dependency audit reported no known vulnerabilities at the configured threshold on 22 September 2026
- Local backup restoration exercise reproduced `9 users`, `14 challenges`, and `1 project` from an isolated snapshot

## Deployment notes and limitations

The selected demo hosting path is [Render backend + Vercel frontend](docs/RENDER_VERCEL_DEPLOYMENT.md). `render.yaml` proposes a new API/backup service with a persistent disk and a private ClamAV service. Review its paid resource costs before applying it. Existing CodeCivic deployments are separate and must not be repointed. The frontend uses `CIVICFORGE_API_ORIGIN` for its API proxy; Render uses `ALLOWED_ORIGINS` for the actual Vercel origin. The new public URLs have not been allocated or verified.

For the database transfer and encrypted connection setup, follow [the Supabase database migration guide](docs/SUPABASE_DATABASE_MIGRATION.md). For production deployment, follow [the production runbook](docs/PRODUCTION_RUNBOOK.md). Demo AI results and data must remain visibly labelled. PGlite is reserved for explicitly isolated tests; production does not use it.

External go-live gates remain: migrate and verify the local synthetic records into Supabase, provide the database CA certificate and private deployment credentials, configure the off-host Restic repository, DNS, and alert webhook, complete the production-format restore drill, and have an independent assessor complete and retest the penetration-test scope. Private uploads use a persistent Docker volume and encrypted off-host backup in the single-host deployment; horizontally scaled production should replace that adapter with encrypted object storage. Institution deletion is deliberately blocked when linked records exist.

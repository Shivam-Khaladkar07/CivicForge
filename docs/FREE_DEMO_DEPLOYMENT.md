# CivicForge synthetic-data demo: Vercel frontend + external API

The selected hosting path is now **Render backend + Vercel frontend**. Follow [the Render/Vercel guide](RENDER_VERCEL_DEPLOYMENT.md). Keeping the current private-upload and ClamAV design on Render requires paid services; the original free VPS option below is an alternative, not the active setup.

This is a demo deployment path, not approval to process real citizen data. Keep `DEMO_ENV=true`, use an isolated database containing synthetic records only, and do not expose operational government data to the shared-password demo accounts.

## Service layout

- Vercel serves `frontend/` over HTTPS. The project root directory is `frontend`; build command is `npm run build`; output directory is `dist`.
- `frontend/vercel.mjs` forwards `/api/*` to `CIVICFORGE_API_ORIGIN` and sends React deep links to `index.html`. A frontend build without a valid HTTPS API origin fails intentionally.
- The Express API, ClamAV scanner, persistent upload volume, backup service, and Caddy run on a separate Linux host. The current production Compose file is container-oriented; it does not run inside Vercel.
- PostgreSQL and encrypted off-host backups may use separate providers. Confirm each provider's limits, backup policy, and data-handling terms before creating resources.

## Required order

1. Provision and validate an ARM64-compatible host, PostgreSQL, backup storage, and a publicly trusted HTTPS API hostname. An IP address alone must not be assumed to provide browser-trusted TLS.
2. Configure backend secrets locally on the host. Never put database credentials, JWT keys, or storage keys into Vercel frontend environment variables.
3. Start the backend stack and verify `/api/health/ready`, login, challenge submission, signed uploads, and the Golden Demo against the remote database.
4. Create a Vercel project for `frontend/`. Set `CIVICFORGE_API_ORIGIN` to the backend's HTTPS origin for both Preview and Production. Set backend `ALLOWED_ORIGINS` to the exact Vercel production URL and any preview URL used for testing.
5. Deploy a Preview, verify all role journeys through the Vercel URL, then promote or deploy Production. Confirm a direct browser refresh on protected routes works.

The Vercel project is only the frontend. A successful static build is not evidence that the API, uploads, database, backup, or malware scanning work. Do not call the deployment complete until the full workflow is verified through the public URL.

## Free-tier caveats

Oracle Always Free capacity may be unavailable in a chosen region. Supabase Free may pause for inactivity and does not include automatic backups or point-in-time recovery. R2 free allowances apply to Standard storage and can be exceeded. Vercel Hobby is limited to personal, non-commercial use. Treat this arrangement as a synthetic SIH demonstration, not the production configuration described in `PRODUCTION_RUNBOOK.md`.

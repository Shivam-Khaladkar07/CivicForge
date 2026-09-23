# CivicForge security policy

## Reporting a vulnerability

Do not include personal data, credentials, access tokens, or uploaded evidence in a public issue. Send reports through the private security-reporting channel configured by the deployment operator. Include the affected route, role, reproduction steps, impact, and a minimal proof of concept.

## Production security baseline

- Managed PostgreSQL is mandatory in production; embedded-database fallback fails closed.
- JWT, file-signing, metrics, backup, database, and alerting secrets are loaded from mounted secret files.
- API authorization is enforced server-side, including sensitive challenges and organization-scoped project access.
- Evidence is private, signature-checked, malware-scanned, authorization-checked, and delivered through short-lived signed links.
- HTTPS, HSTS, CSP, restrictive browser headers, request limits, authentication throttling, structured logs, metrics, and alert rules are included in the production stack.
- Encrypted Restic backups cover PostgreSQL dumps and private uploads. The restore command refuses the production database and requires a restore/test/drill database name.
- Dependency audit, CodeQL, API acceptance tests, browser tests, and a scheduled OWASP ZAP baseline are defined in CI.

## Independent assessment requirement

The repository's automated checks and internal security review are not an independent penetration test. Before handling real citizen data, commission an assessor who is organizationally independent from the CivicForge implementation team. The recommended scope is documented in `docs/PENETRATION_TEST_SCOPE.md`. Critical and high findings must be remediated and retested before launch.

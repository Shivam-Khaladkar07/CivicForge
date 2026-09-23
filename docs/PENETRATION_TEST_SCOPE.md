# Independent penetration-test scope

## Objective

Assess CivicForge as an authenticated, multi-role GovTech platform before it handles real citizen or institutional information. Testing must occur in a dedicated staging environment containing synthetic data only.

## In scope

- Public React application, Express REST API, Caddy/nginx edge configuration, managed PostgreSQL integration, private evidence storage, and malware-scanning workflow.
- Registration, login, JWT lifecycle, logout behavior, rate limits, and inactive-user handling.
- Every role boundary: Citizen, Government, University Admin, Faculty, Student, Industry, and System Admin.
- Object-level authorization for challenges, sensitive citizen fields, clusters, projects, team records, audit history, notifications, offers, and signed evidence downloads.
- Upload parsing, MIME/signature validation, filename handling, malware-scanner failure behavior, signed-link expiry, and unauthorized document access.
- Injection, stored/reflected DOM XSS, CSRF assumptions, SSRF, request smuggling, CORS, CSP, host-header handling, cache behavior, and error leakage.
- Golden Demo reset isolation, workflow transition authorization, AI fallback records, audit integrity, and configuration endpoints.
- Container exposure, TLS configuration, secret handling, PostgreSQL transport security, backup repository access, monitoring endpoints, and alerting interfaces.

## Required test accounts

Use dedicated synthetic staging accounts for every role. Never test against production citizen data. The assessor should receive a second set of low-privilege accounts to test horizontal access between users of the same role.

## Rules of engagement

- Written authorization, target hostnames, source IPs, test window, emergency contacts, and stop conditions are required.
- Denial-of-service, destructive database operations, persistence, social engineering, and malware beyond the EICAR test string are excluded unless separately approved.
- Findings must include severity, affected asset, reproducible steps, evidence, impact, and remediation guidance.
- Critical and high findings require remediation and independent retesting. The final report and retest letter must be retained with the go-live approval record.

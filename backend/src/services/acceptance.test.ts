import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = 4197;
const base = `http://127.0.0.1:${port}`;

async function waitForApi() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health/ready`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Acceptance API did not become ready");
}

async function login(email: string) {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Demo@12345" }) });
  assert.equal(response.status, 200);
  return (await response.json() as { token: string }).token;
}

async function request<T>(pathName: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}${pathName}`, { ...init, headers });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  assert.ok(response.ok, `${init.method || "GET"} ${pathName}: ${response.status} ${body.error || ""}`);
  return body;
}

async function rawRequest(pathName: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  return fetch(`${base}${pathName}`, { ...init, headers });
}

test("production-readiness API journey persists workflows and protects files", { timeout: 90_000 }, async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "civicforge-acceptance-"));
  let server: ChildProcess | undefined;
  try {
    const serverOptions = {
      cwd: path.resolve("."),
      env: { ...process.env, PORT: String(port), PGLITE_DATA_DIR: path.join(tempRoot, "db"), PRIVATE_UPLOAD_DIR: path.join(tempRoot, "uploads"), JWT_SECRET: "acceptance-secret", FILE_SIGNING_SECRET: "acceptance-file-secret", METRICS_TOKEN: "acceptance-metrics-token-000000000000000000000000", DEMO_ENV: "true", REQUIRE_MALWARE_SCANNER: "false", AI_API_KEY: "" },
      stdio: "ignore" as const,
    };
    // Never inherit a developer's managed database or secret-file connection.
    Object.assign(serverOptions.env, { DATABASE_URL: "", DATABASE_URL_FILE: "", DB_PROVIDER: "pglite", REQUIRE_POSTGRES: "false", NODE_ENV: "test" });
    server = spawn(process.execPath, [path.resolve("dist/index.js")], serverOptions);
    await waitForApi();

    const [admin, citizen, citizen2, government, university, industry] = await Promise.all([
      login("admin@demo.in"), login("citizen@demo.in"), login("citizen2@demo.in"), login("gov@demo.in"), login("uniadmin@demo.in"), login("industry@demo.in"),
    ]);

    const reset = await request<{ challenge_id: string }>("/api/admin/demo/reset", admin, { method: "POST" });
    assert.ok(reset.challenge_id);
    await request(`/api/challenges/${reset.challenge_id}/validate`, government, { method: "POST", body: JSON.stringify({ decision: "needs_information", note: "Please confirm how many villages share the affected feeder." }) });
    const response = await request<{ status: string }>(`/api/challenges/${reset.challenge_id}/respond`, citizen, { method: "POST", body: JSON.stringify({ response: "Four nearby villages use the same feeder and experience evening voltage drops." }) });
    assert.equal(response.status, "validation_pending");

    const tracking = await request<{ steps: { key: string }[] }>(`/api/challenges/${reset.challenge_id}/tracking`, citizen);
    assert.ok(tracking.steps.some((step) => step.key === "impact"));
    const map = await request<{ features: unknown[]; district_summaries: unknown[] }>("/api/challenges/geojson?district=Giridih&severity=4", government);
    assert.ok(map.features.length > 0);
    assert.ok(map.district_summaries.length > 0);
    const search = await request<{ industries: unknown[]; faculty: unknown[]; technologies: unknown[] }>("/api/search?q=solar", university);
    assert.ok(Array.isArray(search.technologies));
    const adminSearchDenied = await rawRequest("/api/admin/search?q=irrigation", citizen2);
    assert.equal(adminSearchDenied.status, 403);

    const domain = await request<{ id: string }>("/api/admin/domains", admin, { method: "POST", body: JSON.stringify({ slug: "acceptance_domain", name: "Acceptance Domain" }) });
    await request(`/api/admin/domains/${domain.id}`, admin, { method: "PUT", body: JSON.stringify({ name: "Acceptance Domain Updated" }) });
    await request(`/api/admin/domains/${domain.id}`, admin, { method: "DELETE" });

    const evidence = new FormData();
    evidence.append("file", new Blob(["%PDF-1.4\nCivicForge acceptance evidence\n%%EOF"], { type: "application/pdf" }), "evidence.pdf");
    const uploaded = await request<{ url: string; scan_status: string }>(`/api/challenges/${reset.challenge_id}/media`, citizen, { method: "POST", body: evidence });
    assert.equal(uploaded.scan_status, "basic_signature_scan");
    const download = await fetch(`${base}${uploaded.url}`, { headers: { Authorization: `Bearer ${citizen}` } });
    assert.equal(download.status, 200);
    const denied = await fetch(`${base}${uploaded.url}`);
    assert.equal(denied.status, 401);

    const opportunities = await request<{ data: { project_id: string; partner_id: string; partner_kind: string }[] }>("/api/projects/industry-opportunities", university);
    const partner = opportunities.data.find((item) => item.partner_kind === "csr") || opportunities.data[0];
    assert.ok(partner);
    const unrelatedRead = await rawRequest(`/api/projects/${partner.project_id}`, industry);
    assert.equal(unrelatedRead.status, 403);
    const industryRequest = await request<{ id: string }>(`/api/projects/${partner.project_id}/industry-requests`, university, { method: "POST", body: JSON.stringify({ partner_kind: partner.partner_kind, partner_id: partner.partner_id, request_type: "technology", message: "Please review technology support for the project pilot and testing plan." }) });
    const inbound = await request<{ data: { id: string }[] }>("/api/projects/workspace/industry-requests", industry);
    assert.ok(inbound.data.some((item) => item.id === industryRequest.id));
    await request(`/api/projects/${partner.project_id}/industry-requests/${industryRequest.id}/decision`, industry, { method: "POST", body: JSON.stringify({ status: "accepted", response_note: "Available for a scoped technical discussion." }) });
    const relatedRead = await rawRequest(`/api/projects/${partner.project_id}`, industry);
    assert.equal(relatedRead.status, 200);

    await request(`/api/challenges/${reset.challenge_id}/validate`, government, {
      method: "POST",
      body: JSON.stringify({ decision: "validated", note: "Validated with restricted citizen details.", is_sensitive: true }),
    });
    const sensitiveTracking = await rawRequest(`/api/challenges/${reset.challenge_id}/tracking`, citizen2);
    assert.equal(sensitiveTracking.status, 403);
    const publicRelated = await fetch(`${base}/api/public/challenges`);
    assert.equal(publicRelated.status, 200);
    const relatedList = await publicRelated.json() as { data: { id: string; title: string }[] };
    const visibleRelated = relatedList.data.find((item) => item.title.includes("Borewell pump trips"));
    assert.ok(visibleRelated);
    const similar = await request<{ data: { challenge_id: string }[] }>(`/api/challenges/${visibleRelated.id}/similar`, citizen2);
    assert.ok(!similar.data.some((item) => item.challenge_id === reset.challenge_id));

    const metrics = await request<{ database: { challenges: string } }>("/api/admin/metrics", admin);
    assert.ok(Number(metrics.database.challenges) > 0);
    const publicMetrics = await fetch(`${base}/internal/metrics`);
    assert.equal(publicMetrics.status, 404);
    const protectedMetrics = await fetch(`${base}/internal/metrics`, { headers: { Authorization: "Bearer acceptance-metrics-token-000000000000000000000000" } });
    assert.equal(protectedMetrics.status, 200);
    assert.match(await protectedMetrics.text(), /civicforge_http_requests_total/);

    const priorityWeights = { population: 0.1, urgency: 0.3, recurrence: 0.15, evidence: 0.1, geographic_spread: 0.1, validation: 0.15, strategic: 0.1 };
    const matchWeights = { category: 0.3, expertise: 0.3, labs: 0.15, location: 0.1, previous: 0.1, availability: 0.05 };
    await request("/api/admin/settings/priority_weights", admin, { method: "PUT", body: JSON.stringify({ value: priorityWeights }) });
    await request("/api/admin/settings/match_weights", admin, { method: "PUT", body: JSON.stringify({ value: matchWeights }) });
    const stopped = new Promise<void>((resolve) => server!.once("exit", () => resolve()));
    server.kill();
    await stopped;
    server = spawn(process.execPath, [path.resolve("dist/index.js")], {
      ...serverOptions,
      env: { ...serverOptions.env, INTERNAL_METRICS_PORT: "4198" },
    });
    await waitForApi();
    const renderPublicMetrics = await fetch(`${base}/internal/metrics`, { headers: { Authorization: "Bearer acceptance-metrics-token-000000000000000000000000" } });
    assert.equal(renderPublicMetrics.status, 404);
    assert.equal((await fetch("http://127.0.0.1:4198/internal/metrics")).status, 404);
    const privateMetrics = await fetch("http://127.0.0.1:4198/internal/metrics", { headers: { Authorization: "Bearer acceptance-metrics-token-000000000000000000000000" } });
    assert.equal(privateMetrics.status, 200);
    assert.match(await privateMetrics.text(), /civicforge_http_requests_total/);
    const restartedAdmin = await login("admin@demo.in");
    const settings = await request<{ data: { key: string; value_json: string }[] }>("/api/admin/settings", restartedAdmin);
    assert.deepEqual(JSON.parse(settings.data.find((item) => item.key === "priority_weights")!.value_json), priorityWeights);
    assert.deepEqual(JSON.parse(settings.data.find((item) => item.key === "match_weights")!.value_json), matchWeights);
  } finally {
    server?.kill();
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

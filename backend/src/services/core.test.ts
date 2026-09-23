import test from "node:test";
import assert from "node:assert/strict";
import { DemoAIProvider } from "../ai/demoProvider.js";
import { assertTransition, irlLabel, stageToSuggestedIrl } from "./lifecycle.js";
import { internalMetricsPort, validateProductionConfiguration } from "../config.js";

test("Golden Demo AI classification is deterministic and explainable", async () => {
  const provider = new DemoAIProvider();
  const result = await provider.classify("Irrigation pumps stop due to voltage fluctuations and crops miss watering.");
  assert.equal(result.categorySlug, "agriculture");
  assert.equal(result.secondarySlug, "energy");
  assert.ok(result.skills.includes("Electrical Engineering"));
  assert.ok(result.skills.includes("Agricultural Engineering"));
  assert.ok(result.skills.includes("IoT"));
  assert.ok(result.technologies.includes("voltage stabilizer"));
});

test("project lifecycle permits only the next stage", () => {
  assert.doesNotThrow(() => assertTransition("proposal", "prototype"));
  assert.throws(() => assertTransition("proposal", "pilot"), /Cannot move/);
  assert.equal(stageToSuggestedIrl("pilot"), 5);
  assert.equal(irlLabel(5), "IRL-5 Community Pilot");
});

test("Render deployment rejects plaintext database connections and public metrics port reuse", () => {
  const before = { ...process.env };
  try {
    for (const name of ["DATABASE_URL", "JWT_SECRET", "FILE_SIGNING_SECRET", "METRICS_TOKEN"]) delete process.env[`${name}_FILE`];
    Object.assign(process.env, {
      NODE_ENV: "production", REQUIRE_DATABASE_TLS: "true", REQUIRE_MALWARE_SCANNER: "true",
      ALLOWED_ORIGINS: "https://frontend.example.invalid", JWT_SECRET: "j".repeat(48),
      FILE_SIGNING_SECRET: "s".repeat(48), METRICS_TOKEN: "m".repeat(48),
      DATABASE_URL: "postgresql://test:test@db.example.invalid/demo",
    });
    assert.throws(validateProductionConfiguration, /must require TLS/);
    process.env.DATABASE_URL += "?sslmode=require";
    assert.doesNotThrow(validateProductionConfiguration);
    process.env.INTERNAL_METRICS_PORT = "10000";
    assert.throws(() => internalMetricsPort(10000), /different from PORT/);
    process.env.INTERNAL_METRICS_PORT = "9090";
    assert.equal(internalMetricsPort(10000), 9090);
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in before)) delete process.env[name];
    Object.assign(process.env, before);
  }
});

import { expect, test, type Page } from "@playwright/test";

async function demoLogin(page: Page, accountName: string) {
  page.on("pageerror", (error) => console.error(`Browser page error: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") console.error(`Browser console error: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 400) console.error(`Browser HTTP ${response.status()}: ${response.url()}`); });
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(accountName, "i") }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\/|$)/);
  await expect(page.getByText("Demo Environment", { exact: false }).first()).toBeVisible();
}

test("citizen answers a government information request and tracking updates", async ({ page, request }) => {
  const login = async (email: string) => {
    const response = await request.post("/api/auth/login", { data: { email, password: "Demo@12345" } });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).token as string;
  };
  const admin = await login("admin@demo.in");
  const government = await login("gov@demo.in");
  const reset = await request.post("/api/admin/demo/reset", { headers: { Authorization: `Bearer ${admin}` } });
  const challengeId = (await reset.json()).challenge_id as string;
  const validation = await request.post(`/api/challenges/${challengeId}/validate`, { headers: { Authorization: `Bearer ${government}` }, data: { decision: "needs_information", note: "Confirm the number of villages using this feeder." } });
  expect(validation.ok()).toBeTruthy();

  await demoLogin(page, "Sunita Devi");
  await page.goto(`/citizen/challenges/${challengeId}`);
  await expect(page.getByText("Government requested more information")).toBeVisible();
  await page.getByLabel("Response to information request").fill("Four villages use this feeder and all report evening voltage drops.");
  await page.getByRole("button", { name: "Send response for validation" }).click();
  await expect(page.getByText("returned to the validation queue", { exact: false })).toBeVisible();
  await expect(page.getByRole("list", { name: "CivicForge journey status" }).getByText("Human validation", { exact: true })).toBeVisible();
});

test("university sees partner recommendations and all search result types", async ({ page }) => {
  await demoLogin(page, "Prof. N. Sinha");
  await expect(page.getByRole("heading", { name: "Industry and CSR opportunities" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request support" }).first()).toBeVisible();
  const search = page.getByLabel("Search CivicForge");
  await search.fill("fluoride");
  await expect(page.getByText(/technology/i).first()).toBeVisible();
});

test("government map filters and district summaries render", async ({ page }) => {
  await demoLogin(page, "Asha Kujur");
  await page.goto("/government/map");
  await page.getByLabel("District").selectOption("Giridih");
  await page.getByLabel("Minimum severity").selectOption("4");
  await expect(page.getByRole("heading", { name: "Giridih" }).first()).toBeVisible();
  await expect(page.getByText(/high severity/).first()).toBeVisible();
});

test("login hides demo credentials when Demo Mode is disabled", async ({ page }) => {
  await page.route("**/api/auth/demo-accounts", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Demo accounts are disabled." }) }));
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Demo@12345")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Demo accounts" })).toHaveCount(0);
});

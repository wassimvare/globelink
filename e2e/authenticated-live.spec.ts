import { expect, test, type Page } from "@playwright/test";

type TestAccount = { label: string; email?: string; password?: string };

const accounts: TestAccount[] = [
  { label: "A", email: process.env.E2E_USER_A_EMAIL, password: process.env.E2E_USER_A_PASSWORD },
  { label: "B", email: process.env.E2E_USER_B_EMAIL, password: process.env.E2E_USER_B_PASSWORD },
];

const protectedRoutes = [
  "/trips",
  "/match",
  "/messages",
  "/notifications",
  "/settings",
  "/activity",
  "/dashboard",
  "/achievements",
  "/intelligence",
];

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function login(page: Page, account: TestAccount) {
  if (!account.email || !account.password) throw new Error(`Identifiants E2E compte ${account.label} absents`);
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  const submit = page.locator('form button[type="submit"]').first();
  await submit.click();
  await expect(page).not.toHaveURL(/\/auth(?:\?|$)/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/verify-email(?:\?|$)/);
}

const liveEnabled = accounts.every((account) => account.email && account.password);

test.describe("Phase 3 — parcours authentifiés live", () => {
  test.skip(!liveEnabled, "Configure E2E_USER_A/B_EMAIL et E2E_USER_A/B_PASSWORD dans GitHub Actions.");

  for (const account of accounts) {
    test(`compte ${account.label}: connexion, navigation privée et persistance de session`, async ({ page }) => {
      const errors = watchPageErrors(page);
      await login(page, account);

      for (const route of protectedRoutes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);
        await expect(page.locator("body")).toBeVisible();
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);
      expect(errors).toEqual([]);
    });
  }

  test("deux comptes réels restent isolés entre deux contextes navigateur", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await Promise.all([login(pageA, accounts[0]), login(pageB, accounts[1])]);
    await Promise.all([
      pageA.goto("/messages", { waitUntil: "domcontentloaded" }),
      pageB.goto("/messages", { waitUntil: "domcontentloaded" }),
    ]);

    await expect(pageA).not.toHaveURL(/\/auth(?:\?|$)/);
    await expect(pageB).not.toHaveURL(/\/auth(?:\?|$)/);
    const storageA = await contextA.storageState();
    const storageB = await contextB.storageState();
    expect(JSON.stringify(storageA)).not.toEqual(JSON.stringify(storageB));

    await contextA.close();
    await contextB.close();
  });
});

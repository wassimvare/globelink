import { expect, test, type Page, type TestInfo } from "@playwright/test";

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

function isMobileProject(testInfo: TestInfo) {
  return testInfo.project.name === "android-chromium" || testInfo.project.name === "iphone-webkit";
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <=
          document.documentElement.clientWidth + 2,
      ),
    )
    .toBe(true);
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
    test(`compte ${account.label}: connexion, navigation privée et persistance de session`, async ({ page }, testInfo) => {
      const errors = watchPageErrors(page);
      await login(page, account);

      for (const route of protectedRoutes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);
        await expect(page.locator("body")).toBeVisible();
        await expectNoHorizontalOverflow(page);
        if (isMobileProject(testInfo)) {
          await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
        }
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);
      expect(errors).toEqual([]);
    });
  }


  test("mobile authentifié: Voyage, Travel Match et Profil restent utilisables", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Audit réservé aux projets mobiles.");
    await login(page, accounts[0]);

    await page.goto("/trips", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Nouveau voyage" })).toBeVisible();
    await page.getByRole("button", { name: "Nouveau voyage" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const dialogFits = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= -1 &&
        rect.right <= window.innerWidth + 1 &&
        rect.top >= -1 &&
        rect.bottom <= window.innerHeight + 1
      );
    });
    expect(dialogFits).toBe(true);
    await page.keyboard.press("Escape");
    await expectNoHorizontalOverflow(page);

    await page.goto("/match", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);
    await expectNoHorizontalOverflow(page);
    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const profileLink = page.getByRole("link", { name: "Profil", exact: true });
    await expect(profileLink).toBeVisible();
    await expect
      .poll(async () => (await profileLink.getAttribute("href")) ?? "")
      .toMatch(/^\/(?:profile\/|settings\/profile)/);
    await profileLink.click();
    await expect(page).not.toHaveURL(/\/auth(?:\?|$)/);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

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

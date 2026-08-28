import { expect, test, type Page } from "@playwright/test";

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
}

test("l'accueil GlobeLink s'affiche sans erreur navigateur", async ({ page }) => {
  const pageErrors = watchPageErrors(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveTitle(/GlobeLink/i);
  await expect(page.getByLabel("Accueil GlobeLink")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(pageErrors).toEqual([]);
});

test("Explorer charge la carte sans casser l'application", async ({ page }) => {
  const pageErrors = watchPageErrors(page);
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveTitle(/Carte du monde.*GlobeLink/i);
  await expect(page.getByLabel("Accueil GlobeLink")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(pageErrors).toEqual([]);
});

test("un visiteur non connecté est redirigé vers la connexion pour Voyage", async ({ page }) => {
  await page.goto("/trips", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/auth(?:\?[^#]*)?$/);
  await expect(page).toHaveTitle(/Connexion.*GlobeLink/i);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("un visiteur non connecté est redirigé vers la connexion pour Travel Match", async ({ page }) => {
  await page.goto("/match", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/auth(?:\?[^#]*)?$/);
  await expect(page).toHaveTitle(/Connexion.*GlobeLink/i);
});

test("les principales destinations publiques restent accessibles", async ({ page }) => {
  const pageErrors = watchPageErrors(page);
  await page.goto("/destinations", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveTitle(/GlobeLink/i);
  await expect(page.getByLabel("Accueil GlobeLink")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(pageErrors).toEqual([]);
});

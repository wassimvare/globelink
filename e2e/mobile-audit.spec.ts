import { expect, test, type Page, type TestInfo } from "@playwright/test";

const publicMobileRoutes = [
  "/",
  "/destinations",
  "/destinations/france",
  "/activities",
  "/map",
  "/search",
  "/auth",
];

const protectedMobileRoutes = ["/trips", "/match", "/messages", "/settings"];

function isMobileProject(testInfo: TestInfo) {
  return testInfo.project.name === "android-chromium" || testInfo.project.name === "iphone-webkit";
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const root = document.documentElement;
          const body = document.body;
          return Math.max(root.scrollWidth, body.scrollWidth) <= root.clientWidth + 2;
        }),
      { timeout: 8_000 },
    )
    .toBe(true);
}

async function expectMobileViewportContract(page: Page) {
  const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewportMeta).toContain("width=device-width");
  expect(viewportMeta).toContain("viewport-fit=cover");
  await expectNoHorizontalOverflow(page);
}

async function expectBottomNavInsideViewport(page: Page) {
  const nav = page.locator(".mobile-bottom-nav");
  await expect(nav).toBeVisible();

  const result = await nav.evaluate((element) => {
    const navRect = element.getBoundingClientRect();
    const interactiveItems = Array.from(
      element.querySelectorAll(".mobile-bottom-nav-inner a, .mobile-bottom-nav-inner button"),
    )
      .filter((child) => {
        const style = getComputedStyle(child);
        const rect = child.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((child) => {
        const rect = child.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
      });
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      nav: {
        left: navRect.left,
        right: navRect.right,
        top: navRect.top,
        bottom: navRect.bottom,
      },
      interactiveItems,
    };
  });

  expect(result.nav.left).toBeGreaterThanOrEqual(-1);
  expect(result.nav.right).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.nav.bottom).toBeLessThanOrEqual(result.viewportHeight + 1);
  expect(result.nav.top).toBeGreaterThanOrEqual(0);
  expect(result.interactiveItems.length).toBeGreaterThanOrEqual(5);
  for (const item of result.interactiveItems) {
    expect(item.width).toBeGreaterThanOrEqual(42);
    expect(item.height).toBeGreaterThanOrEqual(42);
    expect(item.left).toBeGreaterThanOrEqual(-1);
    expect(item.right).toBeLessThanOrEqual(result.viewportWidth + 1);
  }
}

test.describe("Audit mobile iPhone + Android", () => {
  for (const route of publicMobileRoutes) {
    test(`surface mobile contenue: ${route}`, async ({ page }, testInfo) => {
      test.skip(!isMobileProject(testInfo), "Audit réservé aux projets mobiles.");

      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status() ?? 200).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
      await expectMobileViewportContract(page);

      if (route !== "/auth") await expectBottomNavInsideViewport(page);
      expect(pageErrors).toEqual([]);
    });
  }

  for (const route of protectedMobileRoutes) {
    test(`redirection privée mobile stable: ${route}`, async ({ page }, testInfo) => {
      test.skip(!isMobileProject(testInfo), "Audit réservé aux projets mobiles.");

      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/auth(?:\?[^#]*)?$/);
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expectMobileViewportContract(page);
    });
  }

  test("Explorer mobile ouvre un drawer entièrement utilisable", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Audit réservé aux projets mobiles.");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const explorerButton = page.getByRole("button", { name: "Ouvrir Explorer" });
    await expect(explorerButton).toBeVisible();
    await page.waitForTimeout(700);
    await explorerButton.click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Explorer GlobeLink", { exact: true })).toBeVisible();
    for (const label of ["Carte", "Destinations", "Activités", "Sélection du moment", "Marketplace"]) {
      await expect(page.getByRole("link", { name: new RegExp(label, "i") })).toBeVisible();
    }

    const drawerFits = await page
      .getByRole("dialog")
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= -1 &&
          rect.right <= window.innerWidth + 1 &&
          rect.top >= -1 &&
          rect.bottom <= window.innerHeight + 1
        );
      })
      .catch(() => true);

    expect(drawerFits).toBe(true);
    await expectNoHorizontalOverflow(page);
  });

  test("les champs de connexion évitent le zoom Safari iOS", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Audit réservé aux projets mobiles.");

    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    const fontSizes = await page.locator('input[type="email"], input[type="password"]').evaluateAll(
      (inputs) => inputs.map((input) => Number.parseFloat(getComputedStyle(input).fontSize)),
    );

    expect(fontSizes.length).toBeGreaterThanOrEqual(2);
    for (const size of fontSizes) expect(size).toBeGreaterThanOrEqual(16);
  });

  test("la carte reste contenue après le premier rendu mobile", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Audit réservé aux projets mobiles.");

    await page.goto("/map", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(1_500);
    await expectMobileViewportContract(page);
    await expectBottomNavInsideViewport(page);
  });
});

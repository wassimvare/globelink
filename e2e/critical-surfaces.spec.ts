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

const publicRoutes = ["/", "/destinations", "/activities", "/map", "/search", "/auth"];
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

for (const route of publicRoutes) {
  test(`surface publique stable: ${route}`, async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });

    expect(response?.status() ?? 200).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
  });
}

for (const route of protectedRoutes) {
  test(`surface privée verrouillée sans session: ${route}`, async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    await page.goto(route, { waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(/\/auth(?:\?[^#]*)?$/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
  });
}

import { expect, test } from "@playwright/test";

test("GlobeLink IA gratuit reste lisible et distinct de IA+", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ai-trip");
  await expect(page.getByText("GlobeLink IA · Gratuit").first()).toBeVisible();
  await expect(page.getByText(/Mode gratuit/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Découvrir IA\+/ })).toBeVisible();
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("IA+ reste clairement présenté comme agent premium", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ai-pro");
  await expect(page.getByText("GlobeLink IA+").first()).toBeVisible();
  await expect(page.getByText(/vrai agent de voyage IA/i)).toBeVisible();
  await expect(page.getByText(/Carnet GlobeLink/).first()).toBeVisible();
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

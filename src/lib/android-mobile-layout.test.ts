import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileRoute = readFileSync(
  new URL("../routes/profile.$username.tsx", import.meta.url),
  "utf8",
);
const appHeader = readFileSync(new URL("../components/AppHeader.tsx", import.meta.url), "utf8");
const feedbackWidget = readFileSync(
  new URL("../components/BetaFeedbackWidget.tsx", import.meta.url),
  "utf8",
);
const themeProvider = readFileSync(new URL("theme.tsx", import.meta.url), "utf8");
const rootRoute = readFileSync(new URL("../routes/__root.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("Android mobile layout regressions", () => {
  it("collapses the empty profile banner on narrow screens", () => {
    expect(profileRoute).toContain('banner ? "h-36 sm:h-56" : "h-16 sm:h-28"');
  });

  it("keeps the profile menu visible inside the compact mobile header", () => {
    expect(appHeader).toMatch(
      /aria-label="Ouvrir le menu du profil"\s*className="grid h-10 w-10/,
    );
    expect(appHeader).toContain('className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5"');
  });

  it("keeps the floating help action compact on mobile", () => {
    expect(feedbackWidget).toContain("h-11 w-11");
    expect(feedbackWidget).toContain('className="sr-only sm:not-sr-only"');
  });

  it("synchronizes Android browser chrome with the selected theme", () => {
    expect(themeProvider).toContain("root.style.colorScheme = theme");
    expect(themeProvider).toContain("THEME_CHROME_COLORS[theme]");
    expect(rootRoute).toContain('{ name: "color-scheme", content: "light dark" }');
    expect(globalStyles).toContain("html.dark");
    expect(globalStyles).toContain("color-scheme: dark");
  });
});

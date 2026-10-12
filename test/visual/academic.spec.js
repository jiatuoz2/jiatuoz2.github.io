const { test, expect } = require("@playwright/test");
const path = require("node:path");

test("academic homepage presents real projects and keeps navigation usable", async ({ page }, testInfo) => {
  await page.goto("/al-folio/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Zou");
  await expect(page.locator(".research-feature")).toHaveCount(2);
  await expect(page.locator(".research-feature").first()).toContainText("OLIVE");
  await expect(page.locator(".profile-figure img")).toBeVisible();
  if (testInfo.project.name === "mobile") {
    const menu = page.getByRole("button", { name: "Menu" });
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("navigation").getByRole("link", { name: "Research", exact: true }).click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(page).toHaveURL(/#research$/);
  }
  // Capture the initial view after the navigation check. Load offscreen lazy
  // images explicitly so full-page screenshots represent the entire design.
  await page.goto("/al-folio/");
  await page.locator("img").evaluateAll(async (images) => {
    images.forEach((image) => {
      image.loading = "eager";
    });
    await Promise.all(images.map((image) => image.decode()));
  });
  await page.screenshot({ path: path.join("output/playwright", `academic-home-${testInfo.project.name}.png`), fullPage: true });
  await page.screenshot({ path: path.join("output/playwright", `academic-home-${testInfo.project.name}-viewport.png`) });
});

test("publication filters combine with search and recover from empty results", async ({ page }) => {
  await page.goto("/al-folio/publications/");
  const visiblePapers = page.locator(".paper:visible");
  await expect(visiblePapers).toHaveCount(5);
  await page.getByRole("button", { name: "Human–AI", exact: true }).click();
  await expect(visiblePapers).toHaveCount(2);
  const search = page.getByRole("searchbox", { name: "Search publications" });
  await search.fill("Cascade");
  await expect(visiblePapers).toHaveCount(1);
  await expect(page.getByRole("status")).toHaveText("1 publication");
  await expect(page.locator(".paper:visible .venue-badge")).toHaveText("Under review");
  await expect(page.locator(".paper:visible .paper-links a")).toHaveCount(0);
  await search.fill("no-such-paper");
  await expect(visiblePapers).toHaveCount(0);
  await expect(page.locator(".no-results")).toBeVisible();
  await expect(page.locator("h2.bibliography:visible")).toHaveCount(0);
  await search.clear();
  await page.getByRole("button", { name: "All research" }).click();
  await expect(visiblePapers).toHaveCount(5);
  await expect(page.locator(".no-results")).toBeHidden();
});

test("paper abstracts and video dialogs support keyboard close and focus return", async ({ page }) => {
  await page.goto("/al-folio/publications/");
  const olive = page.locator("#paper-li2026augmenting");
  await expect(olive.locator(".paper-authors strong")).toContainText("Charlie");
  const abstract = olive.locator("details");
  await abstract.locator("summary").click();
  await expect(abstract).toHaveAttribute("open", "");
  await expect(abstract.locator("p")).toBeVisible();
  await abstract.locator("summary").click();
  await expect(abstract).not.toHaveAttribute("open", "");
  const trigger = olive.locator(".paper-links [data-research-video]");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("video")).toHaveAttribute("src", /olive_teaser\.mp4$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".research-video-dialog video")).not.toHaveAttribute("src");
});

test("main routes load without missing assets or runtime errors", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith("http://127.0.0.1:4000") && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  for (const route of ["/al-folio/", "/al-folio/publications/", "/al-folio/cv/"]) {
    const response = await page.goto(route);
    expect(response.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await page.locator("img").evaluateAll(async (images) => {
      images.forEach((image) => {
        image.loading = "eager";
      });
      await Promise.all(images.map((image) => image.decode()));
    });
    expect(await page.locator("img").evaluateAll((images) => images.every((image) => image.naturalWidth > 0))).toBe(true);
    if (route.includes("publications"))
      await page.screenshot({ path: path.join("output/playwright", `academic-publications-${testInfo.project.name}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("responsive layout has no horizontal overflow", async ({ page }) => {
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/al-folio/", "/al-folio/publications/", "/al-folio/cv/"]) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
});

test("academic content and direct video links work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4000/al-folio/");
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
  await expect(page.locator("[data-research-video]").first()).toHaveAttribute("href", /\/al-folio\/assets\/video\/olive_teaser\.mp4$/);
  await page.getByRole("navigation").getByRole("link", { name: "Publications" }).click();
  await expect(page.locator(".paper")).toHaveCount(5);
  await expect(page.locator(".publication-tools")).toBeHidden();
  await page.locator("details summary").first().click();
  await expect(page.locator("details").first()).toHaveAttribute("open", "");
  await context.close();
});

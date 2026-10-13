const { test, expect } = require("@playwright/test");
const path = require("node:path");

test("AcadHomepage presents the profile, news, and all real publications", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".sidebar .author__name")).toContainText("Zou");
  await expect(page.locator("#about-me")).toBeVisible();
  await expect(page.locator(".news-list li")).toHaveCount(3);
  await expect(page.locator(".paper-box")).toHaveCount(5);
  await expect(page.locator("#experience, #education")).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link", { name: /^(Experience|CV)$/ })).toHaveCount(0);
  await expect(page.locator("#paper-yang2027cascade .paper-venue")).toContainText("Submitted to CHI 2027; under review.");
  await expect(page.locator(".paper-author-self")).toHaveCount(5);
  for (const author of await page.locator(".paper-author-self").all()) {
    expect(await author.evaluate((element) => Number(getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(800);
  }
  await expect(page.locator(".profile-banner")).toHaveClass(/cloth-rendered/);
  await expect(page.locator("#paper-yang2027cascade .badge")).toHaveText("Under review");
  await expect(page.locator("#paper-yang2027cascade .paper-links a")).toHaveCount(0);
  await page.locator("img").evaluateAll(async (images) => {
    images.forEach((image) => {
      image.loading = "eager";
    });
    await Promise.all(images.map((image) => image.decode()));
  });
  await page.screenshot({ path: path.join("output/playwright", `acad-home-${testInfo.project.name}.png`), fullPage: true, animations: "disabled" });
  await page.screenshot({ path: path.join("output/playwright", `acad-home-${testInfo.project.name}-viewport.png`), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("all publications share one list with animated teasers and preview/video links", async ({ page }) => {
  await page.goto("/publications/");
  await expect(page.locator(".paper-box:visible")).toHaveCount(5);
  await expect(page.locator(".publication-tools, .research-filter")).toHaveCount(0);
  await expect(page.locator(".publication-list > .paper-box")).toHaveCount(5);
  for (const [key, gif, preview, video] of [
    ["li2026augmenting", "/research/video/olive.gif", "/assets/video/olive_teaser.mp4", "/research/video/olive.mp4"],
    ["yang2026delegate", "/research/video/delegate-the-details.gif", "/assets/video/delegate_teaser.mp4", "/assets/video/delegate_teaser.mp4"],
  ]) {
    const paper = page.locator(`#paper-${key}`);
    await expect(paper.locator("img")).toHaveAttribute("src", gif);
    await expect(paper.locator(".video-trigger")).toHaveAttribute("href", preview);
    await expect(paper.getByRole("link", { name: "[Preview]", exact: true })).toHaveAttribute("href", preview);
    await expect(paper.getByRole("link", { name: "[Video]", exact: true })).toHaveAttribute("href", video);
  }
});

test("publication search matches metadata and abstracts and clears back to all papers", async ({ page }) => {
  for (const route of ["/", "/publications/"]) {
    await page.goto(route);
    const search = page.getByRole("searchbox", { name: "Search publications" });
    await expect(search).toBeVisible();
    await search.fill("oLiVe");
    await expect(page.locator(".paper-box:visible")).toHaveCount(1);
    await expect(page.locator("#paper-li2026augmenting")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("1 of 5 publications");
    await search.fill("UIST 2026");
    await expect(page.locator(".paper-box:visible")).toHaveCount(1);
    await search.fill("FEINER");
    await expect(page.locator(".paper-box:visible")).toHaveCount(5);
    await search.fill("physiological");
    await expect(page.locator(".paper-box:visible")).toHaveCount(1);
    await expect(page.locator("#paper-li2026augmenting details")).not.toHaveAttribute("open");
    await search.fill("no-such-publication");
    await expect(page.locator(".paper-box:visible")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("No publications found");
    await page.getByRole("button", { name: "Clear publication search" }).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(page.locator(".paper-box:visible")).toHaveCount(5);
    await expect(page.getByRole("status")).toBeHidden();
    await search.fill("Cascade");
    await page.keyboard.press("Enter");
    await expect(page.locator(".paper-box:visible")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".paper-box:visible")).toHaveCount(5);
  }
});

test("abstract and video interactions restore focus and stop video", async ({ page }) => {
  await page.goto("/publications/");
  const paper = page.locator("#paper-li2026augmenting");
  await expect(paper.locator(".paper-authors strong")).toHaveText("Charlie Zou*");
  const details = paper.locator("details");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).not.toHaveAttribute("open", "");
  for (const key of ["li2026augmenting", "yang2026delegate"]) {
    const entry = page.locator(`#paper-${key}`);
    for (const trigger of [
      entry.locator(".video-trigger"),
      entry.getByRole("link", { name: "[Preview]", exact: true }),
      entry.getByRole("link", { name: "[Video]", exact: true }),
    ]) {
      const source = await trigger.evaluate((link) => link.href);
      await trigger.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const player = page.locator(".research-video-dialog video");
      await expect(player).toHaveAttribute("src", source);
      await expect.poll(() => player.evaluate((video) => video.readyState)).toBeGreaterThanOrEqual(1);
      await expect.poll(() => player.evaluate((video) => video.error?.message || null)).toBeNull();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(player).not.toHaveAttribute("src");
    }
  }
});

test("native navigation and overflow menu keep links in the current tab", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "More navigation links" });
  await page.evaluate(() => document.fonts.ready);
  if (await menu.isVisible()) {
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#overflow-navigation")).not.toHaveClass(/hidden(?:\s|$)/);
  }
  await page.getByRole("navigation").getByRole("link", { name: "Publications", exact: true }).click();
  await expect(page.locator("#publications")).toBeInViewport({ ratio: 1 });
  expect(new URL(page.url()).pathname).toBe("/");
  expect(page.context().pages()).toHaveLength(1);
});

test("main pages and local links load without missing assets", async ({ page, request }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/", "/publications/", "/cv/", "/404.html"]) {
    expect((await page.goto(route)).status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    const urls = await page.locator("[href], [src]").evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute("href") || element.getAttribute("src"))
        .filter((url) => url.startsWith("/"))
        .map((url) => url.split("#")[0] || "/")
    );
    for (const url of new Set(urls)) expect((await request.head(url)).status()).toBe(200);
  }
  expect(errors).toEqual([]);
});

test("layout fits narrow phones, tablets, and desktops", async ({ page }) => {
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/publications/", "/cv/"]) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      await page.locator(".masthead").evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
      const overflow = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll("body *")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && (rect.right > window.innerWidth + 1 || rect.left < -1);
          })
          .slice(0, 12)
          .map((element) => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })),
      }));
      expect(overflow.scrollWidth, JSON.stringify({ route, ...overflow })).toBeLessThanOrEqual(width);
    }
  }
});

test("content, contacts, navigation, and abstracts work without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".paper-box")).toHaveCount(5);
  await expect(page.locator(".publication-tools")).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search publications", includeHidden: true })).toBeHidden();
  await expect(page.locator('.banner-links a[href^="mailto:"]')).toBeVisible();
  await page.locator("details summary").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("details").first()).toHaveAttribute("open", "");
  await page.getByRole("navigation").getByRole("link", { name: "Publications", exact: true }).click();
  await expect(page).toHaveURL(/\/#publications$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
